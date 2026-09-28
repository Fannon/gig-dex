import { initDB } from "../db";
import { syncHeads } from "./revisionHistory";
import {
  MAX_SYNC_FILE_BYTES,
  parseRevisionFilename,
  parseSyncFile,
  revisionFilename,
  syncEnvelope,
} from "./syncFormat";
import type { SyncMetadata, SyncProvider } from "./types";

const KEY = "local-folder";
const TRASH = ".gigdex-trash";
const digest = async (text: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
const archiveName = (name: string, version: string) => `${name.slice(0, -5)}-${version}.json`;
const missing = (error: unknown) => error instanceof DOMException && error.name === "NotFoundError";

export class LocalFolderProvider implements SyncProvider {
  name = "Local Folder";
  ready: Promise<void>;
  private handle?: FileSystemDirectoryHandle;
  private id = "";
  private granted = false;
  private versions = new Map<string, string>();
  private warning = "";
  private restoreError = "";
  constructor() {
    this.ready = this.restore().catch(() => {
      this.restoreError = "Could not restore the folder connection. Choose the folder again.";
    });
  }
  private async restore() {
    const stored = await (await initDB()).get("syncHandles", KEY);
    if (!stored) return;
    this.handle = stored.handle;
    this.id = stored.id;
    await this.refreshConnection();
  }
  isEnabled() {
    return typeof window.showDirectoryPicker === "function";
  }
  isAuthenticated() {
    return !!this.handle && this.granted;
  }
  getFolderName() {
    return this.handle?.name ?? "";
  }
  getFolderWarning() {
    return this.warning || this.restoreError;
  }
  getScope() {
    if (!this.id) throw new Error("Choose a local sync folder first.");
    return `localfolder:${this.id}`;
  }
  async refreshConnection() {
    this.granted = false;
    if (!this.handle) return;
    try {
      this.granted = (await this.handle.queryPermission({ mode: "readwrite" })) === "granted";
    } catch {
      this.restoreError = "Folder access was lost. Choose the folder again; your library is safe.";
    }
  }
  async pickFolder() {
    if (!window.showDirectoryPicker) throw new Error("Local folder sync needs desktop Chrome or Edge.");
    // Invoke the picker before awaiting storage: it requires the button's user activation.
    const pending = window.showDirectoryPicker({ mode: "readwrite", id: "gigdex-sync" });
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await pending;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      throw error;
    }
    if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted")
      throw new Error("Folder permission denied. Allow read/write access or choose another folder.");
    await this.ready;
    let same = false;
    if (this.handle) {
      try {
        same = await this.handle.isSameEntry(handle);
      } catch {
        // A stale handle must not prevent selecting a replacement.
      }
    }
    const id = same ? this.id : crypto.randomUUID();
    // Persist before switching so a storage failure leaves the previous connection usable.
    await (await initDB()).put("syncHandles", { id, handle }, KEY);
    this.handle = handle;
    this.id = id;
    this.granted = true;
    this.restoreError = "";
    this.warning = "";
    this.versions.clear();
    let unknown = 0;
    for await (const entry of handle.values())
      if (entry.kind === "file" && entry.name.endsWith(".json") && !parseRevisionFilename(entry.name)) unknown++;
    if (unknown > 10)
      this.warning = `This folder contains ${unknown} unrelated JSON files. A dedicated Gig-Dex folder is recommended; unrelated files are ignored.`;
    return true;
  }
  async authenticate() {
    if (!this.isEnabled()) throw new Error("Local folder sync needs desktop Chrome or Edge.");
    // Settings waits for ready before enabling its buttons. Request immediately on each gesture.
    if (this.handle) {
      this.granted = false;
      try {
        const permission = this.handle.requestPermission({ mode: "readwrite" });
        this.granted = (await permission) === "granted";
      } catch {
        throw new Error("Folder access was lost. Choose the folder again; your library is safe.");
      }
      if (!this.granted)
        throw new Error("Folder permission denied. Allow read/write access or choose the folder again.");
      this.restoreError = "";
      return true;
    }
    return this.pickFolder();
  }
  async logout() {
    await this.ready;
    await (await initDB()).delete("syncHandles", KEY);
    this.handle = undefined;
    this.id = "";
    this.granted = false;
    this.warning = "";
    this.restoreError = "";
    this.versions.clear();
  }
  private directory() {
    if (!this.handle || !this.granted) throw new Error("Connect your local folder with read/write access.");
    return this.handle;
  }
  private checkName(name: string) {
    if (!parseRevisionFilename(name)) throw new Error("Invalid local revision filename.");
  }
  private async read(name: string) {
    this.checkName(name);
    try {
      return await (await this.directory().getFileHandle(name)).getFile();
    } catch {
      throw new Error("Cannot read the sync folder. Check your desktop sync client or choose the folder again.");
    }
  }
  private async write(directory: FileSystemDirectoryHandle, name: string, text: string) {
    const file = await directory.getFileHandle(name, { create: true });
    const stream = await file.createWritable();
    try {
      await stream.write(text);
      await stream.close(); // Publishes the completed temporary write.
    } catch (error) {
      await stream.abort().catch(() => undefined);
      throw error;
    }
  }
  private async trash() {
    try {
      return await this.directory().getDirectoryHandle(TRASH);
    } catch (error) {
      if (missing(error)) return undefined;
      throw error;
    }
  }
  async listRevisions(): Promise<SyncMetadata[]> {
    const records: SyncMetadata[] = [];
    const versions = new Map<string, string>();
    const trash = await this.trash();
    for await (const entry of this.directory().values()) {
      const match = parseRevisionFilename(entry.name);
      if (entry.kind !== "file" || !match) continue;
      const file = await (entry as FileSystemFileHandle).getFile();
      if (file.size > MAX_SYNC_FILE_BYTES) throw new Error("A local sync file exceeds the 5 MB safety limit.");
      const text = await file.text();
      const version = await digest(text);
      if (trash) {
        try {
          const archived = await (await trash.getFileHandle(archiveName(entry.name, version))).getFile();
          if ((await archived.text()) === text) continue;
        } catch (error) {
          if (!missing(error)) throw error;
        }
      }
      let value: Record<string, unknown>;
      try {
        value = parseSyncFile(text);
      } catch (error) {
        // Recognized revision filenames must never vanish from the graph on a partial download.
        if (error instanceof SyntaxError)
          throw new Error("A local revision is incomplete. Wait for the desktop sync client, then retry.");
        throw error;
      }
      const envelope = syncEnvelope(value);
      if (
        !value ||
        typeof value.id !== "string" ||
        !value.id ||
        typeof value.lastModified !== "string" ||
        !Number.isFinite(Date.parse(value.lastModified)) ||
        envelope?.revision !== match.revision ||
        (value.deleted === true && value.type !== match.type)
      )
        throw new Error("Invalid local-folder revision. Repair the file before syncing.");
      versions.set(entry.name, version);
      records.push({
        id: value.id,
        type: match.type,
        title: typeof value.title === "string" ? value.title : typeof value.name === "string" ? value.name : "Untitled",
        lastModified: value.lastModified,
        revision: match.revision,
        parents: envelope.parents,
        formatVersion: (value._sync as { formatVersion?: number }).formatVersion ?? 0,
        remoteId: entry.name,
        version,
        uploadedAt: new Date(file.lastModified).toISOString(),
      });
    }
    this.versions = versions;
    return records;
  }
  async listFiles() {
    return syncHeads(await this.listRevisions());
  }
  async downloadFile(name: string) {
    const file = await this.read(name);
    if (file.size > MAX_SYNC_FILE_BYTES) throw new Error("A local sync file exceeds the 5 MB safety limit.");
    const text = await file.text();
    const expected = this.versions.get(name);
    if (expected && (await digest(text)) !== expected)
      throw new Error("Folder revision changed during sync. Please retry.");
    return text;
  }
  async uploadFile(metadata: SyncMetadata, content: string) {
    if (!metadata.revision) throw new Error("Invalid local revision identity.");
    const name = revisionFilename(metadata.type, metadata.revision);
    this.checkName(name);
    const dir = this.directory();
    try {
      const existing = await (await dir.getFileHandle(name)).getFile();
      if ((await existing.text()) === content) return;
      throw new Error("A different revision already uses this filename. Sync again.");
    } catch (error) {
      if (!missing(error)) throw error;
    }
    await this.write(dir, name, content);
  }
  async deleteFile(_name: string): Promise<void> {
    throw new Error("Use reviewed history cleanup. Local revisions are never permanently deleted.");
  }
  async archiveRevision(metadata: SyncMetadata) {
    const name = metadata.remoteId;
    if (!name || !metadata.version || !/^[a-f0-9]{64}$/.test(metadata.version))
      throw new Error("Missing local revision concurrency token.");
    const text = await this.downloadFile(name);
    if ((await digest(text)) !== metadata.version) throw new Error("Folder revision changed. Review cleanup again.");
    const trash = await this.directory().getDirectoryHandle(TRASH, { create: true });
    const archivedName = archiveName(name, metadata.version);
    try {
      const previous = await (await trash.getFileHandle(archivedName)).getFile();
      if ((await previous.text()) !== text) throw new Error("Archive copy differs. Source files were preserved.");
    } catch (error) {
      if (!missing(error)) throw error;
      await this.write(trash, archivedName, text);
    }
    const archived = await (await trash.getFileHandle(archivedName)).getFile();
    if ((await archived.text()) !== text || (await this.downloadFile(name)) !== text)
      throw new Error("Folder revision changed during archiving. Source files were preserved.");
    // No conditional rename/delete exists for ordinary picked folders. Keep the source;
    // listing hides it only while the trash copy matches, preserving concurrent changes.
  }
}
