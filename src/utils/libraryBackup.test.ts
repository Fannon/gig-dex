import { beforeEach, describe, expect, it, vi } from "vitest";
import { addSetlist, addSong, getAllSetlists, getAllSongs, initDB, updateSong } from "../db";
import { exportLibrary, importChordPro, parseBackup, restoreLibrary } from "./libraryBackup";

beforeEach(async () => {
  const db = await initDB();
  const tx = db.transaction(["songs", "setlists", "tombstones", "syncBases", "syncConflicts"], "readwrite");
  await tx.objectStore("tombstones").clear();
  await tx.objectStore("syncBases").clear();
  await tx.objectStore("syncConflicts").clear();
  await tx.objectStore("songs").clear();
  await tx.objectStore("setlists").clear();
  await tx.done;
});
async function seed() {
  const id = await addSong({
    title: "Original",
    artist: "Artist",
    content: "{title: Original}\n[C]Test",
    composer: "Composer",
    subtitle: "Alternative",
    defaultTranspose: -4,
    tags: ["folk"],
  });
  await addSetlist({ name: "Gig", tags: ["venue"], description: "Friday", songIds: [id, id] });
  return id;
}
describe("library backups and imports", () => {
  it("imports standard ChordPro without rewriting source chords", async () => {
    const source = "{title: Standard song}\n{key:B}\n[Bm] [Bb]";
    const result = await importChordPro([{ name: "standard.cho", content: source }]);
    expect(result[0].status).toBe("imported");
    expect((await getAllSongs())[0]).toMatchObject({ key: "B", content: source });
  });
  it("preserves backup metadata and does not infer tags from copyright text", async () => {
    const source = "{copyright:Private collection}\n{key:B}\n[Bm] [B]";
    const id = await addSong({ title: "Copyright song", artist: "", content: source, key: "B", tags: ["live"] });
    const backup = await exportLibrary();
    await restoreLibrary(backup, "replace");
    const cleaned = (await getAllSongs()).find((song) => song.id === id);
    expect(cleaned).toMatchObject({ key: "B", tags: ["live"] });
    expect(cleaned?.content).toBe(source);
    await restoreLibrary(backup, "merge");
    expect(await getAllSongs()).toHaveLength(1);
    backup.songs[0].id = crypto.randomUUID();
    await restoreLibrary(backup, "merge");
    expect(await getAllSongs()).toHaveLength(2);
    const imported = (await getAllSongs()).find((song) => song.id !== id);
    expect(imported).toMatchObject({ key: "B", tags: ["live"] });
    expect(imported?.content).toBe(source);
  });
  it("exports all metadata and repeated song references, and restores atomically", async () => {
    await seed();
    const backup = await exportLibrary();
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup);
    await restoreLibrary(backup, "replace");
    expect((await getAllSongs())[0]).toMatchObject({
      composer: "Composer",
      defaultTranspose: -4,
      subtitle: "Alternative",
      tags: ["folk"],
      createdAt: backup.songs[0].createdAt,
    });
    expect((await getAllSetlists())[0]).toMatchObject({
      description: "Friday",
      tags: ["venue"],
      songIds: backup.setlists[0].songIds,
    });
  });
  it("merge skips identical records and preserves competing versions with remapped references", async () => {
    const id = await seed();
    const backup = await exportLibrary();
    await restoreLibrary(backup, "merge");
    expect(await getAllSongs()).toHaveLength(1);
    expect(await getAllSetlists()).toHaveLength(1);
    await updateSong(id, { title: "Local edit" });
    await restoreLibrary(backup, "merge");
    const songs = await getAllSongs();
    const lists = await getAllSetlists();
    expect(songs).toHaveLength(2);
    expect(lists).toHaveLength(2);
    const imported = songs.find((song) => song.title === "Original");
    expect(imported?.id).not.toBe(id);
    expect(lists.some((list) => list.songIds.every((songId) => songId === imported?.id))).toBe(true);
    expect(lists.some((list) => list.songIds.every((songId) => songId === id))).toBe(true);
  });
  it("adds setlists from a partial backup without replacing or duplicating existing songs", async () => {
    const songId = await seed();
    const full = await exportLibrary();
    const partial = {
      ...full,
      setlists: ["one", "two", "three"].map((id) => ({
        ...full.setlists[0],
        id,
        name: `Reconstructed ${id}`,
      })),
    };
    await restoreLibrary(partial, "merge");
    expect(await getAllSongs()).toHaveLength(1);
    expect((await getAllSetlists()).map((list) => list.name).sort()).toEqual([
      "Gig",
      "Reconstructed one",
      "Reconstructed three",
      "Reconstructed two",
    ]);
    expect((await getAllSetlists()).every((list) => list.songIds.every((id) => id === songId))).toBe(true);
    await restoreLibrary(partial, "merge");
    expect(await getAllSetlists()).toHaveLength(4);
  });
  it("rejects invalid backups before touching existing data", async () => {
    await seed();
    const original = await exportLibrary();
    for (const invalid of [
      { ...original, version: 2 },
      { ...original, songs: [...original.songs, original.songs[0]] },
      { ...original, songs: [] },
      { ...original, songs: [{ ...original.songs[0], tags: [7] }] },
    ]) {
      expect(() => parseBackup(JSON.stringify(invalid))).toThrow();
    }
    await expect(restoreLibrary({ ...original, songs: [] }, "replace")).rejects.toThrow();
    expect((await exportLibrary()).songs).toEqual(original.songs);
  });
  it("rolls back all writes if a merge fails after its first write", async () => {
    const id = await seed();
    const backup = await exportLibrary();
    await updateSong(id, { title: "Local edit" });
    backup.songs.unshift({ ...backup.songs[0], id: "new", title: "New" });
    const random = vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      throw new Error("Failure");
    });
    try {
      await expect(restoreLibrary(backup, "merge")).rejects.toThrow("Failure");
    } finally {
      random.mockRestore();
    }
    expect(await getAllSongs()).toHaveLength(1);
    expect((await getAllSongs())[0].title).toBe("Local edit");
  });
  it("imports multiple ChordPro files, preserves source and metadata, skips duplicates and reports errors", async () => {
    const text = "{title: Harbor}\n{artist: Artist}\n{composer: Composer}\n{tags: acoustic, gig}\n[C]Original line";
    const results = await importChordPro([
      { name: "one.cho", content: text },
      { name: "same.cho", content: text.replaceAll("\n", "\r\n") },
      { name: "empty.cho", content: "" },
      { name: "broken.cho", content: "{title: Repair}\n[C broken" },
    ]);
    expect(results.filter((result) => result.status === "imported")).toHaveLength(2);
    expect(results.find((result) => result.file === "same.cho")?.status).toBe("duplicate");
    expect(results.find((result) => result.file === "empty.cho")?.status).toBe("error");
    expect(results.find((result) => result.file === "broken.cho")?.message).toContain("raw text");
    expect((await getAllSongs()).find((song) => song.title === "Harbor")).toMatchObject({
      content: text,
      composer: "Composer",
      artist: "Artist",
      tags: ["acoustic", "gig"],
    });
  });
  it("stores imported text in the same normalized form used for duplicate detection", async () => {
    const text = "{title: Harbor}\n[C]Line";
    await importChordPro([{ name: "windows.cho", content: `  ${text.replaceAll("\n", "\r\n")}\r\n` }]);
    expect((await getAllSongs())[0].content).toBe(text);
    expect((await importChordPro([{ name: "unix.cho", content: text }]))[0].status).toBe("duplicate");
  });
});

