import { beforeEach, expect, it, vi } from "vitest";
import { initDB } from "../db";
import { applyRevisionCleanup, previewRevisionCleanup } from "./revisionCleanup";
import { syncHeads } from "./revisionHistory";
import type { SyncMetadata, SyncProvider } from "./types";

const date = "2025-01-01T00:00:00Z";
function cloud() {
  const files: SyncMetadata[] = Array.from({ length: 9 }, (_, i) => ({
    id: "song",
    type: "song",
    title: "Test",
    lastModified: date,
    uploadedAt: date,
    revision: `r${i}`,
    parents: i ? [`r${i - 1}`] : [],
    remoteId: `file${i}`,
    etag: `etag${i}`,
  }));
  const provider: SyncProvider = {
    name: "Test",
    isEnabled: () => true,
    authenticate: async () => true,
    logout: async () => {},
    listFiles: async () => syncHeads(files),
    listRevisions: async () => files,
    uploadFile: async () => {},
    deleteFile: async () => {},
    archiveRevision: vi.fn(async () => {}),
    downloadFile: async (id) => {
      const file = files.find((file) => file.remoteId === id);
      return JSON.stringify({
        id: "song",
        title: "Test",
        artist: "Artist",
        content: "[C]Saved",
        tags: [],
        createdAt: date,
        lastModified: date,
        _sync: { revision: file?.revision, parents: file?.parents },
      });
    },
  };
  return { files, provider };
}
beforeEach(async () => {
  await (await initDB()).clear("syncConflicts");
});
it("previews without mutation, rechecks history, then archives oldest ancestors", async () => {
  const { provider } = cloud();
  const plan = await previewRevisionCleanup(provider);
  expect(plan.candidates.map((file) => file.revision)).toEqual(["r0", "r1", "r2"]);
  expect(provider.archiveRevision).not.toHaveBeenCalled();
  expect(await applyRevisionCleanup(provider, plan)).toBe(3);
  expect(provider.archiveRevision).toHaveBeenCalledTimes(3);
});
it("refuses stale previews, mismatched scopes and expired plans", async () => {
  const { provider, files } = cloud();
  const plan = await previewRevisionCleanup(provider);
  files[8].etag = "changed";
  await expect(applyRevisionCleanup(provider, plan)).rejects.toThrow("changed since");
  expect(provider.archiveRevision).not.toHaveBeenCalled();
  await expect(applyRevisionCleanup(provider, { ...plan, createdAt: 0 })).rejects.toThrow("expired");
});
it("stops on conditional deletion failure and reports partial progress", async () => {
  const { provider } = cloud();
  provider.archiveRevision = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("412 revision changed"));
  const plan = await previewRevisionCleanup(provider);
  await expect(applyRevisionCleanup(provider, plan)).rejects.toThrow("after 1 revisions");
  expect(provider.archiveRevision).toHaveBeenCalledTimes(2);
});
it("refuses cleanup if surviving content is invalid or any conflict remains", async () => {
  const { provider } = cloud();
  provider.downloadFile = async () => "{}";
  await expect(previewRevisionCleanup(provider)).rejects.toThrow("history changed");
  await (await initDB()).put("syncConflicts", {
    id: "song:conflict",
    recordId: "conflict",
    type: "song",
    remote: [],
    createdAt: date,
  });
  await expect(previewRevisionCleanup(provider)).rejects.toThrow("Resolve and sync");
});
