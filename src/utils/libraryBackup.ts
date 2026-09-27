import { initDB, type Setlist, type Song } from "../db";
import {
	type DeletionRecord,
	isDeletion,
	type LibraryRecord,
	type SyncConflict,
	syncKey,
} from "../sync/records";
import { parseDeletion, parseSyncedSetlist, parseSyncedSong } from "./libraryValidation";
import { stableStringify } from "./recordFingerprint";

export interface LibraryBackup {
	format: "gig-dex";
	version: 1;
	exportedAt: string;
	songs: Song[];
	setlists: Setlist[];
	tombstones?: DeletionRecord[];
	conflicts?: SyncConflict[];
}

export function parseBackup(content: string): LibraryBackup {
	const value = JSON.parse(content);
	if (
		!value ||
		value.format !== "gig-dex" ||
		value.version !== 1 ||
		typeof value.exportedAt !== "string" ||
		!Number.isFinite(Date.parse(value.exportedAt)) ||
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
	if (
		(value.tombstones !== undefined && !Array.isArray(value.tombstones)) ||
		(value.conflicts !== undefined && !Array.isArray(value.conflicts))
	)
		throw new Error("Invalid backup sync records.");
	const tombstones: DeletionRecord[] = (value.tombstones ?? []).map((item: DeletionRecord) => {
		const record = parseDeletion(item, item?.id, item?.type);
		if (ids.has(record.id) || !["song", "setlist"].includes(record.type))
			throw new Error("Duplicate backup deletion ID.");
		ids.add(record.id);
		return record;
	});
	const parseRecord = (record: LibraryRecord, id: string, type: "song" | "setlist") =>
		isDeletion(record)
			? parseDeletion(record, id, type)
			: type === "song"
				? parseSyncedSong(JSON.stringify(record), id)
				: parseSyncedSetlist(JSON.stringify(record), id);
	const conflicts: SyncConflict[] = (value.conflicts ?? []).map((conflict: SyncConflict) => {
		if (
			!conflict ||
			!["song", "setlist"].includes(conflict.type) ||
			typeof conflict.recordId !== "string" ||
			(conflict.provider !== undefined && typeof conflict.provider !== "string") ||
			(conflict.scope !== undefined &&
				(typeof conflict.scope !== "string" || conflict.scope.length > 500)) ||
			conflict.id !== syncKey(conflict.type, conflict.recordId, conflict.scope) ||
			!Array.isArray(conflict.remote) ||
			!conflict.remote.length
		)
			throw new Error("Invalid backup conflict.");
		return {
			...conflict,
			local: conflict.local
				? parseRecord(conflict.local, conflict.recordId, conflict.type)
				: undefined,
			remote: conflict.remote.map((version) => {
				if (typeof version.revision !== "string") throw new Error("Invalid conflict revision.");
				return {
					revision: version.revision,
					record: parseRecord(version.record, conflict.recordId, conflict.type),
				};
			}),
		};
	});
	return {
		format: "gig-dex",
		version: 1,
		exportedAt: value.exportedAt,
		songs,
		setlists,
		tombstones,
		conflicts,
	};
}

export async function exportLibrary(): Promise<LibraryBackup> {
	const db = await initDB();
	const tx = db.transaction(["songs", "setlists", "tombstones", "syncConflicts"], "readonly");
	const [songs, setlists, tombstones, conflicts] = await Promise.all([
		tx.objectStore("songs").getAll(),
		tx.objectStore("setlists").getAll(),
		tx.objectStore("tombstones").getAll(),
		tx.objectStore("syncConflicts").getAll(),
	]);
	await tx.done;
	return {
		format: "gig-dex",
		version: 1,
		exportedAt: new Date().toISOString(),
		songs,
		setlists,
		tombstones,
		conflicts,
	};
}

/** Validate before writing, then restore both stores in a single transaction. */
export async function restoreLibrary(
	backup: LibraryBackup,
	mode: "merge" | "replace",
): Promise<void> {
	const valid = parseBackup(JSON.stringify(backup));
	const db = await initDB();
	const tx = db.transaction(
		["songs", "setlists", "tombstones", "syncConflicts", "syncBases"],
		"readwrite",
	);
	void tx.done.catch(() => {});
	try {
		const songStore = tx.objectStore("songs");
		const listStore = tx.objectStore("setlists");
		const [existingSongs, existingLists] = await Promise.all([
			songStore.getAll(),
			listStore.getAll(),
		]);
		const deleted = new Set((await tx.objectStore("tombstones").getAll()).map((item) => item.id));
		const now = new Date().toISOString();
		if (mode === "replace") {
			const retained = new Set([...valid.songs, ...valid.setlists].map((record) => record.id));
			for (const record of [...existingSongs, ...existingLists]) {
				if (!retained.has(record.id))
					await tx.objectStore("tombstones").put({
						id: record.id,
						type: "name" in record ? "setlist" : "song",
						deleted: true,
						title: "name" in record ? record.name : record.title,
						createdAt: record.createdAt,
						lastModified: now,
					});
			}
			await tx.objectStore("syncConflicts").clear();
			await songStore.clear();
			await listStore.clear();
		}
		const songMap = new Map(existingSongs.map((song) => [song.id, song]));
		const listMap = new Map(existingLists.map((list) => [list.id, list]));
		const remap = new Map<string, string>();
		for (const song of valid.songs) {
			const existing = mode === "merge" ? songMap.get(song.id) : undefined;
			const changed =
				mode === "merge" &&
				(deleted.has(song.id) ||
					(!!existing && stableStringify(song) !== stableStringify(existing)));
			const id = changed ? crypto.randomUUID() : song.id;
			remap.set(song.id, id);
			await tx.objectStore("tombstones").delete(id);
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
			const changed =
				mode === "merge" &&
				(deleted.has(list.id) ||
					(!!existing && stableStringify(updated) !== stableStringify(existing)));
			const id = changed ? crypto.randomUUID() : list.id;
			remap.set(list.id, id);
			await tx.objectStore("tombstones").delete(id);
			if (!existing || changed)
				await listStore.put({
					...updated,
					id,
					lastModified: mode === "replace" || changed ? now : list.lastModified,
				});
		}
		for (const deletion of valid.tombstones ?? []) {
			const active = await tx
				.objectStore(deletion.type === "song" ? "songs" : "setlists")
				.get(deletion.id);
			if (!active) await tx.objectStore("tombstones").put(deletion);
		}
		for (const conflict of valid.conflicts ?? []) {
			const id = remap.get(conflict.recordId) ?? conflict.recordId;
			const key = syncKey(conflict.type, id, conflict.scope);
			const local =
				(await tx.objectStore("tombstones").get(id)) ??
				(await tx.objectStore(conflict.type === "song" ? "songs" : "setlists").get(id));
			const existing = await tx.objectStore("syncConflicts").get(key);
			const versions = [
				...(existing?.remote ?? []),
				...conflict.remote.map((version) => ({ ...version, record: { ...version.record, id } })),
			];
			await tx.objectStore("syncConflicts").put({
				...conflict,
				id: key,
				recordId: id,
				local,
				remote: [...new Map(versions.map((version) => [version.revision, version])).values()],
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
	const { extractMetadata, parseChordPro } = await import("./chordEngine");
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
