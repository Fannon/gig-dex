/// <reference types="node" />
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getAllSongs, getSong, initDB, LIBRARY_CHANGED_EVENT, type Song, updateSong } from "../db";
import { DropboxProvider } from "./dropboxProvider";
import { createSyncFile, revisionFilename } from "./syncFormat";
import { SyncManager } from "./syncManager";

type File = { id: string; name: string; path_lower: string; rev: string; content: string };
let files: File[];
let requests: string[];
let revisionNumber: number;
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

async function addRemote(record: Song, parents: string[] = []) {
  const { revision, content } = await createSyncFile(record, parents);
  const name = revisionFilename("song", revision);
  const file = { id: `id:${++revisionNumber}`, name, path_lower: `/${name}`, rev: `rev:${revisionNumber}`, content };
  files.push(file);
  return file;
}
beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("crypto", webcrypto);
  const db = await initDB();
  for (const store of ["songs", "setlists", "tombstones", "syncBases", "syncConflicts", "revisionCache"] as const)
    await db.clear(store);
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(
    "dropbox_tokens",
    JSON.stringify({
      access_token: "test-access",
      expiresAt: Date.now() + 3600000,
      account_id: "dbid:user",
      appKey: "testappkey123",
    }),
  );
  files = [];
  requests = [];
  revisionNumber = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      requests.push(path);
      if (path === "/2/files/list_folder")
        return response({
          entries: files.map(({ content: _content, ...file }) => ({ ...file, ".tag": "file" })),
          has_more: false,
        });
      const args = JSON.parse(new Headers(init?.headers).get("Dropbox-API-Arg") ?? "null");
      if (path === "/2/files/download") {
        const file = files.find((file) => file.id === args.path || file.path_lower === args.path);
        if (!file) return response({ error_summary: "path/not_found" }, 409);
        return new Response(file.content, { headers: { "Dropbox-API-Result": JSON.stringify({ rev: file.rev }) } });
      }
      if (path === "/2/files/upload") {
        const name = args.path.slice(1);
        if (files.some((file) => file.path_lower === args.path))
          return response({ error_summary: "path/conflict" }, 409);
        files.push({
          id: `id:${++revisionNumber}`,
          name,
          path_lower: args.path,
          rev: `rev:${revisionNumber}`,
          content: String(init?.body),
        });
        return response({ name });
      }
      throw new Error(`Unexpected Dropbox request: ${path}`);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function seedRemote(count = 12) {
  for (let index = 0; index < count; index++)
    await addRemote({
      id: `song-${index}`,
      title: `Song ${index}`,
      artist: "Test band",
      content: "[C]Synthetic sync line",
      tags: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      lastModified: "2026-01-01T00:00:00.000Z",
    });
}

it("downloads each new revision once and checks a warm library with one request and one UI refresh", async () => {
  await seedRemote(191);
  const manager = new SyncManager(new DropboxProvider("testappkey123"));
  await manager.sync();
  expect(manager.getStatus().error).toBeNull();
  expect(await getAllSongs()).toHaveLength(191);
  expect(requests.filter((path) => path.endsWith("/download"))).toHaveLength(191);
  requests = [];
  const changed = vi.fn();
  window.addEventListener(LIBRARY_CHANGED_EVENT, changed);
  try {
    await manager.sync();
    expect(manager.getStatus().error).toBeNull();
    expect(requests).toEqual(["/2/files/list_folder"]);
    expect(changed).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener(LIBRARY_CHANGED_EVENT, changed);
  }
  requests = [];
  const reopened = new SyncManager(new DropboxProvider("testappkey123"));
  await reopened.sync();
  expect(reopened.getStatus().error).toBeNull();
  expect(requests).toEqual(["/2/files/list_folder"]);
  await updateSong("song-0", { title: "Saved edit" });
  requests = [];
  await reopened.sync();
  expect(reopened.getStatus().error).toBeNull();
  expect(requests).toEqual(["/2/files/list_folder", "/2/files/upload"]);
});

it("downloads changed remote revisions and rejects edits that reuse an existing revision identity", async () => {
  await seedRemote(1);
  const manager = new SyncManager(new DropboxProvider("testappkey123"));
  await manager.sync();
  const original = JSON.parse(files[0].content);
  const { _sync, ...record } = original;
  const changed = await addRemote({ ...record, title: "Remote edit", lastModified: "2026-02-01T00:00:00.000Z" }, [
    _sync.revision,
  ]);
  requests = [];
  await manager.sync();
  expect(manager.getStatus().error).toBeNull();
  expect((await getSong("song-0"))?.title).toBe("Remote edit");
  expect(requests.filter((path) => path.endsWith("/download"))).toHaveLength(1);
  const cache = await (await initDB()).getAll("revisionCache");
  expect(cache.filter((entry) => entry.content)).toHaveLength(1);
  expect(cache.find((entry) => entry.remoteId === files[0].id)?.content).toBeUndefined();
  changed.content = JSON.stringify({ ...JSON.parse(changed.content), title: "Tampered edit" });
  changed.rev = "changed-in-place";
  await manager.sync();
  expect(manager.getStatus().error).toContain("checksum mismatch");
  expect((await getSong("song-0"))?.title).toBe("Remote edit");
});

