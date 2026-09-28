import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addSetlist,
  addSong,
  deleteSetlist,
  deleteSong,
  getAllSetlists,
  getAllSongs,
  getSong,
  initDB,
  LIBRARY_CHANGED_EVENT,
  type Song,
  saveSong,
  updateSetlist,
  updateSong,
} from "../db";
import { recordKey } from "./records";
import { createSyncFile } from "./syncFormat";
import { SyncManager } from "./syncManager";
import { getSyncConflicts, resolveConflict } from "./syncStore";
import type { SyncMetadata, SyncProvider } from "./types";

class Cloud implements SyncProvider {
  name = "Test cloud";
  files: { metadata: SyncMetadata; content: string }[] = [];
  authenticate = vi.fn(async () => true);
  isEnabled = () => true;
  logout = async () => {};
  deleteFile = async () => {
    throw new Error("Sync must preserve history.");
  };
  listFiles = async () => {
    const ancestors = new Set(
      this.files.flatMap(({ metadata }) =>
        (metadata.parents ?? []).map((parent) => `${recordKey(metadata.type, metadata.id)}:${parent}`),
      ),
    );
    return this.files
      .map((file) => file.metadata)
      .filter((meta) => !ancestors.has(`${recordKey(meta.type, meta.id)}:${meta.revision}`));
  };
  downloadFile = async (id: string) => this.files.find((file) => file.metadata.gdriveId === id)?.content ?? "invalid";
  uploadFile = async (metadata: SyncMetadata, content: string) => {
    this.files.push({ metadata: { ...metadata, gdriveId: crypto.randomUUID() }, content });
  };
}
const stores = ["songs", "setlists", "tombstones", "syncBases", "syncConflicts"] as const;
async function clear() {
  const db = await initDB();
  const tx = db.transaction(stores, "readwrite");
  for (const store of stores) await tx.objectStore(store).clear();
  await tx.done;
}
async function snapshot() {
  const db = await initDB();
  return Promise.all(stores.map((store) => db.getAll(store)));
}
async function switchDevice(data: Awaited<ReturnType<typeof snapshot>>) {
  await clear();
  const db = await initDB();
  const tx = db.transaction(stores, "readwrite");
  for (let i = 0; i < stores.length; i++) for (const value of data[i]) await tx.objectStore(stores[i]).put(value);
  await tx.done;
}
beforeEach(async () => {
  localStorage.clear();
  await clear();
});
async function seed() {
  return addSong({ title: "Test", artist: "Artist", content: "[C]Original", tags: [] });
}

