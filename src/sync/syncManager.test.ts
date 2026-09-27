import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	addSetlist,
	addSong,
	deleteSetlist,
	deleteSong,
	getAllSetlists,
	getAllSongs,
	getSong,
	initDB,
	type Song,
	saveSong,
	updateSetlist,
	updateSong,
} from "../db";
import { recordKey } from "./records";
import { SyncManager } from "./syncManager";
import { getSyncConflicts, resolveConflict } from "./syncStore";
import type { SyncMetadata, SyncProvider } from "./types";

class Cloud implements SyncProvider {
	name = "Test cloud";
	files: { metadata: SyncMetadata; content: string }[] = [];
	authenticate = vi.fn(async () => true);
	isEnabled = () => true;
	logout = async () => {};
	deleteFile = async () => {
		throw new Error("Sync must preserve history.");
	};
	listFiles = async () => {
		const ancestors = new Set(
			this.files.flatMap(({ metadata }) =>
				(metadata.parents ?? []).map(
					(parent) => `${recordKey(metadata.type, metadata.id)}:${parent}`,
				),
			),
		);
		return this.files
			.map((file) => file.metadata)
			.filter((meta) => !ancestors.has(`${recordKey(meta.type, meta.id)}:${meta.revision}`));
	};
	downloadFile = async (id: string) =>
		this.files.find((file) => file.metadata.gdriveId === id)?.content ?? "invalid";
	uploadFile = async (metadata: SyncMetadata, content: string) => {
		this.files.push({ metadata: { ...metadata, gdriveId: crypto.randomUUID() }, content });
	};
}
const stores = ["songs", "setlists", "tombstones", "syncBases", "syncConflicts"] as const;
async function clear() {
	const db = await initDB();
	const tx = db.transaction(stores, "readwrite");
	for (const store of stores) await tx.objectStore(store).clear();
	await tx.done;
}
async function snapshot() {
	const db = await initDB();
	return Promise.all(stores.map((store) => db.getAll(store)));
}
async function switchDevice(data: Awaited<ReturnType<typeof snapshot>>) {
	await clear();
	const db = await initDB();
	const tx = db.transaction(stores, "readwrite");
	for (let i = 0; i < stores.length; i++)
		for (const value of data[i]) await tx.objectStore(stores[i]).put(value);
	await tx.done;
}
beforeEach(async () => {
	localStorage.clear();
	await clear();
});
async function seed() {
	return addSong({ title: "Test", artist: "Artist", content: "[C]Original", tags: [] });
}

