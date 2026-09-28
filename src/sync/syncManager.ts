import { getAllSetlists, getAllSongs, initDB, notifyLibraryChanged } from "../db";
import { blockPwaUpdate } from "../pwa/lifecycle";
import { parseDeletion, parseSyncedSetlist, parseSyncedSong } from "../utils/libraryValidation";
import { recordFingerprint, stableStringify } from "../utils/recordFingerprint";
import { addSyncActivity } from "./activity";
import { type LibraryRecord, type RecordType, type RemoteVersion, recordKey, recordTitle, syncKey } from "./records";
import { createSyncFile, parseSyncFile, SYNC_FORMAT_VERSION, syncEnvelope, verifySyncFile } from "./syncFormat";
import {
  acknowledge,
  getLocalRecord,
  getSyncBase,
  getSyncConflicts,
  noteUploadedRevision,
  saveConflict,
} from "./syncStore";
import type { SyncMetadata, SyncProvider, SyncStatus } from "./types";

export class SyncManager {
  private static busy = false;
  private scope = "";
  static async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (SyncManager.busy) throw new Error("Another sync or cleanup is running. Please wait.");
    SyncManager.busy = true;
    const releaseUpdate = blockPwaUpdate();
    try {
      return await operation();
    } finally {
      SyncManager.busy = false;
      releaseUpdate();
      notifyLibraryChanged();
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
    localStorage.removeItem(`last_sync:${this.provider.name}`);
    window.dispatchEvent(new Event("gigdex-sync-status"));
  }
  async sync(): Promise<void> {
    if (this.status.isSyncing || SyncManager.busy) {
      this.status.error = "Another sync or cleanup is running. Please wait.";
      window.dispatchEvent(new Event("gigdex-sync-status"));
      return;
    }
    SyncManager.busy = true;
    const releaseUpdate = blockPwaUpdate();
    this.status.isSyncing = true;
    this.status.error = null;
    try {
      if (!(await this.provider.authenticate()))
        throw new Error(`Could not connect to ${this.provider.name}. Try again.`);
      const files = await this.provider.listFiles();
      const future = files.find((file) => (file.formatVersion ?? 0) > SYNC_FORMAT_VERSION);
      if (future)
        throw new Error(`Unsupported sync format version ${future.formatVersion}. Update Gig-Dex before syncing.`);
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
      for (const file of files) identities.set(recordKey(file.type, file.id), { id: file.id, type: file.type });
      const failures: string[] = [];
      for (const [key, item] of identities) {
        try {
          await this.syncRecord(item.type, item.id, remote.get(key) ?? []);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Unknown error";
          if (reason.startsWith("Unsupported sync format version")) throw error;
          failures.push(`${item.type} ${item.id}: ${reason}`);
        }
      }
      this.status.conflictCount = (await getSyncConflicts()).filter(
        (conflict) => (conflict.scope ?? "") === this.scope,
      ).length;
      if (failures.length) {
        const details = failures.slice(0, 3).join("; ");
        throw new Error(
          `Sync incomplete: ${failures.length} item${failures.length === 1 ? "" : "s"} failed. ${details}`,
        );
      }
      this.status.lastSyncTime = new Date().toISOString();
      localStorage.setItem(`last_sync:${this.provider.name}`, this.status.lastSyncTime);
      addSyncActivity({
        provider: this.provider.name,
        time: this.status.lastSyncTime,
        kind: this.status.conflictCount ? "conflict" : "success",
        message: this.status.conflictCount
          ? `Sync finished with ${this.status.conflictCount} conflict${this.status.conflictCount === 1 ? "" : "s"} to review.`
          : "Sync completed.",
      });
    } catch (error) {
      this.status.error = error instanceof Error ? error.message : "Sync failed";
      addSyncActivity({
        provider: this.provider.name,
        time: new Date().toISOString(),
        kind: "error",
        message: this.status.error,
      });
    } finally {
      this.status.isSyncing = false;
      SyncManager.busy = false;
      releaseUpdate();
      notifyLibraryChanged();
      window.dispatchEvent(new Event("gigdex-sync-status"));
    }
  }
  private async read(file: SyncMetadata): Promise<RemoteVersion> {
    const remoteId = file.remoteId ?? file.gdriveId;
    if (!remoteId) throw new Error("Missing remote file identity.");
    const value = parseSyncFile(await this.provider.downloadFile(remoteId));
    await verifySyncFile(value);
    const { _sync: _envelope, ...data } = value;
    const envelope = syncEnvelope(value);
    if (
      (envelope &&
        (envelope.revision !== file.revision ||
          JSON.stringify([...envelope.parents].sort()) !== JSON.stringify([...(file.parents ?? [])].sort()))) ||
      (!envelope && !file.revision?.startsWith("legacy-"))
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
      record = parseDeletion(data, file.id, file.type);
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
    let ancestry = [...new Set(parents)].sort();
    while (ancestry.length > 26) {
      const bridge = await this.push(type, record, ancestry.slice(0, 26));
      ancestry = [bridge, ...ancestry.slice(26)];
    }
    parents = ancestry;
    const { revision, content, parents: canonicalParents } = await createSyncFile(record, parents);
    const metadata = {
      id: record.id,
      title: recordTitle(record),
      type,
      lastModified: record.lastModified,
      revision,
      parents: canonicalParents,
    };
    try {
      await this.provider.uploadFile(metadata, content);
    } catch (error) {
      // A timeout can arrive after the host committed the file. Verify the exact
      // revision before retrying so the same logical upload cannot fork history.
      let committed = false;
      try {
        const files = await (this.provider.listRevisions?.() ?? this.provider.listFiles());
        const matches = files.filter(
          (file) => file.type === type && file.id === record.id && file.revision === revision,
        );
        for (const file of matches) {
          const remoteId = file.remoteId ?? file.gdriveId;
          if (remoteId && (await this.provider.downloadFile(remoteId)) === content) committed = true;
          else throw new Error("Remote revision identity was reused with different content.");
        }
      } catch (verificationError) {
        if (verificationError instanceof Error && verificationError.message.includes("identity was reused"))
          throw verificationError;
      }
      if (!committed) throw error;
    }
    return revision;
  }
  private async syncRecord(type: RecordType, id: string, files: SyncMetadata[]) {
    const local = await getLocalRecord(type, id);
    const base = await getSyncBase(type, id, this.scope);
    const pushAndAcknowledge = async (record: LibraryRecord, parents: string[]) => {
      const revision = await this.push(type, record, parents);
      try {
        await acknowledge(type, record, local, [revision], false, this.scope);
      } catch (error) {
        if (error instanceof Error && error.message === "Library changed during sync. Please sync again.")
          await noteUploadedRevision(type, record, [revision], base, this.scope);
        throw error;
      }
    };
    const versions = await Promise.all(files.map((file) => this.read(file)));
    if (stableStringify(await getLocalRecord(type, id)) !== stableStringify(local))
      throw new Error("Library changed during sync. Please sync again.");
    const byRevision = new Map<string, string>();
    for (const version of versions) {
      const content = stableStringify(version.record);
      const existing = byRevision.get(version.revision);
      if (existing && existing !== content) throw new Error("Remote files reuse a revision ID with different content.");
      byRevision.set(version.revision, content);
    }
    const revisions = [...byRevision.keys()].sort();
    if (!versions.length) {
      if (local) {
        await pushAndAcknowledge(local, []);
      }
      return;
    }
    const remote = versions[0].record;
    const remoteSame = versions.every((version) => recordFingerprint(version.record) === recordFingerprint(remote));
    const localSame = local && recordFingerprint(local) === recordFingerprint(remote);
    const remoteUnchanged = base && JSON.stringify([...base.revisions].sort()) === JSON.stringify(revisions);
    const reviewedUnchanged =
      !base?.reviewedFingerprints ||
      JSON.stringify(base.reviewedFingerprints) ===
        JSON.stringify(versions.map((version) => `${version.revision}:${recordFingerprint(version.record)}`).sort());
    if (base?.resolved && remoteUnchanged && reviewedUnchanged && local) {
      await pushAndAcknowledge(local, revisions);
      return;
    }
    if (remoteSame && localSame) {
      if (revisions.length > 1) await pushAndAcknowledge(local, revisions);
      else await acknowledge(type, local, local, revisions, false, this.scope);
      return;
    }
    if (remoteSame && (!local || (base && !base.resolved && recordFingerprint(local) === base.fingerprint))) {
      const joined = revisions.length > 1;
      const heads = joined ? [await this.push(type, remote, revisions)] : revisions;
      try {
        await acknowledge(type, remote, local, heads, true, this.scope);
      } catch (error) {
        if (joined && error instanceof Error && error.message === "Library changed during sync. Please sync again.")
          await noteUploadedRevision(type, remote, heads, base, this.scope);
        throw error;
      }
      return;
    }
    if (local && base && !base.resolved && remoteSame && recordFingerprint(remote) === base.fingerprint) {
      await pushAndAcknowledge(local, revisions);
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
