import type { IDBPTransaction } from "idb";
import { initDB, type Setlist, type Song } from "../db";
import { recordFingerprint, stableStringify } from "../utils/recordFingerprint";
import {
	isDeletion,
	type LibraryRecord,
	type RecordType,
	recordKey,
	type SyncBase,
	type SyncConflict,
} from "./records";

type Database = Awaited<ReturnType<typeof initDB>>;
type Schema = Database extends import("idb").IDBPDatabase<infer T> ? T : never;
const stores = ["songs", "setlists", "tombstones", "syncBases", "syncConflicts"] as const;
type Transaction = IDBPTransaction<Schema, typeof stores, "readwrite">;

async function current(
	tx: Transaction,
	type: RecordType,
	id: string,
): Promise<LibraryRecord | undefined> {
	return (
		(await tx.objectStore("tombstones").get(id)) ??
		(await tx.objectStore(type === "song" ? "songs" : "setlists").get(id))
	);
}
async function write(tx: Transaction, type: RecordType, record: LibraryRecord) {
	const store = type === "song" ? "songs" : "setlists";
	if (isDeletion(record)) {
		await tx.objectStore(store).delete(record.id);
		await tx.objectStore("tombstones").put(record);
		if (type === "song") {
			for (const list of await tx.objectStore("setlists").getAll()) {
				if (list.songIds.includes(record.id))
					await tx.objectStore("setlists").put({
						...list,
						songIds: list.songIds.filter((id) => id !== record.id),
						lastModified: new Date().toISOString(),
					});
			}
		}
	} else {
		await tx.objectStore("tombstones").delete(record.id);
		if (type === "song") await tx.objectStore("songs").put(record as Song);
		else {
			const list = record as Setlist;
			const deletedSongs = new Set(
				(await tx.objectStore("tombstones").getAll())
					.filter((item) => item.type === "song")
					.map((item) => item.id),
			);
			await tx
				.objectStore("setlists")
				.put({ ...list, songIds: list.songIds.filter((id) => !deletedSongs.has(id)) });
		}
	}
}
async function transact(action: (tx: Transaction) => Promise<void>) {
	const db = await initDB();
	const tx = db.transaction(stores, "readwrite");
	void tx.done.catch(() => {});
	try {
		await action(tx);
		await tx.done;
	} catch (error) {
		try {
			tx.abort();
		} catch {
			/* Already aborted. */
		}
		throw error;
	}
}
export async function getLocalRecord(type: RecordType, id: string) {
	const db = await initDB();
	return (
		(await db.get("tombstones", id)) ?? (await db.get(type === "song" ? "songs" : "setlists", id))
	);
}
export async function getSyncBase(type: RecordType, id: string) {
	return (await initDB()).get("syncBases", recordKey(type, id));
}
export async function getSyncConflicts() {
	return (await initDB()).getAll("syncConflicts");
}
export async function saveConflict(conflict: SyncConflict) {
	await (await initDB()).put("syncConflicts", conflict);
}
export async function acknowledge(
	type: RecordType,
	record: LibraryRecord,
	expectedLocal: LibraryRecord | undefined,
	revisions: string[],
	apply: boolean,
) {
	await transact(async (tx) => {
		if (stableStringify(await current(tx, type, record.id)) !== stableStringify(expectedLocal))
			throw new Error("Library changed during sync. Please sync again.");
		if (apply) await write(tx, type, record);
		await tx
			.objectStore("syncBases")
			.put({ id: recordKey(type, record.id), fingerprint: recordFingerprint(record), revisions });
		await tx.objectStore("syncConflicts").delete(recordKey(type, record.id));
	});
}
/** Resolution is local and durable. Next sync joins the reviewed remote revisions. */
export async function resolveConflict(id: string, choice: "local" | "both" | number) {
	await transact(async (tx) => {
		const conflict = await tx.objectStore("syncConflicts").get(id);
		if (!conflict) throw new Error("This conflict has already been resolved.");
		const local = await current(tx, conflict.type, conflict.recordId);
		if (stableStringify(local) !== stableStringify(conflict.local))
			throw new Error(
				"This item changed since the conflict was detected. Sync again before resolving it.",
			);
		const chosen =
			typeof choice === "number"
				? conflict.remote[choice]?.record
				: (local ?? conflict.remote[0]?.record);
		if (!chosen) throw new Error("No version selected.");
		if (choice === "both") {
			for (const version of conflict.remote) {
				if (
					isDeletion(version.record) ||
					recordFingerprint(version.record) === recordFingerprint(chosen)
				)
					continue;
				const copy = {
					...version.record,
					id: crypto.randomUUID(),
					createdAt: new Date().toISOString(),
					lastModified: new Date().toISOString(),
				};
				if ("name" in copy) copy.name += " (remote copy)";
				else copy.title += " (remote copy)";
				await write(tx, conflict.type, copy);
			}
		}
		const resolved = { ...chosen, lastModified: new Date().toISOString() };
		await write(tx, conflict.type, resolved);
		const base: SyncBase = {
			id,
			fingerprint: recordFingerprint(resolved),
			revisions: conflict.remote.map((version) => version.revision),
			resolved: true,
		};
		await tx.objectStore("syncBases").put(base);
		await tx.objectStore("syncConflicts").delete(id);
	});
}
