import { initDB, type Setlist, type Song } from "../db";
import { extractMetadata, parseChordPro } from "./chordEngine";
import { parseSyncedSetlist, parseSyncedSong } from "./libraryValidation";

export interface LibraryBackup {
	format: "gig-dex";
	version: 1;
	exportedAt: string;
	songs: Song[];
	setlists: Setlist[];
}

export function parseBackup(content: string): LibraryBackup {
	const value = JSON.parse(content);
	if (
		!value ||
		value.format !== "gig-dex" ||
		value.version !== 1 ||
		!Array.isArray(value.songs) ||
		!Array.isArray(value.setlists)
	)
		throw new Error("Not a supported Gig-Dex backup.");
	const ids = new Set<string>();
	const validate = <T extends Song | Setlist>(
		record: T,
		parser: (text: string, id: string) => T,
	): T => {
		if (!record || typeof record.id !== "string" || !record.id.trim() || ids.has(record.id))
			throw new Error("Backup contains missing or duplicate record IDs.");
		ids.add(record.id);
		return parser(JSON.stringify(record), record.id);
	};
	const songs: Song[] = value.songs.map((record: Song) => validate(record, parseSyncedSong));
	const setlists: Setlist[] = value.setlists.map((record: Setlist) =>
		validate(record, parseSyncedSetlist),
	);
	const songIds = new Set(songs.map((song) => song.id));
	if (setlists.some((list) => list.songIds.some((id) => !songIds.has(id))))
		throw new Error("Backup contains setlist references to missing songs.");
	return { format: "gig-dex", version: 1, exportedAt: value.exportedAt, songs, setlists };
}

export async function exportLibrary(): Promise<LibraryBackup> {
	const db = await initDB();
	const tx = db.transaction(["songs", "setlists"], "readonly");
	const [songs, setlists] = await Promise.all([
		tx.objectStore("songs").getAll(),
		tx.objectStore("setlists").getAll(),
	]);
	await tx.done;
	return { format: "gig-dex", version: 1, exportedAt: new Date().toISOString(), songs, setlists };
}

function fingerprint(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(fingerprint).join(",")}]`;
	if (value && typeof value === "object")
		return `{${Object.entries(value)
			.filter(([, item]) => item !== undefined)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, item]) => `${JSON.stringify(key)}:${fingerprint(item)}`)
			.join(",")}}`;
	return JSON.stringify(value);
}

/** Validate before writing, then restore both stores in a single transaction. */
export async function restoreLibrary(
	backup: LibraryBackup,
	mode: "merge" | "replace",
): Promise<void> {
	const valid = parseBackup(JSON.stringify(backup));
	const db = await initDB();
	const tx = db.transaction(["songs", "setlists"], "readwrite");
	void tx.done.catch(() => {});
	try {
		const songStore = tx.objectStore("songs");
		const listStore = tx.objectStore("setlists");
		const [existingSongs, existingLists] = await Promise.all([
			songStore.getAll(),
			listStore.getAll(),
		]);
		if (mode === "replace") {
			await songStore.clear();
			await listStore.clear();
		}
		const songMap = new Map(existingSongs.map((song) => [song.id, song]));
		const listMap = new Map(existingLists.map((list) => [list.id, list]));
		const remap = new Map<string, string>();
		const now = new Date().toISOString();
		for (const song of valid.songs) {
			const existing = mode === "merge" ? songMap.get(song.id) : undefined;
			const changed = !!existing && fingerprint(song) !== fingerprint(existing);
			const id = changed ? crypto.randomUUID() : song.id;
			remap.set(song.id, id);
			if (!existing || changed)
				await songStore.put({
					...song,
					id,
					lastModified: mode === "replace" || changed ? now : song.lastModified,
				});
		}
		for (const list of valid.setlists) {
			const updated = { ...list, songIds: list.songIds.map((id) => remap.get(id) ?? id) };
			const existing = mode === "merge" ? listMap.get(list.id) : undefined;
			const changed = !!existing && fingerprint(updated) !== fingerprint(existing);
			if (!existing || changed)
				await listStore.put({
					...updated,
					id: changed ? crypto.randomUUID() : list.id,
					lastModified: mode === "replace" || changed ? now : list.lastModified,
				});
		}
		await tx.done;
	} catch (error) {
		try {
			tx.abort();
		} catch {
			/* Already aborted by IndexedDB. */
		}
		throw error;
	}
}

export interface ImportResult {
	file: string;
	status: "imported" | "duplicate" | "error";
	message: string;
}
export async function importChordPro(
	files: { name: string; content: string }[],
): Promise<ImportResult[]> {
	// Parse outside the transaction; keep original source for full directive preservation.
	const drafts: {
		song: Omit<Song, "id" | "createdAt" | "lastModified">;
		warning: string;
		file: string;
	}[] = [];
	const results: ImportResult[] = [];
	for (const file of files) {
		try {
			const content = file.content.replace(/^\uFEFF/, "");
			if (!content.trim()) throw new Error("Empty file.");
			let warning = "";
			try {
				parseChordPro(content);
			} catch {
				warning = "Invalid ChordPro: imported as raw text for repair.";
			}
			const metadata = extractMetadata(content);
			const tags = [
				...new Set(
					[...content.matchAll(/^\s*\{tags?:\s*([^}]+)\}\s*$/gim)]
						.flatMap((match) => match[1].split(",").map((tag) => tag.trim()))
						.filter(Boolean),
				),
			];
			drafts.push({
				file: file.name,
				warning,
				song: {
					...metadata,
					title: metadata.title || file.name.replace(/\.[^.]+$/, ""),
					artist: metadata.artist || "",
					tags,
					content,
				},
			});
		} catch (error) {
			results.push({
				file: file.name,
				status: "error",
				message: error instanceof Error ? error.message : "Could not read song.",
			});
		}
	}
	const db = await initDB();
	const tx = db.transaction("songs", "readwrite");
	void tx.done.catch(() => {});
	try {
		const normalize = (text: string) => text.replace(/\r\n/g, "\n").trim();
		const seen = new Set((await tx.store.getAll()).map((song) => normalize(song.content)));
		const now = new Date().toISOString();
		for (const draft of drafts) {
			const content = normalize(draft.song.content);
			if (seen.has(content)) {
				results.push({
					file: draft.file,
					status: "duplicate",
					message: "Identical song already in the library.",
				});
				continue;
			}
			await tx.store.add({
				...draft.song,
				id: crypto.randomUUID(),
				createdAt: now,
				lastModified: now,
			});
			seen.add(content);
			results.push({ file: draft.file, status: "imported", message: draft.warning || "Imported." });
		}
		await tx.done;
	} catch (error) {
		try {
			tx.abort();
		} catch {
			/* Already aborted by IndexedDB. */
		}
		throw error;
	}
	return results;
}
