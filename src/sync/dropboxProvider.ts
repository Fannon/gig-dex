import { initDB } from "../db";
import { effectiveClientConfig } from "./clientConfig";
import { base64url, pkceChallenge } from "./oneDriveProvider";
import { syncHeads } from "./revisionHistory";
import {
  parseRevisionFilename,
  parseSyncFile,
  readSyncResponse,
  revisionFilename,
  SYNC_FORMAT_VERSION,
  syncEnvelope,
} from "./syncFormat";
import type { SyncMetadata, SyncProvider } from "./types";

const API = "https://api.dropboxapi.com/2";
const CONTENT = "https://content.dropboxapi.com/2";
const TOKEN_KEY = "dropbox_tokens";
type Tokens = { access_token: string; refresh_token?: string; expiresAt: number; account_id?: string; appKey: string };
type Item = { ".tag": string; id?: string; name: string; path_lower?: string; rev?: string; server_modified?: string };

export class DropboxProvider implements SyncProvider {
  name = "Dropbox";
  private appKey: string;
  private tokens: Tokens | null = null;
  private listedRevisions = new Map<string, string>();
  constructor(appKey = effectiveClientConfig().dropbox) {
    this.appKey = appKey;
    try {
      const value = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? "null");
      if (value?.appKey === appKey && typeof value.access_token === "string" && Number.isFinite(value.expiresAt))
        this.tokens = value;
    } catch {
      // Ignore invalid credentials.
    }
  }
  setAppKey(appKey: string) {
    if (appKey === this.appKey) return false;
    void this.logout();
    this.appKey = appKey;
    return true;
  }
  isEnabled() {
    return !!this.appKey;
  }
  isAuthenticated() {
    return !!this.tokens;
  }
  getScope() {
    if (!this.tokens?.account_id) throw new Error("Dropbox account is unavailable.");
    return `dropbox:${this.appKey}:${this.tokens.account_id}`;
  }
  private async token(parameters: Record<string, string>) {
    const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.appKey, ...parameters }),
    });
    const result = await response.json();
    if (!response.ok || typeof result.access_token !== "string" || !Number.isFinite(Number(result.expires_in)))
      throw new Error("Dropbox sign-in expired or failed. Connect Dropbox again.");
    this.tokens = {
      access_token: result.access_token,
      refresh_token: result.refresh_token ?? this.tokens?.refresh_token,
      expiresAt: Date.now() + Number(result.expires_in) * 1000,
      account_id: result.account_id ?? this.tokens?.account_id,
      appKey: this.appKey,
    };
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify(this.tokens));
  }
  private async refresh() {
    if (!this.tokens?.refresh_token) throw new Error("Connect Dropbox again to continue.");
    try {
      await this.token({ grant_type: "refresh_token", refresh_token: this.tokens.refresh_token });
    } catch (error) {
      await this.logout();
      throw error;
    }
  }
  async authenticate() {
    if (!this.isEnabled()) throw new Error("A Dropbox app key is required to enable sync.");
    if (this.tokens) {
      if (this.tokens.expiresAt <= Date.now() + 60000) await this.refresh();
      if (!this.tokens.account_id) await this.account();
      return true;
    }
    const popup = window.open("about:blank", "Gig-Dex Dropbox", "popup=true,width=520,height=650");
    if (!popup) throw new Error("Allow the sign-in popup to connect Dropbox.");
    const redirect = new URL(`${import.meta.env.BASE_URL}dropbox-callback.html`, window.location.origin).href;
    const state = crypto.randomUUID();
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    try {
      const url = new URL("https://www.dropbox.com/oauth2/authorize");
      url.search = new URLSearchParams({
        client_id: this.appKey,
        response_type: "code",
        redirect_uri: redirect,
        token_access_type: "offline",
        scope: "files.metadata.read files.content.read files.content.write account_info.read",
        state,
        code_challenge: await pkceChallenge(verifier),
        code_challenge_method: "S256",
      }).toString();
      popup.location.href = url.href;
      const code = await new Promise<string>((resolve, reject) => {
        const began = Date.now();
        const timer = window.setInterval(() => {
          if (popup.closed || Date.now() - began > 180000) {
            clearInterval(timer);
            reject(new Error("Dropbox sign-in was cancelled or timed out."));
            return;
          }
          let returned: URL;
          try {
            returned = new URL(popup.location.href);
          } catch {
            return;
          }
          if (returned.origin !== window.location.origin || returned.pathname !== new URL(redirect).pathname) return;
          clearInterval(timer);
          if (returned.searchParams.get("state") !== state) {
            reject(new Error("Dropbox sign-in state did not match."));
            return;
          }
          const value = returned.searchParams.get("code");
          if (!value || returned.searchParams.has("error")) reject(new Error("Dropbox sign-in was not completed."));
          else resolve(value);
        }, 150);
      });
      await this.token({ grant_type: "authorization_code", code, redirect_uri: redirect, code_verifier: verifier });
      await this.account();
      return true;
    } finally {
      if (!popup.closed) popup.close();
    }
  }
  async logout() {
    this.tokens = null;
    this.listedRevisions.clear();
    sessionStorage.removeItem(TOKEN_KEY);
  }
  private async request(url: string, init: RequestInit = {}, retried = false): Promise<Response> {
    const parsed = new URL(url);
    if (![API, CONTENT].some((base) => url.startsWith(`${base}/`) && parsed.origin === new URL(base).origin))
      throw new Error("Invalid Dropbox API URL.");
    if (!this.tokens) throw new Error("Connect Dropbox first.");
    if (this.tokens.expiresAt <= Date.now() + 60000 && !retried) await this.refresh();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.tokens.access_token}`);
    const response = await fetch(url, { ...init, headers });
    if (response.status === 401 && !retried && this.tokens.refresh_token) {
      await this.refresh();
      return this.request(url, init, true);
    }
    if (response.status === 401) {
      await this.logout();
      throw new Error("Dropbox sign-in expired. Connect again.");
    }
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error_summary ?? `Dropbox request failed (${response.status}).`);
    }
    return response;
  }
  private async rpc(path: string, body: object) {
    const response = await this.request(`${API}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.json();
  }
  private async account() {
    const result = await this.rpc("users/get_current_account", {});
    if (typeof result.account_id !== "string" || !result.account_id) throw new Error("Dropbox account is unavailable.");
    if (this.tokens) {
      this.tokens.account_id = result.account_id;
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify(this.tokens));
    }
  }
  async listRevisions(): Promise<SyncMetadata[]> {
    let result = await this.rpc("files/list_folder", { path: "", recursive: false });
    const entries: Item[] = [];
    const visited = new Set<string>();
    while (true) {
      if (!Array.isArray(result.entries)) throw new Error("Invalid Dropbox folder listing.");
      entries.push(...result.entries);
      if (!result.has_more) break;
      if (typeof result.cursor !== "string" || visited.has(result.cursor))
        throw new Error("Invalid Dropbox pagination.");
      visited.add(result.cursor);
      result = await this.rpc("files/list_folder/continue", { cursor: result.cursor });
    }
    const records: SyncMetadata[] = [];
    this.listedRevisions.clear();
    const db = await initDB();
    const prefix = `${this.getScope()}::`;
    for (const item of entries) {
      const match = parseRevisionFilename(item.name ?? "");
      if (item[".tag"] !== "file" || !match || !item.id || !item.rev || !item.path_lower) continue;
      const cacheKey = `${prefix}${item.id}`;
      this.listedRevisions.set(item.id, item.rev);
      const cached = await db.get("revisionCache", cacheKey);
      if (cached?.formatVersion !== undefined && cached.formatVersion > SYNC_FORMAT_VERSION)
        throw new Error(`Unsupported sync format version ${cached.formatVersion}. Update Gig-Dex before syncing.`);
      if (
        cached?.etag === item.rev &&
        cached.remoteId === item.id &&
        cached.revision === match.revision &&
        cached.type === match.type
      ) {
        records.push({ ...cached, uploadedAt: item.server_modified });
        continue;
      }
      const value = parseSyncFile(await this.downloadRevision(item.path_lower, item.rev));
      const envelope = syncEnvelope(value);
      if (
        typeof value.id !== "string" ||
        typeof value.lastModified !== "string" ||
        !Number.isFinite(Date.parse(value.lastModified)) ||
        envelope?.revision !== match.revision
      )
        throw new Error("Invalid Dropbox revision.");
      const metadata: SyncMetadata = {
        id: value.id,
        title: typeof value.title === "string" ? value.title : typeof value.name === "string" ? value.name : "Untitled",
        type: match.type,
        lastModified: value.lastModified,
        revision: match.revision,
        parents: envelope.parents,
        formatVersion: (value._sync as { formatVersion?: number }).formatVersion ?? 0,
        remoteId: item.id,
        etag: item.rev,
        uploadedAt: item.server_modified,
      };
      records.push(metadata);
      await db.put("revisionCache", metadata, cacheKey).catch(() => undefined);
    }
    const present = new Set(entries.filter((item) => item.id).map((item) => `${prefix}${item.id}`));
    for (const key of await db.getAllKeys("revisionCache", IDBKeyRange.bound(prefix, `${prefix}\uffff`)))
      if (!present.has(key)) await db.delete("revisionCache", key);
    return records;
  }
  async listFiles() {
    return syncHeads(await this.listRevisions());
  }
  private async downloadRevision(path: string, expectedRev?: string) {
    const response = await this.request(`${CONTENT}/files/download`, {
      method: "POST",
      headers: { "Dropbox-API-Arg": JSON.stringify({ path }) },
    });
    const raw = response.headers.get("Dropbox-API-Result");
    const actual = raw ? JSON.parse(raw) : null;
    if (expectedRev && actual?.rev !== expectedRev)
      throw new Error("Dropbox revision changed during sync. Please retry.");
    return readSyncResponse(response);
  }
  async downloadFile(id: string) {
    return this.downloadRevision(id, this.listedRevisions.get(id));
  }
  async uploadFile(metadata: SyncMetadata, content: string) {
    if (!metadata.revision) throw new Error("Missing Dropbox revision identity.");
    await this.request(`${CONTENT}/files/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: `/${revisionFilename(metadata.type, metadata.revision)}`,
          mode: "add",
          autorename: false,
          mute: true,
          strict_conflict: true,
        }),
      },
      body: content,
    });
  }
  async deleteFile(_id: string): Promise<void> {
    throw new Error("Use reviewed revision cleanup to remove Dropbox history.");
  }
  async archiveRevision(metadata: SyncMetadata) {
    if (!metadata.remoteId || !metadata.etag) throw new Error("Dropbox revision cannot be safely removed.");
    await this.rpc("files/delete_v2", { path: metadata.remoteId, parent_rev: metadata.etag });
  }
}