describe("durable sync with real IndexedDB", () => {
	it("pushes local records, acknowledges revisions, pulls onto another device, and propagates edits despite older clocks", async () => {
		const cloud = new Cloud();
		const manager = new SyncManager(cloud);
		const id = await seed();
		await addSetlist({
			name: "Gig",
			tags: ["live"],
			date: "2026-12-24",
			songIds: [id, id],
			songSettings: [{ transpose: 2, capo: 3 }, { transpose: -1 }],
		});
		await manager.sync();
		expect(manager.getStatus().error).toBeNull();
		expect(cloud.files).toHaveLength(2);
		const deviceA = await snapshot();
		await clear();
		await new SyncManager(cloud).sync();
		expect(await getAllSongs()).toHaveLength(1);
		expect((await getAllSetlists())[0]).toMatchObject({
			songIds: [id, id],
			date: "2026-12-24",
			songSettings: [{ transpose: 2, capo: 3 }, { transpose: -1 }],
		});
		const song = await getSong(id);
		if (!song) throw new Error("Missing song");
		await saveSong({ ...song, content: "[G]Remote edit", lastModified: "2000-01-01T00:00:00Z" });
		await new SyncManager(cloud).sync();
		expect(cloud.files).toHaveLength(3);
		await switchDevice(deviceA);
		await manager.sync();
		expect((await getSong(id))?.content).toBe("[G]Remote edit");
		expect(manager.getStatus().conflictCount).toBe(0);
		expect(manager.getStatus().lastSyncTime).not.toBeNull();
	});
	it("propagates song and setlist deletions, cleans repeated references, and does not resurrect on a fresh device", async () => {
		const cloud = new Cloud();
		const id = await seed();
		const list = await addSetlist({ name: "Gig", songIds: [id, id] });
		await new SyncManager(cloud).sync();
		const deviceB = await snapshot();
		await deleteSong(id);
		await new SyncManager(cloud).sync();
		await switchDevice(deviceB);
		await new SyncManager(cloud).sync();
		expect(await getAllSongs()).toHaveLength(0);
		expect((await getAllSetlists())[0].songIds).toEqual([]);
		await deleteSetlist(list);
		await new SyncManager(cloud).sync();
		await clear();
		await new SyncManager(cloud).sync();
		expect(await getAllSongs()).toHaveLength(0);
		expect(await getAllSetlists()).toHaveLength(0);
		expect(await (await initDB()).getAll("tombstones")).toHaveLength(2);
	});
	it("preserves two-device conflicting edits and resolves by keeping both versions", async () => {
		const cloud = new Cloud();
		const id = await seed();
		await new SyncManager(cloud).sync();
		const deviceA = await snapshot();
		await updateSong(id, { content: "[G]Remote words" });
		await new SyncManager(cloud).sync();
		await switchDevice(deviceA);
		await updateSong(id, { content: "[D]Local words" });
		const manager = new SyncManager(cloud);
		await manager.sync();
		const [conflict] = await getSyncConflicts();
		expect(conflict.local).toMatchObject({ content: "[D]Local words" });
		expect(conflict.remote[0].record).toMatchObject({ content: "[G]Remote words" });
		expect((await getSong(id))?.content).toBe("[D]Local words");
		expect(manager.getStatus().conflictCount).toBe(1);
		await resolveConflict(conflict.id, "both");
		await manager.sync();
		expect(await getSyncConflicts()).toHaveLength(0);
		await clear();
		await new SyncManager(cloud).sync();
		expect((await getAllSongs()).map((song) => song.content).sort()).toEqual([
			"[D]Local words",
			"[G]Remote words",
		]);
	});
	it("detects delete-versus-edit and allows explicitly keeping the edited version", async () => {
		const cloud = new Cloud();
		const id = await seed();
		await new SyncManager(cloud).sync();
		const deviceB = await snapshot();
		await deleteSong(id);
		await new SyncManager(cloud).sync();
		await switchDevice(deviceB);
		await updateSong(id, { title: "Edited" });
		await new SyncManager(cloud).sync();
		const [conflict] = await getSyncConflicts();
		expect(conflict.remote[0].record).toMatchObject({ deleted: true });
		await resolveConflict(conflict.id, "local");
		await new SyncManager(cloud).sync();
		await clear();
		await new SyncManager(cloud).sync();
		expect((await getSong(id))?.title).toBe("Edited");
	});
	it("refuses stale conflict resolution after another local edit", async () => {
		const cloud = new Cloud();
		const id = await seed();
		await new SyncManager(cloud).sync();
		const prior = await snapshot();
		await updateSong(id, { title: "Remote" });
		await new SyncManager(cloud).sync();
		await switchDevice(prior);
		await updateSong(id, { title: "Local" });
		await new SyncManager(cloud).sync();
		const [conflict] = await getSyncConflicts();
		await updateSong(id, { title: "New edit" });
		await expect(resolveConflict(conflict.id, 0)).rejects.toThrow("changed");
		expect((await getSong(id))?.title).toBe("New edit");
	});
	it("keeps simultaneous remote branches rather than hiding one with timestamp ordering", async () => {
		const cloud = new Cloud();
		const id = await seed();
		await new SyncManager(cloud).sync();
		const ancestor = cloud.files[0].metadata.revision;
		const song = await getSong(id);
		if (!song || !ancestor) throw new Error("Missing fixture");
		for (const title of ["Branch A", "Branch B"]) {
			const revision = crypto.randomUUID();
			await cloud.uploadFile(
				{ id, title, type: "song", lastModified: song.lastModified, revision, parents: [ancestor] },
				JSON.stringify({ ...song, title, _sync: { revision, parents: [ancestor] } }),
			);
		}
		await new SyncManager(cloud).sync();
		expect((await getSyncConflicts())[0].remote).toHaveLength(2);
		expect(await cloud.listFiles()).toHaveLength(2);
	});
	it("does not overwrite edits made while an upload is in progress", async () => {
		const cloud = new Cloud();
		const id = await seed();
		const upload = cloud.uploadFile.bind(cloud);
		cloud.uploadFile = async (metadata, content) => {
			await upload(metadata, content);
			await updateSong(id, { title: "During upload" });
		};
		const manager = new SyncManager(cloud);
		await manager.sync();
		expect(manager.getStatus().error).toContain("changed during sync");
		expect((await getSong(id))?.title).toBe("During upload");
		expect(cloud.files).toHaveLength(1);
	});
	it("retries interrupted sync without losing local data or advancing successful-sync time", async () => {
		const cloud = new Cloud();
		const id = await seed();
		const upload = cloud.uploadFile.bind(cloud);
		cloud.uploadFile = async (metadata, content) => {
			await upload(metadata, content);
			throw new Error("Connection lost");
		};
		const manager = new SyncManager(cloud);
		await manager.sync();
		expect(manager.getStatus().error).toBe("Connection lost");
		expect(localStorage.getItem("last_sync_time")).toBeNull();
		cloud.uploadFile = upload;
		await manager.sync();
		expect(manager.getStatus().error).toBeNull();
		expect(cloud.files).toHaveLength(1);
		expect(await getSong(id)).toBeDefined();
	});
	it("rejects invalid remote identity and preserves the library", async () => {
		const cloud = new Cloud();
		const id = await seed();
		const song = await getSong(id);
		await cloud.uploadFile(
			{ id: "remote", title: "Invalid", type: "song", lastModified: song?.lastModified ?? "" },
			JSON.stringify(song),
		);
		const manager = new SyncManager(cloud);
		await manager.sync();
		expect(manager.getStatus().error).toBe("Invalid remote song data");
		expect(await getAllSongs()).toHaveLength(1);
	});
	it("does not overwrite mismatched first-sync records without a shared baseline", async () => {
		const cloud = new Cloud();
		const id = await seed();
		const local = (await getSong(id)) as Song;
		await cloud.uploadFile(
			{ id, title: "Remote", type: "song", lastModified: local.lastModified },
			JSON.stringify({ ...local, title: "Remote" }),
		);
		await new SyncManager(cloud).sync();
		expect(await getSyncConflicts()).toHaveLength(1);
		expect((await getSong(id))?.title).toBe("Test");
	});
	it("preserves setlist order and tags in conflict resolution", async () => {
		const cloud = new Cloud();
		const id = await addSetlist({ name: "Gig", tags: ["local"], songIds: [] });
		await new SyncManager(cloud).sync();
		const prior = await snapshot();
		await updateSetlist(id, { tags: ["remote"] });
		await new SyncManager(cloud).sync();
		await switchDevice(prior);
		await updateSetlist(id, { name: "Local name" });
		await new SyncManager(cloud).sync();
		const [conflict] = await getSyncConflicts();
		await resolveConflict(conflict.id, 0);
		await new SyncManager(cloud).sync();
		expect((await getAllSetlists())[0]).toMatchObject({
			name: "Gig",
			tags: ["remote"],
			songIds: [],
		});
	});
});

