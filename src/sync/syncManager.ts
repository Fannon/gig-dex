import { getAllSetlists, getAllSongs, initDB } from "../db";
import { parseSyncedSetlist, parseSyncedSong } from "../utils/libraryValidation";
import { recordFingerprint } from "../utils/recordFingerprint";
import {
	type LibraryRecord,
	type RecordType,
	type RemoteVersion,
	recordKey,
	recordTitle,
	syncKey,
} from "./records";
import {
	acknowledge,
	getLocalRecord,
	getSyncBase,
	getSyncConflicts,
	saveConflict,
} from "./syncStore";
import type { SyncMetadata, SyncProvider, SyncStatus } from "./types";

export class SyncManager {
	private static busy = false;
	private scope = "";
	static async exclusive<T>(operation: () => Promise<T>): Promise<T> {
		if (SyncManager.busy) throw new Error("Another sync or cleanup is running. Please wait.");
		SyncManager.busy = true;
		try {
			return await operation();
		} finally {
			SyncManager.busy = false;
		}
	}
	private status: SyncStatus = {
		lastSyncTime: null,
		isSyncing: false,
		error: null,
		conflictCount: 0,
	};
	private provider: SyncProvider;
	constructor(provider: SyncProvider) {
		this.provider = provider;
		this.status.lastSyncTime = localStorage.getItem(`last_sync:${provider.name}`);
	}
	getStatus(): SyncStatus {
		return { ...this.status };
	}
	resetStatus(): void {
		this.status = { lastSyncTime: null, isSyncing: false, error: null, conflictCount: 0 };
	}
	async sync(): Promise<void> {
		if (this.status.isSyncing || SyncManager.busy) {
			this.status.error = "Another sync or cleanup is running. Please wait.";
			return;
		}
		SyncManager.busy = true;
		this.status.isSyncing = true;
		this.status.error = null;
		try {
			if (!(await this.provider.authenticate())) return;
			const files = await this.provider.listFiles();
			this.scope = this.provider.getScope?.() ?? "";
			const remote = new Map<string, SyncMetadata[]>();
			for (const file of files) {
				const key = recordKey(file.type, file.id);
				remote.set(key, [...(remote.get(key) ?? []), file]);
			}
			const local = [
				...(await getAllSongs()).map((song) => ({ id: song.id, type: "song" as const })),
				...(await getAllSetlists()).map((list) => ({ id: list.id, type: "setlist" as const })),
				...(await (await initDB()).getAll("tombstones")),
			];
			const identities = new Map(
				local.map((item) => [recordKey(item.type, item.id), { id: item.id, type: item.type }]),
			);
			for (const file of files)
				identities.set(recordKey(file.type, file.id), { id: file.id, type: file.type });
			for (const [key, item] of identities)
				await this.syncRecord(item.type, item.id, remote.get(key) ?? []);
			this.status.conflictCount = (await getSyncConflicts()).filter(
				(conflict) => (conflict.scope ?? "") === this.scope,
			).length;
			this.status.lastSyncTime = new Date().toISOString();
			localStorage.setItem(`last_sync:${this.provider.name}`, this.status.lastSyncTime);
		} catch (error) {
			this.status.error = error instanceof Error ? error.message : "Sync failed";
		} finally {
			this.status.isSyncing = false;
			SyncManager.busy = false;
		}
	}
	private async read(file: SyncMetadata): Promise<RemoteVersion> {
		const remoteId = file.remoteId ?? file.gdriveId;
		if (!remoteId) throw new Error("Missing remote file identity.");
		const value = JSON.parse(await this.provider.downloadFile(remoteId));
		const { _sync, ...data } = value;
		if (
			_sync &&
			(_sync.revision !== file.revision ||
				!Array.isArray(_sync.parents) ||
				!_sync.parents.every((parent: unknown) => typeof parent === "string") ||
				JSON.stringify([..._sync.parents].sort()) !==
					JSON.stringify([...(file.parents ?? [])].sort()))
		)
			throw new Error("Invalid remote sync ancestry.");
		let record: LibraryRecord;
		if (data.deleted === true) {
			if (
				data.id !== file.id ||
				data.type !== file.type ||
				typeof data.title !== "string" ||
				![data.createdAt, data.lastModified].every(
					(date) => typeof date === "string" && Number.isFinite(Date.parse(date)),
				)
			)
				throw new Error("Invalid remote deletion record.");
			record = data;
		} else
			record =
				file.type === "song"
					? parseSyncedSong(JSON.stringify(data), file.id)
					: parseSyncedSetlist(JSON.stringify(data), file.id);
		if (Date.parse(record.lastModified) !== Date.parse(file.lastModified))
			throw new Error("Remote record changed during sync. Please retry.");
		return { revision: file.revision ?? `legacy-${remoteId}`, record };
	}
	private async push(type: RecordType, record: LibraryRecord, parents: string[]): Promise<string> {
		// Join large conflict groups through intermediate revisions within Drive's property limit.
		let ancestry = parents;
		while (ancestry.length > 26) {
			const bridge = await this.push(type, record, ancestry.slice(0, 26));
			ancestry = [bridge, ...ancestry.slice(26)];
		}
		parents = ancestry;
		const revision = crypto.randomUUID();
		await this.provider.uploadFile(
			{
				id: record.id,
				title: recordTitle(record),
				type,
				lastModified: record.lastModified,
				revision,
				parents,
			},
			JSON.stringify({ ...record, _sync: { revision, parents } }),
		);
		return revision;
	}
	private async syncRecord(type: RecordType, id: string, files: SyncMetadata[]) {
		const local = await getLocalRecord(type, id);
		const base = await getSyncBase(type, id, this.scope);
		const versions = await Promise.all(files.map((file) => this.read(file)));
		const revisions = versions.map((version) => version.revision).sort();
		if (!versions.length) {
			if (local) {
				const revision = await this.push(type, local, []);
				await acknowledge(type, local, local, [revision], false, this.scope);
			}
			return;
		}
		const remote = versions[0].record;
		const remoteSame = versions.every(
			(version) => recordFingerprint(version.record) === recordFingerprint(remote),
		);
		const localSame = local && recordFingerprint(local) === recordFingerprint(remote);
		const remoteUnchanged =
			base && JSON.stringify([...base.revisions].sort()) === JSON.stringify(revisions);
		const reviewedUnchanged =
			!base?.reviewedFingerprints ||
			JSON.stringify(base.reviewedFingerprints) ===
				JSON.stringify(
					versions
						.map((version) => `${version.revision}:${recordFingerprint(version.record)}`)
						.sort(),
				);
		if (base?.resolved && remoteUnchanged && reviewedUnchanged && local) {
			const revision = await this.push(type, local, revisions);
			await acknowledge(type, local, local, [revision], false, this.scope);
			return;
		}
		if (remoteSame && localSame) {
			const heads = revisions.length > 1 ? [await this.push(type, local, revisions)] : revisions;
			await acknowledge(type, local, local, heads, false, this.scope);
			return;
		}
		if (
			remoteSame &&
			(!local || (base && !base.resolved && recordFingerprint(local) === base.fingerprint))
		) {
			const heads = revisions.length > 1 ? [await this.push(type, remote, revisions)] : revisions;
			await acknowledge(type, remote, local, heads, true, this.scope);
			return;
		}
		if (
			local &&
			base &&
			!base.resolved &&
			remoteSame &&
			recordFingerprint(remote) === base.fingerprint
		) {
			const revision = await this.push(type, local, revisions);
			await acknowledge(type, local, local, [revision], false, this.scope);
			return;
		}
		await saveConflict({
			id: syncKey(type, id, this.scope),
			scope: this.scope || undefined,
			provider: this.provider.name,
			recordId: id,
			type,
			local,
			remote: versions,
			createdAt: new Date().toISOString(),
		});
	}
}
