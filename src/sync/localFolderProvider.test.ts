import { beforeEach, expect, it, vi } from "vitest";
import * as database from "../db";
import { LocalFolderProvider } from "./localFolderProvider";
import { applyRevisionCleanup, previewRevisionCleanup } from "./revisionCleanup";
import { SyncManager } from "./syncManager";
import { getSyncConflicts, resolveConflict } from "./syncStore";
import type { SyncMetadata } from "./types";

class MemoryFile {
	kind = "file";
	text = "";
	modified = Date.now();
	failWrite = false;
	name: string;
	constructor(name: string) {
		this.name = name;
	}
	async getFile() {
		const text = this.text;
		return { text: async () => text, lastModified: this.modified } as File;
	}
	async createWritable() {
		let pending = "";
		return {
			write: async (text: string) => {
				if (this.failWrite) throw new Error("disk full");
				pending = text;
			},
			close: async () => {
				this.text = pending;
				this.modified = Date.now();
			},
			abort: async () => {},
		};
	}
}
class MemoryDirectory {
	kind = "directory";
	entries = new Map<string, MemoryDirectory | MemoryFile>();
	permission: PermissionState = "granted";
	requestPermission = vi.fn(async () => this.permission);
	queryPermission = vi.fn(async () => this.permission);
	name: string;
	constructor(name: string) {
		this.name = name;
	}
	async isSameEntry(other: unknown) {
		return other === this;
	}
	async *values() {
		yield* this.entries.values();
	}
	async getFileHandle(name: string, options?: { create?: boolean }) {
		let file = this.entries.get(name);
		if (!file && options?.create) {
			file = new MemoryFile(name);
			this.entries.set(name, file);
		}
		if (!(file instanceof MemoryFile)) throw new DOMException("missing", "NotFoundError");
		return file;
	}
	async getDirectoryHandle(name: string, options?: { create?: boolean }) {
		let dir = this.entries.get(name);
		if (!dir && options?.create) {
			dir = new MemoryDirectory(name);
			this.entries.set(name, dir);
		}
		if (!(dir instanceof MemoryDirectory)) throw new DOMException("missing", "NotFoundError");
		return dir;
	}
}
let folder: MemoryDirectory;
let stored: { id: string; handle: FileSystemDirectoryHandle } | undefined;
const stores = ["songs", "setlists", "tombstones", "syncBases", "syncConflicts"] as const;
beforeEach(async () => {
	vi.restoreAllMocks();
	localStorage.clear();
	stored = undefined;
	folder = new MemoryDirectory("Shared songbook");
	window.showDirectoryPicker = vi.fn(async () => folder as unknown as FileSystemDirectoryHandle);
	const db = await database.initDB();
	for (const store of stores) await db.clear(store);
	// Fake IndexedDB cannot clone real filesystem handles. Intercept only that store;
	// song/conflict/acknowledgement transactions still use real IndexedDB.
	vi.spyOn(database, "initDB").mockResolvedValue(
		new Proxy(db, {
			get(target, key) {
				if (key === "get")
					return (store: string, id: string) =>
						store === "syncHandles" ? Promise.resolve(stored) : target.get(store as "songs", id);
				if (key === "put")
					return (store: string, value: typeof stored) => {
						if (store !== "syncHandles") return Reflect.apply(target.put, target, [store, value]);
						stored = value;
						return Promise.resolve("local-folder");
					};
				if (key === "delete")
					return (store: string, id: string) => {
						if (store !== "syncHandles") return target.delete(store as "songs", id);
						stored = undefined;
						return Promise.resolve();
					};
				const value = Reflect.get(target, key);
				return typeof value === "function" ? value.bind(target) : value;
			},
		}),
	);
});
async function connect() {
	const provider = new LocalFolderProvider();
	await provider.ready;
	await provider.authenticate();
	return provider;
}
function revision(index = 0, parents: string[] = []) {
	const revision = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
	const metadata: SyncMetadata = {
		id: "id/with:Unicode Å and UPPERCASE",
		type: "song",
		title: "Synthetic song",
		lastModified: "2025-01-01T00:00:00Z",
		revision,
		parents,
	};
	const content = JSON.stringify({
		id: metadata.id,
		title: metadata.title,
		artist: "Test",
		content: "[C]Synthetic line",
		tags: [],
		createdAt: metadata.lastModified,
		lastModified: metadata.lastModified,
		_sync: { revision, parents },
	});
	return { metadata, content };
}
it("round-trips records with filesystem-safe names, preserves immutable revisions and filters unrelated files", async () => {
	const provider = await connect();
	const { metadata, content } = revision();
	await provider.uploadFile(metadata, content);
	await provider.uploadFile(metadata, content);
	const unknown = await folder.getFileHandle("other.json", { create: true });
	unknown.text = "not JSON";
	const files = await provider.listFiles();
	expect(files).toHaveLength(1);
	expect(files[0]).toMatchObject({ id: metadata.id, revision: metadata.revision, type: "song" });
	expect(files[0].remoteId).toMatch(/^gigdex-song-[0-9a-f-]+\.json$/);
	expect(await provider.downloadFile(files[0].remoteId ?? "")).toBe(content);
	await expect(provider.uploadFile(metadata, `${content} `)).rejects.toThrow("different revision");
	await expect(provider.downloadFile("../other.json")).rejects.toThrow("filename");
});
it("keeps scope across restoration and reselecting the same handle; different folders isolate acknowledgements", async () => {
	const first = await connect();
	const scope = first.getScope();
	const restored = new LocalFolderProvider();
	await restored.ready;
	expect(restored.getScope()).toBe(scope);
	await restored.pickFolder();
	expect(restored.getScope()).toBe(scope);
	folder = new MemoryDirectory("Shared songbook"); // Same name, different directory.
	await restored.pickFolder();
	expect(restored.getScope()).not.toBe(scope);
	await restored.logout();
	expect(stored).toBeUndefined();
	expect(restored.getFolderName()).toBe("");
	expect(restored.isAuthenticated()).toBe(false);
});
it("requests permission on the user gesture and retains the library and handle after denial", async () => {
	const provider = await connect();
	folder.permission = "denied";
	const pending = provider.authenticate();
	expect(folder.requestPermission).toHaveBeenCalledTimes(2);
	await expect(pending).rejects.toThrow("permission denied");
	expect(stored).toBeDefined();
	expect(provider.isAuthenticated()).toBe(false);
	folder.permission = "granted";
	await provider.authenticate();
	expect(provider.isAuthenticated()).toBe(true);
});
it("cancellation leaves the original folder unchanged and unsupported browsers fail gracefully", async () => {
	const provider = await connect();
	const scope = provider.getScope();
	window.showDirectoryPicker = vi
		.fn()
		.mockRejectedValue(new DOMException("cancelled", "AbortError"));
	expect(await provider.pickFolder()).toBe(false);
	expect(provider.getScope()).toBe(scope);
	window.showDirectoryPicker = undefined;
	expect(provider.isEnabled()).toBe(false);
	await expect(provider.authenticate()).rejects.toThrow("Chrome or Edge");
});
it("stops on recognized incomplete JSON and invalid timestamps rather than dropping revisions", async () => {
	const provider = await connect();
	const { metadata, content } = revision();
	await provider.uploadFile(metadata, content);
	const file = [...folder.entries.values()][0] as MemoryFile;
	file.text = "{";
	await expect(provider.listRevisions()).rejects.toThrow("incomplete");
	file.text = content.replaceAll("2025-01-01T00:00:00Z", "invalid");
	await expect(provider.listRevisions()).rejects.toThrow("Invalid local-folder revision");
});
it("archives to recoverable trash without deleting sources, and reveals concurrent source changes", async () => {
	const provider = await connect();
	const { metadata, content } = revision();
	await provider.uploadFile(metadata, content);
	const [file] = await provider.listRevisions();
	await provider.archiveRevision(file);
	expect(await provider.listRevisions()).toEqual([]);
	expect(await provider.downloadFile(file.remoteId ?? "")).toBe(content);
	const trash = await folder.getDirectoryHandle(".gigdex-trash");
	expect([...trash.entries.values()].map((entry) => (entry as MemoryFile).text)).toContain(content);
	const source = await folder.getFileHandle(file.remoteId ?? "");
	source.text = content.replace("Synthetic song", "Concurrent edit");
	expect(await provider.listRevisions()).toHaveLength(1);
	await expect(provider.archiveRevision(file)).rejects.toThrow("changed");
	await provider.archiveRevision((await provider.listRevisions())[0]);
	expect(trash.entries.size).toBe(2);
	expect([...trash.entries.values()].map((entry) => (entry as MemoryFile).text)).toContain(content);
	await expect(provider.deleteFile(file.remoteId ?? "")).rejects.toThrow(
		"never permanently deleted",
	);
});
it("runs unchanged cleanup on local revisions, retaining heads and refusing stale previews", async () => {
	const provider = await connect();
	let parents: string[] = [];
	for (let index = 0; index < 9; index++) {
		const { metadata, content } = revision(index, parents);
		await provider.uploadFile(metadata, content);
		parents = [metadata.revision ?? ""];
	}
	for (const file of folder.entries.values())
		if (file instanceof MemoryFile) file.modified = Date.parse("2025-01-01T00:00:00Z");
	const plan = await previewRevisionCleanup(provider);
	expect(plan.candidates).toHaveLength(3);
	const source = await folder.getFileHandle(plan.candidates[0].remoteId ?? "");
	const original = source.text;
	source.text = original.replace("Synthetic song", "Changed");
	await expect(applyRevisionCleanup(provider, plan)).rejects.toThrow("changed");
	source.text = original;
	const fresh = await previewRevisionCleanup(provider);
	expect(await applyRevisionCleanup(provider, fresh)).toBe(3);
	expect(await provider.listRevisions()).toHaveLength(6);
	expect(await provider.listFiles()).toHaveLength(1);
	expect((await folder.getDirectoryHandle(".gigdex-trash")).entries.size).toBe(3);
	expect([...folder.entries.values()].filter((entry) => entry.kind === "file")).toHaveLength(9);
});
it("preserves two-device branches, joins a reviewed conflict and detects deletion versus editing", async () => {
	const providerA = await connect();
	const providerB = new LocalFolderProvider();
	await providerB.ready;
	const db = await database.initDB();
	const clear = async () => {
		for (const store of stores) await db.clear(store);
	};
	const snapshot = () => Promise.all(stores.map((store) => db.getAll(store)));
	const restore = async (data: Awaited<ReturnType<typeof snapshot>>) => {
		await clear();
		const tx = db.transaction(stores, "readwrite");
		for (let index = 0; index < stores.length; index++)
			for (const item of data[index]) await tx.objectStore(stores[index]).put(item);
		await tx.done;
	};
	const id = await database.addSong({
		title: "Test",
		artist: "Test",
		content: "[C]Original",
		tags: [],
	});
	const managerA = new SyncManager(providerA);
	const managerB = new SyncManager(providerB);
	await managerA.sync();
	const root = (await providerA.listFiles())[0].revision ?? "";
	const initial = await snapshot();
	await database.updateSong(id, { content: "[C]Device A" });
	await managerA.sync();
	const deviceA = await snapshot();
	await restore(initial);
	await database.updateSong(id, { content: "[G]Device B" });
	const branch = await database.getSong(id);
	if (!branch) throw new Error("Missing test song");
	const revision = crypto.randomUUID();
	await providerB.uploadFile(
		{
			id,
			title: branch.title,
			type: "song",
			lastModified: branch.lastModified,
			revision,
			parents: [root],
		},
		JSON.stringify({ ...branch, _sync: { revision, parents: [root] } }),
	);
	expect(await providerA.listFiles()).toHaveLength(2);
	await managerB.sync();
	expect(await getSyncConflicts()).toHaveLength(1);
	await resolveConflict((await getSyncConflicts())[0].id, "local");
	await managerB.sync();
	expect(await providerB.listFiles()).toHaveLength(1);
	await restore(deviceA);
	await managerA.sync();
	expect((await database.getSong(id))?.content).toBe("[G]Device B");
	const joined = await snapshot();
	await database.deleteSong(id);
	await managerA.sync();
	await restore(joined);
	await database.updateSong(id, { content: "[D]Edited during deletion" });
	await managerB.sync();
	expect((await getSyncConflicts())[0]).toMatchObject({ type: "song", recordId: id });
	expect(managerA.getStatus().error).toBeNull();
	expect(managerB.getStatus().error).toBeNull();
});

