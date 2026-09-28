import { describe, expect, it } from "vitest";
import {
  createSyncFile,
  MAX_SYNC_FILE_BYTES,
  parseSyncFile,
  readSyncResponse,
  syncEnvelope,
  verifySyncFile,
} from "./syncFormat";

const record = {
  id: "song-1",
  title: "Song",
  artist: "",
  content: "[C]Line",
  tags: [],
  createdAt: "2026-01-01T00:00:00Z",
  lastModified: "2026-01-01T00:00:00Z",
};

describe("sync format", () => {
  it("creates repeatable versioned revisions independent of object and parent order", async () => {
    const first = await createSyncFile(record, ["b", "a"]);
    const reordered = Object.fromEntries(Object.entries(record).reverse()) as typeof record;
    const second = await createSyncFile(reordered, ["a", "b"]);
    expect(second).toEqual(first);
    // A golden ID makes accidental changes to the on-disk canonicalization visible.
    expect(first.revision).toBe("6a5df5db1ccc1e5edd7d341f8b3040a98575cea033044d7f227446bc17d6fdcc");
    expect(syncEnvelope(parseSyncFile(first.content))).toEqual({ revision: first.revision, parents: ["a", "b"] });
    await expect(verifySyncFile(parseSyncFile(first.content))).resolves.toBeUndefined();
    await expect(verifySyncFile({ ...parseSyncFile(first.content), title: "Tampered" })).rejects.toThrow(
      "checksum mismatch",
    );
    expect((await createSyncFile({ ...record, title: "Changed" }, ["a", "b"])).revision).not.toBe(first.revision);
  });

  it("reads legacy envelopes but refuses future versions and invalid ancestry", () => {
    expect(syncEnvelope(parseSyncFile(JSON.stringify({ ...record, _sync: { revision: "old", parents: [] } })))).toEqual(
      {
        revision: "old",
        parents: [],
      },
    );
    expect(syncEnvelope(parseSyncFile(JSON.stringify(record)))).toBeUndefined();
    expect(
      syncEnvelope(parseSyncFile(JSON.stringify({ ...record, _sync: { revision: "old", parents: ["a", "a"] } }))),
    ).toEqual({ revision: "old", parents: ["a", "a"] });
    expect(() =>
      parseSyncFile(JSON.stringify({ ...record, _sync: { formatVersion: 2, revision: "new", parents: [] } })),
    ).toThrow("Unsupported sync format version 2");
    expect(() =>
      parseSyncFile(JSON.stringify({ ...record, _sync: { formatVersion: 1, revision: "same", parents: ["same"] } })),
    ).toThrow("Invalid sync revision envelope");
  });

  it("limits downloads even without a Content-Length header", async () => {
    await expect(readSyncResponse(new Response("x".repeat(MAX_SYNC_FILE_BYTES + 1)))).rejects.toThrow("5 MB");
    await expect(
      readSyncResponse(new Response("tiny", { headers: { "Content-Length": String(MAX_SYNC_FILE_BYTES + 1) } })),
    ).rejects.toThrow("5 MB");
  });
});
