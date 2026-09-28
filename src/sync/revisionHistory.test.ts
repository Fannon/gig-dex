import { expect, it } from "vitest";
import { planRevisionCleanup, syncHeads } from "./revisionHistory";
import type { SyncMetadata } from "./types";

const now = Date.parse("2026-09-27T00:00:00Z");
function chain(): SyncMetadata[] {
  return Array.from({ length: 12 }, (_, i) => ({
    id: "song",
    type: "song",
    title: "Test",
    lastModified: "2025-01-01T00:00:00Z",
    uploadedAt: "2025-01-01T00:00:00Z",
    revision: `r${i}`,
    parents: i ? [`r${i - 1}`] : [],
    remoteId: `file${i}`,
    etag: `etag${i}`,
  }));
}
it("keeps one head and five ancestors, removes oldest first, and interruption never revives history", () => {
  let files = chain();
  const plan = planRevisionCleanup(files, now);
  expect(plan.map((file) => file.revision)).toEqual(["r0", "r1", "r2", "r3", "r4", "r5"]);
  for (const file of plan) {
    files = files.filter((item) => item !== file);
    expect(syncHeads(files).map((item) => item.revision)).toEqual(["r11"]);
  }
});
it("preserves competing branches, recent uploads, legacy records and missing provenance", () => {
  const branches = chain();
  branches.push({ ...branches[11], revision: "fork", remoteId: "fork", parents: ["r6"] });
  expect(planRevisionCleanup(branches, now)).toEqual([]);
  expect(
    planRevisionCleanup(
      chain().map((file) => ({ ...file, uploadedAt: new Date(now - 86400000).toISOString() })),
      now,
    ),
  ).toEqual([]);
  expect(
    planRevisionCleanup(
      chain().map((file) => ({ ...file, uploadedAt: undefined })),
      now,
    ),
  ).toEqual([]);
});
it("keeps necessary intermediate ancestry when an older ancestor must be retained", () => {
  const files = chain();
  files[1].uploadedAt = new Date(now).toISOString();
  const plan = planRevisionCleanup(files, now);
  expect(plan.map((file) => file.revision)).toEqual(["r0"]);
  expect(syncHeads(files.filter((file) => !plan.includes(file))).map((file) => file.revision)).toEqual(["r11"]);
});
it("rejects indirect cycles and scopes ancestry by record identity", () => {
  const files = chain();
  files[0].parents = ["r11"];
  expect(() => syncHeads(files)).toThrow("cyclic");
  expect(syncHeads([{ ...chain()[0], id: "other", parents: ["r11"] }, chain()[11]]).map((file) => file.id)).toEqual([
    "other",
    "song",
  ]);
});