it("backs up deletions and conflict snapshots, restores active records without reviving local deletions in merge mode", async () => {
  const { deleteSong } = await import("../db");
  const { saveConflict, getSyncConflicts } = await import("../sync/syncStore");
  const id = await seed();
  const backup = await exportLibrary();
  const local = backup.songs[0];
  await saveConflict({
    id: `song:${id}`,
    recordId: id,
    type: "song",
    local,
    remote: [{ revision: "remote", record: { ...local, content: "[G]Remote" } }],
    createdAt: new Date().toISOString(),
  });
  const withConflict = await exportLibrary();
  expect(parseBackup(JSON.stringify(withConflict)).conflicts).toHaveLength(1);
  await restoreLibrary(withConflict, "replace");
  expect(await getSyncConflicts()).toHaveLength(1);
  await deleteSong(id);
  const deletedBackup = await exportLibrary();
  expect(parseBackup(JSON.stringify(deletedBackup)).tombstones).toHaveLength(1);
  await restoreLibrary(backup, "merge");
  const [restored] = await getAllSongs();
  expect(restored.id).not.toBe(id);
  expect((await (await initDB()).getAll("tombstones"))[0].id).toBe(id);
  await restoreLibrary(backup, "replace");
  expect((await getAllSongs())[0].id).toBe(id);
  expect(await (await initDB()).get("tombstones", id)).toBeUndefined();
});

it("roundtrips provider-scoped conflicts and restores their identities", async () => {
  const id = await seed();
  const { getSong } = await import("../db");
  const local = await getSong(id);
  if (!local) throw new Error("Missing song");
  const { saveConflict, getSyncConflicts } = await import("../sync/syncStore");
  const scope = "onedrive:account-folder";
  await saveConflict({
    id: `${scope}::song:${id}`,
    scope,
    provider: "OneDrive",
    recordId: id,
    type: "song",
    local,
    remote: [{ revision: "remote", record: { ...local, content: "[G]Remote lyrics" } }],
    createdAt: new Date().toISOString(),
  });
  const backup = await exportLibrary();
  expect(parseBackup(JSON.stringify(backup)).conflicts?.[0].scope).toBe(scope);
  await restoreLibrary(backup, "replace");
  expect((await getSyncConflicts())[0].id).toBe(`${scope}::song:${id}`);
});

it("remaps songs in restored setlist conflicts to the imported song versions", async () => {
  const songId = await seed();
  const [list] = await getAllSetlists();
  const { saveConflict, getSyncConflicts } = await import("../sync/syncStore");
  await saveConflict({
    id: `setlist:${list.id}`,
    recordId: list.id,
    type: "setlist",
    local: list,
    remote: [
      {
        revision: "remote",
        record: { ...list, name: "Remote set", songSettings: [{ transpose: 2 }, { transpose: -1 }] },
      },
    ],
    createdAt: new Date().toISOString(),
  });
  const backup = await exportLibrary();
  await updateSong(songId, { title: "Local edit" });
  await restoreLibrary(backup, "merge");
  const importedSong = (await getAllSongs()).find((song) => song.title === "Original");
  const conflict = (await getSyncConflicts()).find((item) => item.recordId !== list.id);
  expect(importedSong?.id).not.toBe(songId);
  expect(conflict?.local).toMatchObject({ songIds: [importedSong?.id, importedSong?.id] });
  expect(conflict?.remote[0].record).toMatchObject({
    songIds: [importedSong?.id, importedSong?.id],
    songSettings: [{ transpose: 2 }, { transpose: -1 }],
  });
});
