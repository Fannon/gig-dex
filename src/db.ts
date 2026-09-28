import type { DBSchema, IDBPDatabase } from "idb";
import { openDB } from "idb";
import type { DeletionRecord, SyncBase, SyncConflict } from "./sync/records";
import type { SyncMetadata } from "./sync/types";
import { matchesLibrarySearch } from "./utils/librarySearch";

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
  defaultTranspose?: number; // Starting transpose; copied into each newly added set occurrence
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

export interface SetlistSongSettings {
  transpose: number;
  capo?: number;
}

interface Setlist {
  date?: string; // YYYY-MM-DD, the gig/rehearsal date, independent of timezone
  id: string;
  name: string;
  description?: string;
  tags?: string[]; // Optional for libraries created before setlist tagging
  songIds: string[]; // Reference song ids by string
  songSettings?: SetlistSongSettings[]; // Parallel occurrence settings; absent entries use defaults
  lastModified: string;
  createdAt: string;
}

interface GigDexDB extends DBSchema {
  syncHandles: { key: string; value: { id: string; handle: FileSystemDirectoryHandle } };
  revisionCache: { key: string; value: SyncMetadata };
  tombstones: { key: string; value: DeletionRecord };
  syncBases: { key: string; value: SyncBase };
  syncConflicts: { key: string; value: SyncConflict };
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
const DB_VERSION = 5; // Adds persisted local-folder handles without changing library records

type LegacySong = Omit<Song, "id" | "lastModified" | "createdAt"> & {
  id: number;
  lastUpdated: Date;
  createdAt: Date;
};
type LegacySetlist = Omit<Setlist, "id" | "songIds" | "lastModified" | "createdAt"> & {
  id: number;
  songIds: number[];
  lastUpdated: Date;
  createdAt: Date;
};

function createStores(db: IDBPDatabase<GigDexDB>) {
  const songs = db.createObjectStore("songs", { keyPath: "id" });
  songs.createIndex("by-title", "title");
  songs.createIndex("by-artist", "artist");
  songs.createIndex("by-updated", "lastModified");
  const setlists = db.createObjectStore("setlists", { keyPath: "id" });
  setlists.createIndex("by-name", "name");
  setlists.createIndex("by-updated", "lastModified");
}

let dbPromise: Promise<IDBPDatabase<GigDexDB>> | null = null;

export const initDB = async (): Promise<IDBPDatabase<GigDexDB>> => {
  if (dbPromise) return dbPromise;

  dbPromise = openDB<GigDexDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 5) db.createObjectStore("syncHandles");
      if (oldVersion < 4) db.createObjectStore("revisionCache");
      if (oldVersion < 3) {
        db.createObjectStore("tombstones", { keyPath: "id" });
        db.createObjectStore("syncBases", { keyPath: "id" });
        db.createObjectStore("syncConflicts", { keyPath: "id" });
      }
      if (oldVersion === 0) {
        createStores(db);
        return;
      }
      if (oldVersion !== 1) return;
      // openDB reports aborted upgrades to the caller; also consume the
      // transaction promise so rollback does not create an unhandled rejection.
      void transaction.done.catch(() => {});
      // Read before replacing the stores. All writes remain in the upgrade
      // transaction, so a failed conversion rolls back to the intact v1 data.
      const migrate = async () => {
        const [oldSongs, oldSetlists] = await Promise.all([
          transaction.objectStore("songs").getAll() as unknown as Promise<LegacySong[]>,
          transaction.objectStore("setlists").getAll() as unknown as Promise<LegacySetlist[]>,
        ]);
        const songIds = new Map(oldSongs.map((song) => [song.id, crypto.randomUUID()]));
        db.deleteObjectStore("songs");
        db.deleteObjectStore("setlists");
        createStores(db);
        for (const { id, lastUpdated, createdAt, ...song } of oldSongs) {
          const newId = songIds.get(id);
          if (!newId) throw new Error("Missing migrated song ID");
          await transaction.objectStore("songs").put({
            ...song,
            id: newId,
            lastModified: new Date(lastUpdated).toISOString(),
            createdAt: new Date(createdAt).toISOString(),
          });
        }
        for (const { id: _id, songIds: oldIds, lastUpdated, createdAt, ...setlist } of oldSetlists) {
          await transaction.objectStore("setlists").put({
            ...setlist,
            id: crypto.randomUUID(),
            songIds: oldIds.flatMap((id) => {
              const newId = songIds.get(id);
              return newId ? [newId] : [];
            }),
            lastModified: new Date(lastUpdated).toISOString(),
            createdAt: new Date(createdAt).toISOString(),
          });
        }
      };
      void migrate().catch(() => transaction.abort());
    },
    blocking() {
      void dbPromise?.then((db) => db.close());
      dbPromise = null;
    },
    terminated() {
      dbPromise = null;
    },
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });

  return dbPromise;
};

