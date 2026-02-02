import { beforeEach, describe, expect, it } from "vitest";
import {
	addSetlist,
	addSong,
	deleteSetlist,
	deleteSong,
	getAllSetlists,
	getAllSongs,
	getSetlist,
	getSetlistWithSongs,
	getSong,
	initDB,
	searchSongs,
	updateSetlist,
	updateSong,
} from "./db";

describe("Database", () => {
	beforeEach(async () => {
		// Clear IndexedDB before each test
		const db = await initDB();
		const tx = db.transaction(["songs", "setlists"], "readwrite");
		await tx.objectStore("songs").clear();
		await tx.objectStore("setlists").clear();
		await tx.done;
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
			expect(typeof songId).toBe("number");

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

		it("should search songs by title", async () => {
			await addSong({
				title: "Amazing Grace",
				artist: "Traditional",
				content: "Content",
				tags: ["hymn"],
			});

			await addSong({
				title: "Sweet Home Alabama",
				artist: "Lynyrd Skynyrd",
				content: "Content",
				tags: ["rock"],
			});

			const results = await searchSongs("Amazing");
			expect(results.length).toBe(1);
			expect(results[0].title).toBe("Amazing Grace");
		});

		it("should search songs by artist", async () => {
			await addSong({
				title: "Song 1",
				artist: "The Beatles",
				content: "Content",
				tags: [],
			});

			await addSong({
				title: "Song 2",
				artist: "The Rolling Stones",
				content: "Content",
				tags: [],
			});

			const results = await searchSongs("Beatles");
			expect(results.length).toBe(1);
			expect(results[0].artist).toBe("The Beatles");
		});

		it("should search songs by tag", async () => {
			await addSong({
				title: "Rock Song",
				artist: "Artist",
				content: "Content",
				tags: ["rock", "classic"],
			});

			await addSong({
				title: "Jazz Song",
				artist: "Artist",
				content: "Content",
				tags: ["jazz"],
			});

			const results = await searchSongs("rock");
			expect(results.length).toBe(1);
			expect(results[0].title).toBe("Rock Song");
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

			await updateSetlist(setlistId, { songIds: [1, 2, 3] });

			const setlist = await getSetlist(setlistId);
			expect(setlist?.songIds).toEqual([1, 2, 3]);
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

		it("should get setlist with songs", async () => {
			const song1Id = await addSong({
				title: "Song 1",
				artist: "Artist",
				content: "Content",
				tags: [],
			});

			const song2Id = await addSong({
				title: "Song 2",
				artist: "Artist",
				content: "Content",
				tags: [],
			});

			const setlistId = await addSetlist({
				name: "My Gig",
				songIds: [song1Id, song2Id],
			});

			const result = await getSetlistWithSongs(setlistId);
			expect(result).toBeDefined();
			expect(result?.setlist.name).toBe("My Gig");
			expect(result?.songs.length).toBe(2);
			expect(result?.songs[0].title).toBe("Song 1");
			expect(result?.songs[1].title).toBe("Song 2");
		});
	});
});
