import { parseDeletion, parseSyncedSetlist, parseSyncedSong } from "../utils/libraryValidation";
import { stableStringify } from "../utils/recordFingerprint";
import { planRevisionCleanup } from "./revisionHistory";
import { SyncManager } from "./syncManager";
import { getSyncConflicts } from "./syncStore";
import type { SyncMetadata, SyncProvider } from "./types";

export interface CleanupPlan {
	scope: string;
	snapshot: string;
	candidates: SyncMetadata[];
	createdAt: number;
}
const snapshot = (files: SyncMetadata[]) =>
	stableStringify(
		[...files].sort((a, b) =>
			(a.remoteId ?? a.gdriveId ?? "").localeCompare(b.remoteId ?? b.gdriveId ?? ""),
		),
	);
async function makePlan(provider: SyncProvider): Promise<CleanupPlan> {
	if (!provider.listRevisions || !provider.archiveRevision)
		throw new Error("This host does not support revision cleanup.");
	if ((await getSyncConflicts()).length)
		throw new Error("Resolve and sync all library conflicts before cleaning history.");
	if (!(await provider.authenticate())) throw new Error("Connect your sync host first.");
	const files = await provider.listRevisions();
	const candidates = planRevisionCleanup(files);
	// Validate the surviving heads before trusting their ancestry to retire any older content.
	for (const file of files) {
		if (!candidates.some((candidate) => candidate.id === file.id && candidate.type === file.type))
			continue;
		const remoteId = file.remoteId ?? file.gdriveId;
		if (!remoteId) throw new Error("Missing revision file identity.");
		const value = JSON.parse(await provider.downloadFile(remoteId));
		const { _sync, ...record } = value;
		if (
			!_sync ||
			_sync.revision !== file.revision ||
			stableStringify([..._sync.parents].sort()) !==
				stableStringify([...(file.parents ?? [])].sort())
		)
			throw new Error("Remote history changed. Sync and review cleanup again.");
		if (record.deleted) parseDeletion(record, file.id, file.type);
		else if (file.type === "song") parseSyncedSong(JSON.stringify(record), file.id);
		else parseSyncedSetlist(JSON.stringify(record), file.id);
		if (record.id !== file.id || Date.parse(record.lastModified) !== Date.parse(file.lastModified))
			throw new Error("Revision metadata differs from its contents.");
	}
	return {
		scope: provider.getScope?.() ?? "",
		snapshot: snapshot(files),
		candidates,
		createdAt: Date.now(),
	};
}
async function applyPlan(provider: SyncProvider, reviewed: CleanupPlan) {
	if (Date.now() - reviewed.createdAt > 10 * 60000)
		throw new Error("Cleanup preview expired. Review it again.");
	if (!provider.archiveRevision) throw new Error("This host does not support revision cleanup.");
	const fresh = await makePlan(provider);
	if (
		fresh.scope !== reviewed.scope ||
		fresh.snapshot !== reviewed.snapshot ||
		stableStringify(fresh.candidates) !== stableStringify(reviewed.candidates)
	)
		throw new Error("Remote history changed since the preview. Review cleanup again.");
	let archived = 0;
	for (const file of fresh.candidates) {
		if ((await getSyncConflicts()).length)
			throw new Error("A conflict was detected. Stop cleanup and sync again.");
		try {
			await provider.archiveRevision(file);
			archived++;
		} catch (error) {
			throw new Error(
				`Cleanup stopped after ${archived} revisions. ${error instanceof Error ? error.message : "Please review again."}`,
			);
		}
	}
	return archived;
}

export const previewRevisionCleanup = (provider: SyncProvider) =>
	SyncManager.exclusive(() => makePlan(provider));
export const applyRevisionCleanup = (provider: SyncProvider, plan: CleanupPlan) =>
	SyncManager.exclusive(() => applyPlan(provider, plan));