describe("durable sync with real IndexedDB", () => {
  it("pushes local records, acknowledges revisions, pulls onto another device, and propagates edits despite older clocks", async () => {
    const cloud = new Cloud();
    const manager = new SyncManager(cloud);
    const id = await seed();
    await addSetlist({
      name: "Gig",
      tags: ["live"],
      date: "2026-12-24",
      songIds: [id, id],
      songSettings: [{ transpose: 2, capo: 3 }, { transpose: -1 }],
    });
    await manager.sync();
    expect(manager.getStatus().error).toBeNull();
    expect(cloud.files).toHaveLength(2);
    const deviceA = await snapshot();
    await clear();
    await new SyncManager(cloud).sync();
    expect(await getAllSongs()).toHaveLength(1);
    expect((await getAllSetlists())[0]).toMatchObject({
      songIds: [id, id],
      date: "2026-12-24",
      songSettings: [{ transpose: 2, capo: 3 }, { transpose: -1 }],
    });
    const song = await getSong(id);
    if (!song) throw new Error("Missing song");
    await saveSong({ ...song, content: "[G]Remote edit", lastModified: "2000-01-01T00:00:00Z" });
    await new SyncManager(cloud).sync();
    expect(cloud.files).toHaveLength(3);
    await switchDevice(deviceA);
    await manager.sync();
    expect((await getSong(id))?.content).toBe("[G]Remote edit");
    expect(manager.getStatus().conflictCount).toBe(0);
    expect(manager.getStatus().lastSyncTime).not.toBeNull();
  });
  it("propagates song and setlist deletions, cleans repeated references, and does not resurrect on a fresh device", async () => {
    const cloud = new Cloud();
    const id = await seed();
    const list = await addSetlist({ name: "Gig", songIds: [id, id] });
    await new SyncManager(cloud).sync();
    const deviceB = await snapshot();
    await deleteSong(id);
    await new SyncManager(cloud).sync();
    await switchDevice(deviceB);
    await new SyncManager(cloud).sync();
    expect(await getAllSongs()).toHaveLength(0);
    expect((await getAllSetlists())[0].songIds).toEqual([]);
    await deleteSetlist(list);
    await new SyncManager(cloud).sync();
    await clear();
    await new SyncManager(cloud).sync();
    expect(await getAllSongs()).toHaveLength(0);
    expect(await getAllSetlists()).toHaveLength(0);
    expect(await (await initDB()).getAll("tombstones")).toHaveLength(2);
  });
  it("preserves two-device conflicting edits and resolves by keeping both versions", async () => {
    const cloud = new Cloud();
    const id = await seed();
    await new SyncManager(cloud).sync();
    const deviceA = await snapshot();
    await updateSong(id, { content: "[G]Remote words" });
    await new SyncManager(cloud).sync();
    await switchDevice(deviceA);
    await updateSong(id, { content: "[D]Local words" });
    const manager = new SyncManager(cloud);
    await manager.sync();
    const [conflict] = await getSyncConflicts();
    expect(conflict.local).toMatchObject({ content: "[D]Local words" });
    expect(conflict.remote[0].record).toMatchObject({ content: "[G]Remote words" });
    expect((await getSong(id))?.content).toBe("[D]Local words");
    expect(manager.getStatus().conflictCount).toBe(1);
    await resolveConflict(conflict.id, "both");
    await manager.sync();
    expect(await getSyncConflicts()).toHaveLength(0);
    await clear();
    await new SyncManager(cloud).sync();
    expect((await getAllSongs()).map((song) => song.content).sort()).toEqual(["[D]Local words", "[G]Remote words"]);
  });
  it("detects delete-versus-edit and allows explicitly keeping the edited version", async () => {
    const cloud = new Cloud();
    const id = await seed();
    await new SyncManager(cloud).sync();
    const deviceB = await snapshot();
    await deleteSong(id);
    await new SyncManager(cloud).sync();
    await switchDevice(deviceB);
    await updateSong(id, { title: "Edited" });
    await new SyncManager(cloud).sync();
    const [conflict] = await getSyncConflicts();
    expect(conflict.remote[0].record).toMatchObject({ deleted: true });
    await resolveConflict(conflict.id, "local");
    await new SyncManager(cloud).sync();
    await clear();
    await new SyncManager(cloud).sync();
    expect((await getSong(id))?.title).toBe("Edited");
  });
  it("refuses stale conflict resolution after another local edit", async () => {
    const cloud = new Cloud();
    const id = await seed();
    await new SyncManager(cloud).sync();
    const prior = await snapshot();
    await updateSong(id, { title: "Remote" });
    await new SyncManager(cloud).sync();
    await switchDevice(prior);
    await updateSong(id, { title: "Local" });
    await new SyncManager(cloud).sync();
    const [conflict] = await getSyncConflicts();
    await updateSong(id, { title: "New edit" });
    await expect(resolveConflict(conflict.id, 0)).rejects.toThrow("changed");
    expect((await getSong(id))?.title).toBe("New edit");
  });
  it("keeps simultaneous remote branches rather than hiding one with timestamp ordering", async () => {
    const cloud = new Cloud();
    const id = await seed();
    await new SyncManager(cloud).sync();
    const ancestor = cloud.files[0].metadata.revision;
    const song = await getSong(id);
    if (!song || !ancestor) throw new Error("Missing fixture");
    for (const title of ["Branch A", "Branch B"]) {
      const revision = crypto.randomUUID();
      await cloud.uploadFile(
        { id, title, type: "song", lastModified: song.lastModified, revision, parents: [ancestor] },
        JSON.stringify({ ...song, title, _sync: { revision, parents: [ancestor] } }),
      );
    }
    await new SyncManager(cloud).sync();
    expect((await getSyncConflicts())[0].remote).toHaveLength(2);
    expect(await cloud.listFiles()).toHaveLength(2);
  });
  it("does not overwrite edits made while an upload is in progress", async () => {
    const cloud = new Cloud();
    const id = await seed();
    const upload = cloud.uploadFile.bind(cloud);
    cloud.uploadFile = async (metadata, content) => {
      await upload(metadata, content);
      await updateSong(id, { title: "During upload" });
    };
    const manager = new SyncManager(cloud);
    await manager.sync();
    expect(manager.getStatus().error).toContain("changed during sync");
    expect((await getSong(id))?.title).toBe("During upload");
    expect(cloud.files).toHaveLength(1);
    cloud.uploadFile = upload;
    await manager.sync();
    expect(manager.getStatus().error).toBeNull();
    expect(await getSyncConflicts()).toHaveLength(0);
    expect(await cloud.listFiles()).toHaveLength(1);
    expect(JSON.parse(cloud.files[1].content).title).toBe("During upload");
  });
  it("retries a failed upload without losing local data or advancing successful-sync time", async () => {
    const cloud = new Cloud();
    const id = await seed();
    const upload = cloud.uploadFile.bind(cloud);
    cloud.uploadFile = async () => {
      throw new Error("Connection lost");
    };
    const manager = new SyncManager(cloud);
    await manager.sync();
    expect(manager.getStatus().error).toContain("Connection lost");
    expect(localStorage.getItem("last_sync:Test cloud")).toBeNull();
    cloud.uploadFile = upload;
    await manager.sync();
    expect(manager.getStatus().error).toBeNull();
    expect(localStorage.getItem("last_sync:Test cloud")).not.toBeNull();
    expect(cloud.files).toHaveLength(1);
    expect(await getSong(id)).toBeDefined();
  });
  it("recognizes an upload committed before its response was lost", async () => {
    const cloud = new Cloud();
    await seed();
    const upload = cloud.uploadFile.bind(cloud);
    cloud.uploadFile = async (metadata, content) => {
      await upload(metadata, content);
      throw new Error("Response lost");
    };
    const manager = new SyncManager(cloud);
    await manager.sync();
    expect(manager.getStatus().error).toBeNull();
    expect(cloud.files).toHaveLength(1);
    const firstRevision = cloud.files[0].metadata.revision;
    cloud.uploadFile = upload;
    await manager.sync();
    expect(cloud.files).toHaveLength(1);
    expect(cloud.files[0].metadata.revision).toBe(firstRevision);
  });
  it("tolerates duplicate identical files but rejects a reused revision with different content", async () => {
    const cloud = new Cloud();
    await seed();
    const manager = new SyncManager(cloud);
    await manager.sync();
    const duplicate = structuredClone(cloud.files[0]);
    duplicate.metadata.gdriveId = crypto.randomUUID();
    const duplicateValue = JSON.parse(duplicate.content);
    duplicate.content = JSON.stringify({
      ...duplicateValue,
      _sync: { revision: duplicateValue._sync.revision, parents: duplicateValue._sync.parents },
    }); // Unversioned duplicates predate the checksum contract.
    cloud.files.push(duplicate);
    await manager.sync();
    expect(manager.getStatus().error).toBeNull();
    expect(cloud.files).toHaveLength(2);
    cloud.files[1].content = cloud.files[1].content.replace("[C]Original", "[D]Changed");
    await manager.sync();
    expect(manager.getStatus().error).toContain("reuse a revision ID");
    expect(cloud.files).toHaveLength(2);
  });
  it("rejects invalid remote identity and preserves the library", async () => {
    const cloud = new Cloud();
    const id = await seed();
    const song = await getSong(id);
    const revision = crypto.randomUUID();
    await cloud.uploadFile(
      { id: "remote", title: "Invalid", type: "song", lastModified: song?.lastModified ?? "", revision, parents: [] },
      JSON.stringify({ ...song, _sync: { revision, parents: [] } }),
    );
    const manager = new SyncManager(cloud);
    await manager.sync();
    expect(manager.getStatus().error).toContain("Invalid remote song data");
    expect(await getAllSongs()).toHaveLength(1);
  });
  it("stops before uploading when a remote file declares a newer format", async () => {
    const cloud = new Cloud();
    await seed();
    cloud.files.push({
      metadata: {
        id: "future-song",
        title: "Future",
        type: "song",
        lastModified: "2026-01-01T00:00:00Z",
        revision: "future",
        parents: [],
        formatVersion: 2,
        gdriveId: "future-file",
      },
      content: "{}",
    });
    const manager = new SyncManager(cloud);
    await manager.sync();
    expect(manager.getStatus().error).toContain("Unsupported sync format version 2");
    expect(cloud.files).toHaveLength(1);
  });
  it("syncs healthy records when another download fails and retries only the missing item", async () => {
    const cloud = new Cloud();
    const ids = await Promise.all(
      ["First", "Second", "Third"].map((title) => addSong({ title, artist: "", content: title, tags: [] })),
    );
    await new SyncManager(cloud).sync();
    await clear();
    localStorage.removeItem("last_sync:Test cloud");
    const failingId = cloud.files.find((file) => file.metadata.id === ids[1])?.metadata.gdriveId;
    const download = cloud.downloadFile.bind(cloud);
    cloud.downloadFile = async (id) => {
      if (id === failingId) throw new Error("Network interrupted");
      return download(id);
    };
    const manager = new SyncManager(cloud);
    await manager.sync();
    expect((await getAllSongs()).map((song) => song.id).sort()).toEqual([ids[0], ids[2]].sort());
    expect(manager.getStatus().error).toContain("Network interrupted");
    expect(manager.getStatus().lastSyncTime).toBeNull();
    cloud.downloadFile = download;
    await manager.sync();
    expect(await getAllSongs()).toHaveLength(3);
    expect(manager.getStatus().error).toBeNull();
  });
  it("detects an edit made while downloading before it uploads an older snapshot", async () => {
    const cloud = new Cloud();
    const id = await seed();
    const manager = new SyncManager(cloud);
    await manager.sync();
    await updateSong(id, { title: "Local edit" });
    const download = cloud.downloadFile.bind(cloud);
    cloud.downloadFile = async (remoteId) => {
      await updateSong(id, { title: "Newest edit" });
      return download(remoteId);
    };
    await manager.sync();
    expect(manager.getStatus().error).toContain("Library changed during sync");
    expect(cloud.files).toHaveLength(1);
    cloud.downloadFile = download;
    await manager.sync();
    expect(cloud.files).toHaveLength(2);
    expect(JSON.parse(cloud.files[1].content).title).toBe("Newest edit");
  });
  it("emits the library event and clears persisted status on reset", async () => {
    const cloud = new Cloud();
    await seed();
    const changed = vi.fn();
    window.addEventListener(LIBRARY_CHANGED_EVENT, changed);
    const manager = new SyncManager(cloud);
    await manager.sync();
    window.removeEventListener(LIBRARY_CHANGED_EVENT, changed);
    expect(changed).toHaveBeenCalled();
    expect(localStorage.getItem("last_sync:Test cloud")).not.toBeNull();
    manager.resetStatus();
    expect(localStorage.getItem("last_sync:Test cloud")).toBeNull();
    expect(new SyncManager(cloud).getStatus().lastSyncTime).toBeNull();
  });
  it("does not overwrite mismatched first-sync records without a shared baseline", async () => {
    const cloud = new Cloud();
    const id = await seed();
    const local = (await getSong(id)) as Song;
    const revision = crypto.randomUUID();
    await cloud.uploadFile(
      { id, title: "Remote", type: "song", lastModified: local.lastModified, revision, parents: [] },
      JSON.stringify({ ...local, title: "Remote", _sync: { revision, parents: [] } }),
    );
    await new SyncManager(cloud).sync();
    expect(await getSyncConflicts()).toHaveLength(1);
    expect((await getSong(id))?.title).toBe("Test");
  });
  it("preserves setlist order and tags in conflict resolution", async () => {
    const cloud = new Cloud();
    const id = await addSetlist({ name: "Gig", tags: ["local"], songIds: [] });
    await new SyncManager(cloud).sync();
    const prior = await snapshot();
    await updateSetlist(id, { tags: ["remote"] });
    await new SyncManager(cloud).sync();
    await switchDevice(prior);
    await updateSetlist(id, { name: "Local name" });
    await new SyncManager(cloud).sync();
    const [conflict] = await getSyncConflicts();
    await resolveConflict(conflict.id, 0);
    await new SyncManager(cloud).sync();
    expect((await getAllSetlists())[0]).toMatchObject({
      name: "Gig",
      tags: ["remote"],
      songIds: [],
    });
  });
});

