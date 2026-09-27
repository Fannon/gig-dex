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

it("adds sync stores to an existing v2 library without changing records", async () => {
	const db = await openDB("GigDexDB", 2, {
		upgrade(db) {
			const songs = db.createObjectStore("songs", { keyPath: "id" });
			songs.createIndex("by-title", "title");
			songs.createIndex("by-artist", "artist");
			songs.createIndex("by-updated", "lastModified");
			const lists = db.createObjectStore("setlists", { keyPath: "id" });
			lists.createIndex("by-name", "name");
			lists.createIndex("by-updated", "lastModified");
		},
	});
	const song = {
		id: "old",
		title: "Stored",
		artist: "Artist",
		content: "[C]Original",
		tags: ["test"],
		createdAt: "2025-01-01T00:00:00Z",
		lastModified: "2025-01-01T00:00:00Z",
	};
	await db.put("songs", song);
	db.close();
	const { initDB } = await import("./db");
	const upgraded = await initDB();
	try {
		expect(await upgraded.get("songs", "old")).toEqual(song);
		expect(upgraded.objectStoreNames.contains("syncConflicts")).toBe(true);
		expect(upgraded.objectStoreNames.contains("tombstones")).toBe(true);
	} finally {
		upgraded.close();
	}
});

it("adds the metadata cache to v3 while preserving songs and acknowledged sync history", async () => {
	const previous = await openDB("GigDexDB", 3, {
		upgrade(db) {
			for (const store of ["songs", "setlists", "tombstones", "syncBases", "syncConflicts"])
				db.createObjectStore(store, { keyPath: "id" });
		},
	});
	const song = {
		id: "stored",
		title: "Stored",
		artist: "Test",
		content: "[C]Original",
		tags: [],
		createdAt: "2025-01-01T00:00:00Z",
		lastModified: "2025-01-01T00:00:00Z",
	};
	const base = { id: "song:stored", fingerprint: "original", revisions: ["r1"] };
	await previous.put("songs", song);
	await previous.put("syncBases", base);
	previous.close();
	const { initDB } = await import("./db");
	const upgraded = await initDB();
	try {
		expect(await upgraded.get("songs", "stored")).toEqual(song);
		expect(await upgraded.get("syncBases", "song:stored")).toEqual(base);
		expect(upgraded.objectStoreNames.contains("revisionCache")).toBe(true);
	} finally {
		upgraded.close();
	}
});
