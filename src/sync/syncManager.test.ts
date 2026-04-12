import { beforeEach, describe, expect, it, vi } from "vitest";
import { SyncManager } from "./syncManager";
import type { SyncMetadata, SyncProvider, SyncStatus } from "./types";

// Mock the db module
vi.mock("../db", () => ({
	getAllSongs: vi.fn(),
	getAllSetlists: vi.fn(),
	saveSong: vi.fn(),
	saveSetlist: vi.fn(),
}));

import { getAllSetlists, getAllSongs, saveSong } from "../db";

const mockGetAllSongs = vi.mocked(getAllSongs);
const mockGetAllSetlists = vi.mocked(getAllSetlists);
const mockSaveSong = vi.mocked(saveSong);

const createMockProvider = (): SyncProvider => ({
	name: "Mock Provider",
	isEnabled: vi.fn().mockReturnValue(true),
	authenticate: vi.fn().mockResolvedValue(true),
	logout: vi.fn().mockResolvedValue(undefined),
	listFiles: vi.fn().mockResolvedValue([]),
	downloadFile: vi.fn().mockResolvedValue("{}"),
	uploadFile: vi.fn().mockResolvedValue(undefined),
	deleteFile: vi.fn().mockResolvedValue(undefined),
});

describe("SyncManager", () => {
	let mockProvider: ReturnType<typeof createMockProvider>;
	let syncManager: SyncManager;

	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		mockProvider = createMockProvider();
		syncManager = new SyncManager(mockProvider);

		// Default empty data
		mockGetAllSongs.mockResolvedValue([]);
		mockGetAllSetlists.mockResolvedValue([]);
	});

	describe("getStatus", () => {
		it("should return initial status", () => {
			const status = syncManager.getStatus();
			expect(status.isSyncing).toBe(false);
			expect(status.error).toBeNull();
			expect(status.lastSyncTime).toBeNull();
		});

		it("should return copy of status", () => {
			const status1 = syncManager.getStatus();
			const status2 = syncManager.getStatus();
			expect(status1).not.toBe(status2);
			expect(status1).toEqual(status2);
		});
	});

	describe("sync", () => {
		it("should not start sync if already syncing", async () => {
			// Start first sync but don't await
			vi.mocked(mockProvider.authenticate).mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve(true), 100)),
			);
			const sync1 = syncManager.sync();
			const sync2 = syncManager.sync();

			await sync1;
			await sync2;

			// authenticate should only be called once
			expect(mockProvider.authenticate).toHaveBeenCalledTimes(1);
		});

		it("should set syncing status during sync", async () => {
			let statusDuringSync: SyncStatus = syncManager.getStatus();

			vi.mocked(mockProvider.listFiles).mockImplementation(async () => {
				statusDuringSync = syncManager.getStatus();
				return [];
			});

			await syncManager.sync();

			expect(statusDuringSync.isSyncing).toBe(true);
			expect(syncManager.getStatus().isSyncing).toBe(false);
		});

		it("should return early if authentication fails", async () => {
			vi.mocked(mockProvider.authenticate).mockResolvedValue(false);

			await syncManager.sync();

			expect(mockProvider.listFiles).not.toHaveBeenCalled();
		});

		it("should push new local songs to remote", async () => {
			const localSong = {
				id: "song-1",
				title: "Test Song",
				artist: "Test Artist",
				content: "[G]Hello",
				tags: [],
				lastModified: "2026-02-03T08:00:00Z",
				createdAt: "2026-02-03T08:00:00Z",
			};

			mockGetAllSongs.mockResolvedValue([localSong]);
			vi.mocked(mockProvider.listFiles).mockResolvedValue([]);

			await syncManager.sync();

			expect(mockProvider.uploadFile).toHaveBeenCalledWith(
				expect.objectContaining({
					id: "song-1",
					title: "Test Song",
					type: "song",
				}),
				JSON.stringify(localSong),
			);
		});

		it("should push updated local songs to remote", async () => {
			const localSong = {
				id: "song-1",
				title: "Updated Song",
				artist: "Test Artist",
				content: "[G]Hello",
				tags: [],
				lastModified: "2026-02-03T10:00:00Z", // Newer
				createdAt: "2026-02-03T08:00:00Z",
			};

			const remoteMeta: SyncMetadata = {
				id: "song-1",
				title: "Old Song",
				lastModified: "2026-02-03T08:00:00Z", // Older
				type: "song",
				gdriveId: "gdrive-123",
			};

			mockGetAllSongs.mockResolvedValue([localSong]);
			vi.mocked(mockProvider.listFiles).mockResolvedValue([remoteMeta]);

			await syncManager.sync();

			expect(mockProvider.uploadFile).toHaveBeenCalled();
			expect(mockProvider.downloadFile).not.toHaveBeenCalled();
		});

		it("should pull updated remote songs to local", async () => {
			const localSong = {
				id: "song-1",
				title: "Old Song",
				artist: "Test Artist",
				content: "[G]Hello",
				tags: [],
				lastModified: "2026-02-03T08:00:00Z", // Older
				createdAt: "2026-02-03T08:00:00Z",
			};

			const remoteMeta: SyncMetadata = {
				id: "song-1",
				title: "Updated Song",
				lastModified: "2026-02-03T10:00:00Z", // Newer
				type: "song",
				gdriveId: "gdrive-123",
			};

			const remoteSong = {
				...localSong,
				title: "Updated Song",
				lastModified: "2026-02-03T10:00:00Z",
			};

			mockGetAllSongs.mockResolvedValue([localSong]);
			vi.mocked(mockProvider.listFiles).mockResolvedValue([remoteMeta]);
			vi.mocked(mockProvider.downloadFile).mockResolvedValue(JSON.stringify(remoteSong));

			await syncManager.sync();

			expect(mockProvider.downloadFile).toHaveBeenCalledWith("gdrive-123");
			expect(mockSaveSong).toHaveBeenCalledWith(remoteSong);
		});

		it("should pull remote-only songs to local", async () => {
			const remoteMeta: SyncMetadata = {
				id: "song-2",
				title: "Remote Only Song",
				lastModified: "2026-02-03T10:00:00Z",
				type: "song",
				gdriveId: "gdrive-456",
			};

			const remoteSong = {
				id: "song-2",
				title: "Remote Only Song",
				artist: "Remote Artist",
				content: "[C]Remote",
				tags: [],
				lastModified: "2026-02-03T10:00:00Z",
				createdAt: "2026-02-03T10:00:00Z",
			};

			mockGetAllSongs.mockResolvedValue([]);
			vi.mocked(mockProvider.listFiles).mockResolvedValue([remoteMeta]);
			vi.mocked(mockProvider.downloadFile).mockResolvedValue(JSON.stringify(remoteSong));

			await syncManager.sync();

			expect(mockProvider.downloadFile).toHaveBeenCalledWith("gdrive-456");
			expect(mockSaveSong).toHaveBeenCalledWith(remoteSong);
		});

		it("should update lastSyncTime after successful sync", async () => {
			await syncManager.sync();

			const status = syncManager.getStatus();
			expect(status.lastSyncTime).not.toBeNull();
			expect(localStorage.getItem("last_sync_time")).toBe(status.lastSyncTime);
		});

		it("should set error status on sync failure", async () => {
			vi.mocked(mockProvider.listFiles).mockRejectedValue(new Error("Network error"));

			await syncManager.sync();

			const status = syncManager.getStatus();
			expect(status.error).toBe("Network error");
			expect(status.isSyncing).toBe(false);
		});

		it("should handle malformed remote song gracefully", async () => {
			const remoteMeta: SyncMetadata = {
				id: "song-bad",
				title: "Bad Song",
				lastModified: "2026-02-03T10:00:00Z",
				type: "song",
				gdriveId: "gdrive-bad",
			};

			mockGetAllSongs.mockResolvedValue([]);
			vi.mocked(mockProvider.listFiles).mockResolvedValue([remoteMeta]);
			vi.mocked(mockProvider.downloadFile).mockResolvedValue("not json");

			// Should not throw
			await syncManager.sync();

			expect(mockSaveSong).not.toHaveBeenCalled();
		});
	});
});