it("detects same-timestamp content changes after listing and gives a recoverable stale-handle error", async () => {
	const provider = await connect();
	const { metadata, content } = revision();
	await provider.uploadFile(metadata, content);
	const [listed] = await provider.listFiles();
	const file = await folder.getFileHandle(listed.remoteId ?? "");
	file.text = content.replace("Synthetic song", "Changed content");
	await expect(provider.downloadFile(listed.remoteId ?? "")).rejects.toThrow("changed during sync");
	folder.requestPermission.mockRejectedValueOnce(new DOMException("Moved", "NotFoundError"));
	await expect(provider.authenticate()).rejects.toThrow("Choose the folder again");
	expect(provider.isAuthenticated()).toBe(false);
	expect(stored).toBeDefined();
});

it("warns about mixed folders while ignoring unrelated JSON and retains source data if an incomplete trash copy already exists", async () => {
	for (let index = 0; index < 11; index++)
		await folder.getFileHandle(`unrelated-${index}.json`, { create: true });
	const provider = await connect();
	expect(provider.getFolderWarning()).toContain("11 unrelated JSON");
	const { metadata, content } = revision();
	await provider.uploadFile(metadata, content);
	const [listed] = await provider.listFiles();
	const trash = await folder.getDirectoryHandle(".gigdex-trash", { create: true });
	const target = await trash.getFileHandle(
		`${(listed.remoteId ?? "").slice(0, -5)}-${listed.version}.json`,
		{ create: true },
	);
	target.failWrite = true;
	await expect(provider.archiveRevision(listed)).rejects.toThrow("Archive copy differs");
	expect(await provider.downloadFile(listed.remoteId ?? "")).toBe(content);
	expect(await provider.listFiles()).toHaveLength(1);
});
