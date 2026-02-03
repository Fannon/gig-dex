import type { DBSchema, IDBPDatabase } from "idb";
import { openDB } from "idb";

// Database schema types
// Contains ALL ChordPro metadata fields for full compatibility
interface Song {
	id: string;
	title: string;
	artist: string;
	content: string; // ChordPro format - this is the source of truth for lyrics/chords
	// Primary metadata (shown in forms)
	key?: string;
	tempo?: number;
	capo?: number;
	time?: string; // e.g., "4/4", "3/4"
	tags: string[];
	// Extended metadata (preserved but not in simple forms)
	subtitle?: string;
	composer?: string;
	lyricist?: string;
	copyright?: string;
	album?: string;
	year?: number;
	duration?: string; // e.g., "3:45"
	// Timestamps (ISO strings for better sync/storage consistency)
	lastModified: string;
	createdAt: string;
}

interface Setlist {
	id: string;
	name: string;
	description?: string;
	songIds: string[]; // Reference song ids by string
	lastModified: string;
	createdAt: string;
}

interface GigDexDB extends DBSchema {
	songs: {
		key: string;
		value: Song;
		indexes: {
			"by-title": string;
			"by-artist": string;
			"by-updated": string;
		};
	};
	setlists: {
		key: string;
		value: Setlist;
		indexes: {
			"by-name": string;
			"by-updated": string;
		};
	};
}

const DB_NAME = "GigDexDB";
const DB_VERSION = 2; // Bumped version for schema change

let dbInstance: IDBPDatabase<GigDexDB> | null = null;

export const initDB = async (): Promise<IDBPDatabase<GigDexDB>> => {
	if (dbInstance) return dbInstance;

	dbInstance = await openDB<GigDexDB>(DB_NAME, DB_VERSION, {
		upgrade(db, oldVersion) {
			// Wipe old stores if upgrading from version 1 (numeric IDs to string IDs)
			if (oldVersion < 2) {
				if (db.objectStoreNames.contains("songs")) db.deleteObjectStore("songs");
				if (db.objectStoreNames.contains("setlists")) db.deleteObjectStore("setlists");
			}

			// Songs store
			if (!db.objectStoreNames.contains("songs")) {
				const songsStore = db.createObjectStore("songs", { keyPath: "id" });
				songsStore.createIndex("by-title", "title");
				songsStore.createIndex("by-artist", "artist");
				songsStore.createIndex("by-updated", "lastModified");
			}

			// Setlists store
			if (!db.objectStoreNames.contains("setlists")) {
				const setlistsStore = db.createObjectStore("setlists", {
					keyPath: "id",
				});
				setlistsStore.createIndex("by-name", "name");
				setlistsStore.createIndex("by-updated", "lastModified");
			}
		},
	});

	return dbInstance;
};

// Helper to generate IDs and timestamps
const generateId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// Song operations
export const addSong = async (
	song: Omit<Song, "id" | "lastModified" | "createdAt">,
): Promise<string> => {
	const db = await initDB();
	const currentTime = now();
	const newSong: Song = {
		...song,
		id: generateId(),
		lastModified: currentTime,
		createdAt: currentTime,
	};
	await db.add("songs", newSong);
	return newSong.id;
};

export const updateSong = async (id: string, updates: Partial<Song>): Promise<void> => {
	const db = await initDB();
	const existing = await db.get("songs", id);
	if (!existing) throw new Error("Song not found");

	await db.put("songs", {
		...existing,
		...updates,
		lastModified: now(),
	});
};

export const saveSong = async (song: Song): Promise<void> => {
	const db = await initDB();
	await db.put("songs", song);
};

export const deleteSong = async (id: string): Promise<void> => {
	const db = await initDB();
	await db.delete("songs", id);
};

export const getSong = async (id: string): Promise<Song | undefined> => {
	const db = await initDB();
	return db.get("songs", id);
};

export const getAllSongs = async (): Promise<Song[]> => {
	const db = await initDB();
	return db.getAllFromIndex("songs", "by-updated");
};

export const searchSongs = async (query: string): Promise<Song[]> => {
	const songs = await getAllSongs();
	const lowerQuery = query.toLowerCase();
	return songs.filter(
		(song) =>
			song.title.toLowerCase().includes(lowerQuery) ||
			song.artist.toLowerCase().includes(lowerQuery) ||
			song.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)),
	);
};

// Setlist operations
export const addSetlist = async (
	setlist: Omit<Setlist, "id" | "lastModified" | "createdAt">,
): Promise<string> => {
	const db = await initDB();
	const currentTime = now();
	const newSetlist: Setlist = {
		...setlist,
		id: generateId(),
		lastModified: currentTime,
		createdAt: currentTime,
	};
	await db.add("setlists", newSetlist);
	return newSetlist.id;
};

export const updateSetlist = async (id: string, updates: Partial<Setlist>): Promise<void> => {
	const db = await initDB();
	const existing = await db.get("setlists", id);
	if (!existing) throw new Error("Setlist not found");

	await db.put("setlists", {
		...existing,
		...updates,
		lastModified: now(),
	});
};

export const saveSetlist = async (setlist: Setlist): Promise<void> => {
	const db = await initDB();
	await db.put("setlists", setlist);
};

export const deleteSetlist = async (id: string): Promise<void> => {
	const db = await initDB();
	await db.delete("setlists", id);
};

export const getSetlist = async (id: string): Promise<Setlist | undefined> => {
	const db = await initDB();
	return db.get("setlists", id);
};

export const getAllSetlists = async (): Promise<Setlist[]> => {
	const db = await initDB();
	return db.getAllFromIndex("setlists", "by-updated");
};

export const getSetlistWithSongs = async (
	id: string,
): Promise<{ setlist: Setlist; songs: Song[] } | undefined> => {
	const setlist = await getSetlist(id);
	if (!setlist) return undefined;

	const db = await initDB();
	const songs: Song[] = [];
	for (const songId of setlist.songIds) {
		const song = await db.get("songs", songId);
		if (song) songs.push(song);
	}

	return { setlist, songs };
};

export type { Song, Setlist };