it("bounds concurrent initial downloads and drains in-flight reads before reporting failure", async () => {
  await seedRemote();
  const fetchRemote = vi.mocked(fetch).getMockImplementation();
  if (!fetchRemote) throw new Error("Missing Dropbox HTTP fixture");
  let active = 0;
  let peak = 0;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (!String(url).endsWith("/files/download")) return fetchRemote(url, init);
    active++;
    peak = Math.max(peak, active);
    try {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return await fetchRemote(url, init);
    } finally {
      active--;
    }
  });
  await new SyncManager(new DropboxProvider("testappkey123")).sync();
  expect(peak).toBe(4);
  expect(active).toBe(0);
  await (await initDB()).clear("revisionCache");
  let downloads = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (!String(url).endsWith("/files/download")) return fetchRemote(url, init);
    downloads++;
    if (downloads === 1) throw new Error("Offline");
    await gate;
    return fetchRemote(url, init);
  });
  let settled = false;
  const listing = new DropboxProvider("testappkey123").listRevisions();
  void listing.catch(() => {
    settled = true;
  });
  await vi.waitFor(() => expect(downloads).toBe(4));
  expect(settled).toBe(false);
  release();
  await expect(listing).rejects.toThrow("Offline");
  expect(downloads).toBe(4);
});

it("repairs corrupt cached bytes from Dropbox and keeps direct validation reads fresh", async () => {
  await seedRemote(1);
  const provider = new DropboxProvider("testappkey123");
  const manager = new SyncManager(provider);
  await manager.sync();
  const db = await initDB();
  const [key] = await db.getAllKeys("revisionCache");
  const cached = await db.get("revisionCache", key);
  if (!cached?.content) throw new Error("Missing verified cached revision");
  await db.put(
    "revisionCache",
    { ...cached, content: JSON.stringify({ ...JSON.parse(cached.content), title: "Corrupt cache" }) },
    key,
  );
  requests = [];
  await manager.sync();
  expect(manager.getStatus().error).toBeNull();
  expect((await getSong("song-0"))?.title).toBe("Song 0");
  expect(requests).toEqual(["/2/files/list_folder", "/2/files/download"]);
  requests = [];
  await manager.sync();
  expect(requests).toEqual(["/2/files/list_folder"]);
  // Cleanup and ambiguous-upload checks must see an edit made after listing.
  files[0].rev = "unexpected-new-version";
  await expect(provider.downloadFile(files[0].id)).rejects.toThrow("changed during sync");
});

it("syncs even when optional cache writes run out of storage", async () => {
  await seedRemote(2);
  const db = await initDB();
  vi.spyOn(db, "put").mockRejectedValue(new DOMException("Full", "QuotaExceededError"));
  const manager = new SyncManager(new DropboxProvider("testappkey123"));
  await manager.sync();
  expect(manager.getStatus().error).toBeNull();
  expect(await getAllSongs()).toHaveLength(2);
  expect(await db.count("revisionCache")).toBe(0);
});

it("does not reuse cached bytes across Dropbox accounts or app keys", async () => {
  await seedRemote(1);
  await new SyncManager(new DropboxProvider("testappkey123")).sync();
  for (const identity of [
    { appKey: "testappkey123", account_id: "dbid:other" },
    { appKey: "differentappkey", account_id: "dbid:other" },
  ]) {
    localStorage.setItem(
      "dropbox_tokens",
      JSON.stringify({ ...identity, access_token: "other-access", expiresAt: Date.now() + 3600000 }),
    );
    requests = [];
    const manager = new SyncManager(new DropboxProvider(identity.appKey));
    await manager.sync();
    expect(manager.getStatus().error).toBeNull();
    expect(requests).toEqual(["/2/files/list_folder", "/2/files/download"]);
  }
});

it("releases sync after a stalled request times out and retains the account for retry", async () => {
  await seedRemote(1);
  const provider = new DropboxProvider("testappkey123");
  const manager = new SyncManager(provider);
  await manager.sync();
  const fetchRemote = vi.mocked(fetch).getMockImplementation();
  if (!fetchRemote) throw new Error("Missing Dropbox HTTP fixture");
  vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), 0);
    return controller.signal;
  });
  vi.mocked(fetch).mockImplementationOnce(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      }),
  );
  await manager.sync();
  expect(manager.getStatus().error).toContain("timed out");
  expect(manager.getStatus().isSyncing).toBe(false);
  expect(SyncManager.isBusy()).toBe(false);
  expect(provider.isAuthenticated()).toBe(true);
  expect((await getSong("song-0"))?.title).toBe("Song 0");
  await manager.sync();
  expect(manager.getStatus().error).toBeNull();
});

it("stops after a connection failure instead of retrying the timeout for every song", async () => {
  await seedRemote(12);
  const manager = new SyncManager(new DropboxProvider("testappkey123"));
  await manager.sync();
  const db = await initDB();
  for (const key of await db.getAllKeys("revisionCache")) {
    const entry = await db.get("revisionCache", key);
    if (entry) {
      delete entry.content;
      await db.put("revisionCache", entry, key);
    }
  }
  const fetchRemote = vi.mocked(fetch).getMockImplementation();
  if (!fetchRemote) throw new Error("Missing Dropbox HTTP fixture");
  let downloads = 0;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).endsWith("/files/download")) {
      downloads++;
      throw new TypeError("Offline");
    }
    return fetchRemote(url, init);
  });
  await manager.sync();
  expect(manager.getStatus().error).toContain("network request failed");
  expect(downloads).toBe(1);
  expect(SyncManager.isBusy()).toBe(false);
  expect(await getAllSongs()).toHaveLength(12);
});
