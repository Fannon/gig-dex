import { getAllSetlists, getAllSongs, type Setlist, type Song, saveSetlist, saveSong } from "../db";
import type { SyncMetadata, SyncProvider, SyncStatus } from "./types";

export class SyncManager {
	private provider: SyncProvider;
	private status: SyncStatus = {
		lastSyncTime: localStorage.getItem("last_sync_time"),
		isSyncing: false,
		error: null,
	};

	constructor(provider: SyncProvider) {
		this.provider = provider;
	}

	getStatus(): SyncStatus {
		return { ...this.status };
	}

	async sync(): Promise<void> {
		if (this.status.isSyncing) return;

		this.status.isSyncing = true;
		this.status.error = null;

		try {
			if (!(await this.provider.authenticate())) {
				this.status.isSyncing = false;
				return;
			}

			const remoteFiles = await this.provider.listFiles();
			const localSongs = await getAllSongs();
			const localSetlists = await getAllSetlists();

			const remoteMap = new Map<string, SyncMetadata>(remoteFiles.map((f) => [f.id, f]));

			// Sync Songs
			for (const song of localSongs) {
				const remote = remoteMap.get(song.id);
				if (!remote || new Date(song.lastModified) > new Date(remote.lastModified)) {
					await this.pushSong(song);
				} else if (new Date(remote.lastModified) > new Date(song.lastModified)) {
					if (remote.gdriveId) {
						await this.pullSong(remote.gdriveId);
					}
				}
				remoteMap.delete(song.id);
			}

			// Sync Setlists
			for (const setlist of localSetlists) {
				const remote = remoteMap.get(setlist.id);
				if (!remote || new Date(setlist.lastModified) > new Date(remote.lastModified)) {
					await this.pushSetlist(setlist);
				} else if (new Date(remote.lastModified) > new Date(setlist.lastModified)) {
					if (remote.gdriveId) {
						await this.pullSetlist(remote.gdriveId);
					}
				}
				remoteMap.delete(setlist.id);
			}

			// Remaining items in remoteMap only exist on remote
			for (const remote of remoteMap.values()) {
				if (remote.gdriveId) {
					if (remote.type === "song") {
						await this.pullSong(remote.gdriveId);
					} else {
						await this.pullSetlist(remote.gdriveId);
					}
				}
			}

			this.status.lastSyncTime = new Date().toISOString();
			localStorage.setItem("last_sync_time", this.status.lastSyncTime);
		} catch (error: unknown) {
			console.error("Sync failed:", error);
			this.status.error = error instanceof Error ? error.message : "Sync failed";
		} finally {
			this.status.isSyncing = false;
		}
	}

	private async pushSong(song: Song) {
		const metadata: SyncMetadata = {
			id: song.id,
			title: song.title,
			lastModified: song.lastModified,
			type: "song",
		};
		await this.provider.uploadFile(metadata, JSON.stringify(song));
	}

	private async pushSetlist(setlist: Setlist) {
		const metadata: SyncMetadata = {
			id: setlist.id,
			title: setlist.name,
			lastModified: setlist.lastModified,
			type: "setlist",
		};
		await this.provider.uploadFile(metadata, JSON.stringify(setlist));
	}

	private async pullSong(gdriveId: string) {
		const content = await this.provider.downloadFile(gdriveId);
		try {
			const song: Song = JSON.parse(content);
			await saveSong(song);
		} catch (e) {
			console.error("Failed to parse pulled song", e);
		}
	}

	private async pullSetlist(gdriveId: string) {
		const content = await this.provider.downloadFile(gdriveId);
		try {
			const setlist: Setlist = JSON.parse(content);
			await saveSetlist(setlist);
		} catch (e) {
			console.error("Failed to parse pulled setlist", e);
		}
	}
}