it("guards overlapping syncs and returns without touching data after failed authentication", async () => {
	const cloud = new Cloud();
	cloud.authenticate.mockResolvedValue(false);
	const manager = new SyncManager(cloud);
	await manager.sync();
	expect(cloud.files).toHaveLength(0);
	expect(manager.getStatus().lastSyncTime).toBeNull();
	let finish: (value: boolean) => void = () => {};
	cloud.authenticate.mockImplementation(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const pending = manager.sync();
	expect(manager.getStatus().isSyncing).toBe(true);
	await manager.sync();
	finish(true);
	await pending;
	expect(cloud.authenticate).toHaveBeenCalledTimes(2);
});

it("keeps provider baselines separate and preserves first-sync differences", async () => {
	const id = await seed();
	const first = new Cloud();
	const second = new Cloud();
	const providerA = Object.assign(first, { getScope: () => "gdrive:folder" });
	const providerB = Object.assign(second, { getScope: () => "onedrive:folder" });
	await new SyncManager(providerA).sync();
	second.files = structuredClone(first.files).map((file) => ({
		...file,
		metadata: { ...file.metadata, revision: "other" },
		content: JSON.stringify({
			...JSON.parse(file.content),
			_sync: { revision: "other", parents: [] },
		}),
	}));
	await updateSong(id, { content: "[G]Local change after Google sync" });
	await new SyncManager(providerB).sync();
	const conflicts = await getSyncConflicts();
	expect(conflicts).toHaveLength(1);
	expect(conflicts[0].scope).toBe("onedrive:folder");
	expect(conflicts[0].id).toBe(`onedrive:folder::song:${id}`);
	expect(second.files).toHaveLength(1);
	await resolveConflict(conflicts[0].id, "local");
	await new SyncManager(providerB).sync();
	expect(await getSyncConflicts()).toHaveLength(0);
	expect(second.files).toHaveLength(2);
});
it("does not overwrite remote content changed in place under an acknowledged revision", async () => {
	const id = await seed();
	const cloud = new Cloud();
	const manager = new SyncManager(cloud);
	await manager.sync();
	await updateSong(id, { content: "[G]Local edit" });
	const value = JSON.parse(cloud.files[0].content);
	cloud.files[0].content = JSON.stringify({
		...value,
		content: "[D]Remote edit with same revision",
	});
	await manager.sync();
	expect((await getSyncConflicts())[0].remote[0].record).toMatchObject({
		content: "[D]Remote edit with same revision",
	});
	expect(cloud.files).toHaveLength(1);
});
it("rejects a reviewed remote version changed before resolution is shared", async () => {
	const id = await seed();
	const cloud = new Cloud();
	const manager = new SyncManager(cloud);
	await manager.sync();
	await updateSong(id, { content: "[G]Local edit" });
	const value = JSON.parse(cloud.files[0].content);
	cloud.files[0].content = JSON.stringify({ ...value, content: "[D]Remote edit" });
	await manager.sync();
	await resolveConflict(`song:${id}`, "local");
	cloud.files[0].content = JSON.stringify({ ...value, content: "[E]Another remote edit" });
	await manager.sync();
	expect(await getSyncConflicts()).toHaveLength(1);
	expect(cloud.files).toHaveLength(1);
});
