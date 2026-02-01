import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

// Database schema types
interface Song {
  id?: number;
  title: string;
  artist: string;
  content: string; // ChordPro format
  key?: string;
  tempo?: number;
  tags: string[];
  lastUpdated: Date;
  createdAt: Date;
}

interface Setlist {
  id?: number;
  name: string;
  description?: string;
  songIds: number[];
  lastUpdated: Date;
  createdAt: Date;
}

interface GigDexDB extends DBSchema {
  songs: {
    key: number;
    value: Song;
    indexes: {
      'by-title': string;
      'by-artist': string;
      'by-updated': Date;
    };
  };
  setlists: {
    key: number;
    value: Setlist;
    indexes: {
      'by-name': string;
      'by-updated': Date;
    };
  };
}

const DB_NAME = 'GigDexDB';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<GigDexDB> | null = null;

export const initDB = async (): Promise<IDBPDatabase<GigDexDB>> => {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<GigDexDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Songs store
      if (!db.objectStoreNames.contains('songs')) {
        const songsStore = db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
        songsStore.createIndex('by-title', 'title');
        songsStore.createIndex('by-artist', 'artist');
        songsStore.createIndex('by-updated', 'lastUpdated');
      }

      // Setlists store
      if (!db.objectStoreNames.contains('setlists')) {
        const setlistsStore = db.createObjectStore('setlists', { keyPath: 'id', autoIncrement: true });
        setlistsStore.createIndex('by-name', 'name');
        setlistsStore.createIndex('by-updated', 'lastUpdated');
      }
    },
  });

  return dbInstance;
};

// Song operations
export const addSong = async (song: Omit<Song, 'id' | 'lastUpdated' | 'createdAt'>): Promise<number> => {
  const db = await initDB();
  const now = new Date();
  return db.add('songs', {
    ...song,
    lastUpdated: now,
    createdAt: now,
  });
};

export const updateSong = async (id: number, updates: Partial<Song>): Promise<void> => {
  const db = await initDB();
  const existing = await db.get('songs', id);
  if (!existing) throw new Error('Song not found');

  await db.put('songs', {
    ...existing,
    ...updates,
    lastUpdated: new Date(),
  });
};

export const deleteSong = async (id: number): Promise<void> => {
  const db = await initDB();
  await db.delete('songs', id);
};

export const getSong = async (id: number): Promise<Song | undefined> => {
  const db = await initDB();
  return db.get('songs', id);
};

export const getAllSongs = async (): Promise<Song[]> => {
  const db = await initDB();
  return db.getAllFromIndex('songs', 'by-updated');
};

export const searchSongs = async (query: string): Promise<Song[]> => {
  const songs = await getAllSongs();
  const lowerQuery = query.toLowerCase();
  return songs.filter(
    song =>
      song.title.toLowerCase().includes(lowerQuery) ||
      song.artist.toLowerCase().includes(lowerQuery) ||
      song.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
};

// Setlist operations
export const addSetlist = async (setlist: Omit<Setlist, 'id' | 'lastUpdated' | 'createdAt'>): Promise<number> => {
  const db = await initDB();
  const now = new Date();
  return db.add('setlists', {
    ...setlist,
    lastUpdated: now,
    createdAt: now,
  });
};

export const updateSetlist = async (id: number, updates: Partial<Setlist>): Promise<void> => {
  const db = await initDB();
  const existing = await db.get('setlists', id);
  if (!existing) throw new Error('Setlist not found');

  await db.put('setlists', {
    ...existing,
    ...updates,
    lastUpdated: new Date(),
  });
};

export const deleteSetlist = async (id: number): Promise<void> => {
  const db = await initDB();
  await db.delete('setlists', id);
};

export const getSetlist = async (id: number): Promise<Setlist | undefined> => {
  const db = await initDB();
  return db.get('setlists', id);
};

export const getAllSetlists = async (): Promise<Setlist[]> => {
  const db = await initDB();
  return db.getAllFromIndex('setlists', 'by-updated');
};

export const getSetlistWithSongs = async (id: number): Promise<{ setlist: Setlist; songs: Song[] } | undefined> => {
  const setlist = await getSetlist(id);
  if (!setlist) return undefined;

  const db = await initDB();
  const songs: Song[] = [];
  for (const songId of setlist.songIds) {
    const song = await db.get('songs', songId);
    if (song) songs.push(song);
  }

  return { setlist, songs };
};

export type { Song, Setlist };