export const LIBRARY_CHANGED_EVENT = "gig-dex-library-changed";
export const notifyLibraryChanged = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT));
};

// Helper to generate IDs and timestamps
const generateId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// Song operations
export const addSong = async (song: Omit<Song, "id" | "lastModified" | "createdAt">): Promise<string> => {
  const db = await initDB();
  const currentTime = now();
  const newSong: Song = {
    ...song,
    id: generateId(),
    lastModified: currentTime,
    createdAt: currentTime,
  };
  await db.add("songs", newSong);
  notifyLibraryChanged();
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
  notifyLibraryChanged();
};

export const saveSong = async (song: Song): Promise<void> => {
  const db = await initDB();
  await db.put("songs", song);
  notifyLibraryChanged();
};

export const deleteSong = async (id: string): Promise<void> => {
  const db = await initDB();
  const tx = db.transaction(["songs", "setlists", "tombstones"], "readwrite");
  const song = await tx.objectStore("songs").get(id);
  if (song)
    await tx.objectStore("tombstones").put({
      id,
      type: "song",
      deleted: true,
      title: song.title,
      createdAt: song.createdAt,
      lastModified: now(),
    });
  await tx.objectStore("songs").delete(id);

  const setlists = await tx.objectStore("setlists").getAll();
  for (const setlist of setlists) {
    if (!setlist.songIds.includes(id)) continue;
    await tx.objectStore("setlists").put({
      ...setlist,
      songIds: setlist.songIds.filter((songId) => songId !== id),
      songSettings: setlist.songSettings?.filter((_, index) => setlist.songIds[index] !== id),
      lastModified: now(),
    });
  }

  await tx.done;
  notifyLibraryChanged();
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
  return songs.filter((song) =>
    matchesLibrarySearch([song.title, song.subtitle ?? "", song.artist, ...song.tags].join(" "), song.tags, query),
  );
};

// Setlist operations
export const addSetlist = async (setlist: Omit<Setlist, "id" | "lastModified" | "createdAt">): Promise<string> => {
  const db = await initDB();
  const currentTime = now();
  const newSetlist: Setlist = {
    ...setlist,
    tags: setlist.tags ?? [],
    id: generateId(),
    lastModified: currentTime,
    createdAt: currentTime,
  };
  await db.add("setlists", newSetlist);
  notifyLibraryChanged();
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
  notifyLibraryChanged();
};

export const saveSetlist = async (setlist: Setlist): Promise<void> => {
  const db = await initDB();
  await db.put("setlists", setlist);
  notifyLibraryChanged();
};

export const deleteSetlist = async (id: string): Promise<void> => {
  const db = await initDB();
  const tx = db.transaction(["setlists", "tombstones"], "readwrite");
  const list = await tx.objectStore("setlists").get(id);
  if (list)
    await tx.objectStore("tombstones").put({
      id,
      type: "setlist",
      deleted: true,
      title: list.name,
      createdAt: list.createdAt,
      lastModified: now(),
    });
  await tx.objectStore("setlists").delete(id);
  await tx.done;
  notifyLibraryChanged();
};

export const getSetlist = async (id: string): Promise<Setlist | undefined> => {
  const db = await initDB();
  return db.get("setlists", id);
};

/** Copy the complete setlist while assigning a fresh identity and timestamps. */
export const duplicateSetlist = async (id: string, name: string): Promise<string> => {
  const source = await getSetlist(id);
  if (!source) throw new Error("Setlist not found");
  const { id: _id, createdAt: _createdAt, lastModified: _lastModified, ...data } = source;
  return addSetlist({ ...data, name });
};

export const getAllSetlists = async (): Promise<Setlist[]> => {
  const db = await initDB();
  return db.getAllFromIndex("setlists", "by-updated");
};

export const getSetlistWithSongs = async (id: string): Promise<{ setlist: Setlist; songs: Song[] } | undefined> => {
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
