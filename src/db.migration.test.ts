import { deleteDB, openDB } from "idb";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(async () => {
	await deleteDB("GigDexDB");
	vi.resetModules();
});

async function seedLegacy(invalidDate = false) {
	const db = await openDB("GigDexDB", 1, {
		upgrade(db) {
			db.createObjectStore("songs", { keyPath: "id", autoIncrement: true });
			db.createObjectStore("setlists", { keyPath: "id", autoIncrement: true });
		},
	});
	const createdAt = new Date("2025-01-01T12:00:00Z");
	await db.put("songs", {
		id: 7,
		title: "Legacy song",
		artist: "Test artist",
		content: "[C]Original text",
		tags: ["test"],
		composer: "Test composer",
		createdAt,
		lastUpdated: invalidDate ? new Date("invalid") : createdAt,
	});
	await db.put("songs", {
		id: 8,
		title: "Second song",
		artist: "Test",
		content: "[G]Second text",
		tags: [],
		createdAt,
		lastUpdated: createdAt,
	});
	await db.put("setlists", {
		id: 3,
		name: "Legacy setlist",
		songIds: [8, 7, 8],
		createdAt,
		lastUpdated: createdAt,
	});
	db.close();
}

describe("database migration", () => {
	it("preserves songs, metadata, timestamps, and setlist order when migrating numeric IDs", async () => {
		await seedLegacy();
		const { initDB, getAllSongs, getAllSetlists, getSetlistWithSongs } = await import("./db");
		const db = await initDB();
		try {
			const songs = await getAllSongs();
			expect(songs).toHaveLength(2);
			expect(songs.find((song) => song.title === "Legacy song")).toMatchObject({
				content: "[C]Original text",
				composer: "Test composer",
				tags: ["test"],
				createdAt: "2025-01-01T12:00:00.000Z",
				lastModified: "2025-01-01T12:00:00.000Z",
			});
			expect(songs.every((song) => typeof song.id === "string")).toBe(true);
			const [setlist] = await getAllSetlists();
			const result = await getSetlistWithSongs(setlist.id);
			expect(result?.songs.map((song) => song.title)).toEqual([
				"Second song",
				"Legacy song",
				"Second song",
			]);
		} finally {
			db.close();
		}
	});
	it("rolls back to the original data if conversion fails", async () => {
		await seedLegacy(true);
		const { initDB } = await import("./db");
		await expect(initDB()).rejects.toThrow();
		const db = await openDB("GigDexDB", 1);
		try {
			expect((await db.get("songs", 7)).content).toBe("[C]Original text");
			expect(await db.count("setlists")).toBe(1);
		} finally {
			db.close();
		}
	});
});
