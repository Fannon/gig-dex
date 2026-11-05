import { beforeEach, describe, expect, it } from "vitest";
import {
  addSetlist,
  addSong,
  deleteSetlist,
  deleteSong,
  duplicateSetlist,
  getAllSetlists,
  getAllSongs,
  getSetlist,
  getSong,
  getSongs,
  initDB,
  restoreSetlist,
  restoreSong,
  updateSetlist,
  updateSong,
} from "./db";

describe("Database", () => {
  beforeEach(async () => {
    // Clear IndexedDB before each test
    const db = await initDB();
    const tx = db.transaction(["songs", "setlists", "tombstones", "syncBases", "syncConflicts"], "readwrite");
    await tx.objectStore("tombstones").clear();
    await tx.objectStore("syncBases").clear();
    await tx.objectStore("syncConflicts").clear();
    await tx.objectStore("songs").clear();
    await tx.objectStore("setlists").clear();
    await tx.done;
  });

  it("reads requested song occurrences in order, retains missing slots and ignores unrelated songs", async () => {
    const first = await addSong({ title: "First", artist: "", content: "[C]First", tags: [] });
    const second = await addSong({ title: "Second", artist: "", content: "[D]Second", tags: [] });
    await addSong({ title: "Unrelated", artist: "", content: "[E]Unrelated", tags: [] });
    expect((await getSongs([second, first, second, "missing"])).map((song) => song?.title)).toEqual([
      "Second",
      "First",
      "Second",
      undefined,
    ]);
    expect(await getSongs([])).toEqual([]);
  });

  it("duplicates full setlist metadata and repeated references without changing the source", async () => {
    const id = await addSetlist({
      name: "Original",
      description: "Venue",
      tags: ["acoustic"],
      songIds: ["a", "b", "a"],
      songSettings: [{ transpose: 2 }, { transpose: -1 }, { transpose: 0 }],
    });
    const source = await getSetlist(id);
    const copyId = await duplicateSetlist(id, "Original (copy)");
    expect(copyId).not.toBe(id);
    expect(await getSetlist(copyId)).toMatchObject({
      name: "Original (copy)",
      description: "Venue",
      tags: ["acoustic"],
      songIds: ["a", "b", "a"],
      songSettings: [{ transpose: 2 }, { transpose: -1 }, { transpose: 0 }],
    });
    await updateSetlist(copyId, { songIds: ["b"], songSettings: [{ transpose: -1 }] });
    expect(await getSetlist(id)).toEqual(source);
    await expect(duplicateSetlist("missing", "Copy")).rejects.toThrow("Setlist not found");
  });

  it("undoing a song deletion restores repeated setlist entries with their keys", async () => {
    const id = await addSong({ title: "Undo me", artist: "", content: "[C]Test", tags: ["x"] });
    const other = await addSong({ title: "Other", artist: "", content: "[D]Test", tags: [] });
    const list = await addSetlist({
      name: "Gig",
      songIds: [id, other, id],
      songSettings: [{ transpose: 2 }, { transpose: -1 }, { transpose: 4 }],
    });
    const deleted = await deleteSong(id);
    if (!deleted) throw new Error("Nothing deleted");
    // Changes made after the deletion survive the undo.
    const afterDelete = await getSetlist(list);
    await updateSetlist(list, { name: "Renamed", songSettings: [{ transpose: -3 }] });
    expect(afterDelete?.songIds).toEqual([other]);
    await restoreSong(deleted);
    expect(await getSong(id)).toMatchObject({ title: "Undo me", tags: ["x"] });
    expect(await getSetlist(list)).toMatchObject({
      name: "Renamed",
      songIds: [id, other, id],
      songSettings: [{ transpose: 2 }, { transpose: -3 }, { transpose: 4 }],
    });
    expect(await (await initDB()).get("tombstones", id)).toBeUndefined();
  });

  it("undoing a setlist deletion restores it and clears its deletion record", async () => {
    const list = await addSetlist({ name: "Gig", songIds: ["a"], songSettings: [{ transpose: 1 }] });
    const deleted = await deleteSetlist(list);
    if (!deleted) throw new Error("Nothing deleted");
    expect(await getSetlist(list)).toBeUndefined();
    await restoreSetlist(deleted);
    expect(await getSetlist(list)).toMatchObject({ name: "Gig", songIds: ["a"], songSettings: [{ transpose: 1 }] });
    expect(await (await initDB()).get("tombstones", list)).toBeUndefined();
  });

  it("deleting repeated songs preserves surviving occurrence settings", async () => {
    const id = await addSong({ title: "Remove", artist: "", content: "[C]Test", tags: [] });
    const list = await addSetlist({
      name: "Test",
      songIds: [id, "other", id],
      songSettings: [{ transpose: 2 }, { transpose: -3 }, { transpose: 4 }],
    });
    await deleteSong(id);
    expect(await getSetlist(list)).toMatchObject({
      songIds: ["other"],
      songSettings: [{ transpose: -3 }],
    });
  });

  it("preserves independent song and setlist changes made concurrently", async () => {
    const songId = await addSong({ title: "Original", artist: "", content: "[C]Test", tags: [] });
    await Promise.all([updateSong(songId, { title: "Edited" }), updateSong(songId, { tags: ["gig"] })]);
    expect(await getSong(songId)).toMatchObject({ title: "Edited", tags: ["gig"] });

    const listId = await addSetlist({ name: "Original", songIds: [] });
    await Promise.all([
      updateSetlist(listId, { name: "Edited" }),
      updateSetlist(listId, { songIds: [songId], songSettings: [{ transpose: 2 }] }),
    ]);
    expect(await getSetlist(listId)).toMatchObject({
      name: "Edited",
      songIds: [songId],
      songSettings: [{ transpose: 2 }],
    });
  });

  it("does not resurrect records when deletion races an update", async () => {
    const songId = await addSong({ title: "Original", artist: "", content: "[C]Test", tags: [] });
    const listId = await addSetlist({ name: "Original", songIds: [] });
    await Promise.all([updateSong(songId, { title: "Edited" }), deleteSong(songId)]);
    await Promise.all([updateSetlist(listId, { name: "Edited" }), deleteSetlist(listId)]);
    expect(await getSong(songId)).toBeUndefined();
    expect(await getSetlist(listId)).toBeUndefined();
  });

  describe("Song Operations", () => {
    it("should add a song and retrieve it", async () => {
      const songId = await addSong({
        title: "Test Song",
        artist: "Test Artist",
        content: "[G]Test content",
        key: "G",
        tags: ["rock"],
      });

      expect(songId).toBeDefined();
      expect(typeof songId).toBe("string");

      const song = await getSong(songId);
      expect(song).toBeDefined();
      expect(song?.title).toBe("Test Song");
      expect(song?.artist).toBe("Test Artist");
      expect(song?.key).toBe("G");
      expect(song?.tags).toEqual(["rock"]);
    });

    it("should get all songs", async () => {
      await addSong({
        title: "Song 1",
        artist: "Artist 1",
        content: "Content 1",
        tags: [],
      });

      await addSong({
        title: "Song 2",
        artist: "Artist 2",
        content: "Content 2",
        tags: [],
      });

      const songs = await getAllSongs();
      expect(songs.length).toBe(2);
    });

    it("should update a song", async () => {
      const songId = await addSong({
        title: "Original Title",
        artist: "Original Artist",
        content: "Content",
        tags: [],
      });

      await updateSong(songId, { title: "Updated Title" });

      const song = await getSong(songId);
      expect(song?.title).toBe("Updated Title");
      expect(song?.artist).toBe("Original Artist"); // Unchanged
    });

    it("should delete a song", async () => {
      const songId = await addSong({
        title: "To Delete",
        artist: "Artist",
        content: "Content",
        tags: [],
      });

      await deleteSong(songId);

      const song = await getSong(songId);
      expect(song).toBeUndefined();
    });

    it("should remove deleted songs from setlists", async () => {
      const songId = await addSong({
        title: "Setlist Song",
        artist: "Artist",
        content: "Content",
        tags: [],
      });

      const setlistId = await addSetlist({
        name: "Cleanup Test",
        songIds: [songId],
      });

      await deleteSong(songId);

      const setlist = await getSetlist(setlistId);
      expect(setlist?.songIds).toEqual([]);
    });

    it("should throw error when updating non-existent song", async () => {
      await expect(updateSong("non-existent-id", { title: "New" })).rejects.toThrow("Song not found");
    });
  });

  describe("Setlist Operations", () => {
    it("should add a setlist and retrieve it", async () => {
      const setlistId = await addSetlist({
        name: "Friday Night Gig",
        songIds: [],
      });

      const setlist = await getSetlist(setlistId);
      expect(setlist).toBeDefined();
      expect(setlist?.name).toBe("Friday Night Gig");
      expect(setlist?.songIds).toEqual([]);
    });

    it("should get all setlists", async () => {
      await addSetlist({ name: "Setlist 1", songIds: [] });
      await addSetlist({ name: "Setlist 2", songIds: [] });

      const setlists = await getAllSetlists();
      expect(setlists.length).toBe(2);
    });

    it("should update a setlist", async () => {
      const setlistId = await addSetlist({
        name: "Original Name",
        songIds: [],
      });

      await updateSetlist(setlistId, { name: "Updated Name" });

      const setlist = await getSetlist(setlistId);
      expect(setlist?.name).toBe("Updated Name");
    });

    it("should update setlist song IDs", async () => {
      const setlistId = await addSetlist({
        name: "Gig",
        songIds: [],
      });

      await updateSetlist(setlistId, { songIds: ["1", "2", "3"] });

      const setlist = await getSetlist(setlistId);
      expect(setlist?.songIds).toEqual(["1", "2", "3"]);
    });

    it("should delete a setlist", async () => {
      const setlistId = await addSetlist({
        name: "To Delete",
        songIds: [],
      });

      await deleteSetlist(setlistId);

      const setlist = await getSetlist(setlistId);
      expect(setlist).toBeUndefined();
    });

    it("should throw error when updating non-existent setlist", async () => {
      await expect(updateSetlist("non-existent-id", { name: "New" })).rejects.toThrow("Setlist not found");
    });
  });
});