it("guards overlapping syncs and returns without touching data after failed authentication", async () => {
  const cloud = new Cloud();
  cloud.authenticate.mockResolvedValue(false);
  const manager = new SyncManager(cloud);
  await manager.sync();
  expect(cloud.files).toHaveLength(0);
  expect(manager.getStatus().error).toContain("Could not connect to Test cloud");
  expect(manager.getStatus().lastSyncTime).toBeNull();
  let finish: (value: boolean) => void = () => {};
  cloud.authenticate.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = manager.sync();
  expect(manager.getStatus().isSyncing).toBe(true);
  await manager.sync();
  finish(true);
  await pending;
  expect(cloud.authenticate).toHaveBeenCalledTimes(2);
});

it("keeps provider baselines separate and preserves first-sync differences", async () => {
  const id = await seed();
  const first = new Cloud();
  const second = new Cloud();
  const providerA = Object.assign(first, { getScope: () => "gdrive:folder" });
  const providerB = Object.assign(second, { getScope: () => "onedrive:folder" });
  await new SyncManager(providerA).sync();
  second.files = structuredClone(first.files).map((file) => ({
    ...file,
    metadata: { ...file.metadata, revision: "other" },
    content: JSON.stringify({
      ...JSON.parse(file.content),
      _sync: { revision: "other", parents: [] },
    }),
  }));
  await updateSong(id, { content: "[G]Local change after Google sync" });
  await new SyncManager(providerB).sync();
  const conflicts = await getSyncConflicts();
  expect(conflicts).toHaveLength(1);
  expect(conflicts[0].scope).toBe("onedrive:folder");
  expect(conflicts[0].id).toBe(`onedrive:folder::song:${id}`);
  expect(second.files).toHaveLength(1);
  await resolveConflict(conflicts[0].id, "local");
  await new SyncManager(providerB).sync();
  expect(await getSyncConflicts()).toHaveLength(0);
  expect(second.files).toHaveLength(2);
});
it("relays a remote edit between configured providers without merging their histories", async () => {
  const id = await seed();
  const first = Object.assign(new Cloud(), { getScope: () => "gdrive:folder" });
  const second = Object.assign(new Cloud(), { getScope: () => "dropbox:account" });
  const managerA = new SyncManager(first);
  const managerB = new SyncManager(second);
  await managerA.sync();
  await managerB.sync();
  const original = (await getSong(id)) as Song;
  const parent = second.files[0].metadata.revision;
  if (!parent) throw new Error("Missing revision");
  const edited = { ...original, content: "[G]Edited on another Dropbox device" };
  const next = await createSyncFile(edited, [parent]);
  await second.uploadFile(
    {
      id,
      title: edited.title,
      type: "song",
      lastModified: edited.lastModified,
      revision: next.revision,
      parents: [parent],
    },
    next.content,
  );
  await managerB.sync();
  expect((await getSong(id))?.content).toBe(edited.content);
  await managerA.sync();
  expect(first.files).toHaveLength(2);
  expect(first.files[1].metadata.parents).toEqual([first.files[0].metadata.revision]);
  expect(JSON.parse(first.files[1].content).content).toBe(edited.content);
  expect(await getSyncConflicts()).toHaveLength(0);
});
it("rejects a versioned remote file changed in place under an acknowledged revision", async () => {
  const id = await seed();
  const cloud = new Cloud();
  const manager = new SyncManager(cloud);
  await manager.sync();
  await updateSong(id, { content: "[G]Local edit" });
  const value = JSON.parse(cloud.files[0].content);
  cloud.files[0].content = JSON.stringify({
    ...value,
    content: "[D]Remote edit with same revision",
  });
  await manager.sync();
  expect(manager.getStatus().error).toContain("checksum mismatch");
  expect(await getSyncConflicts()).toHaveLength(0);
  expect(cloud.files).toHaveLength(1);
});
it("rejects a reviewed legacy remote version changed before resolution is shared", async () => {
  const id = await seed();
  const cloud = new Cloud();
  const manager = new SyncManager(cloud);
  await manager.sync();
  await updateSong(id, { content: "[G]Local edit" });
  const value = JSON.parse(cloud.files[0].content);
  const legacy = { ...value, _sync: { revision: value._sync.revision, parents: value._sync.parents } };
  cloud.files[0].content = JSON.stringify({ ...legacy, content: "[D]Remote edit" });
  await manager.sync();
  await resolveConflict(`song:${id}`, "local");
  cloud.files[0].content = JSON.stringify({ ...legacy, content: "[E]Another remote edit" });
  await manager.sync();
  expect(await getSyncConflicts()).toHaveLength(1);
  expect(cloud.files).toHaveLength(1);
});
