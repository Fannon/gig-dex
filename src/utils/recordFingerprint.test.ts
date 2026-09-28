import { expect, it, vi } from "vitest";
import { recordFingerprint, stableStringify } from "./recordFingerprint";

it("sorts protocol keys by code unit regardless of locale", () => {
  const localeCompare = vi.spyOn(String.prototype, "localeCompare").mockImplementation(() => {
    throw new Error("Locale sorting must not affect sync fingerprints.");
  });
  try {
    expect(stableStringify({ ä: 1, z: 2, A: 3, i: 4 })).toBe('{"A":3,"i":4,"z":2,"ä":1}');
  } finally {
    localeCompare.mockRestore();
  }
});

it("treats deletions of the same item as equal despite stale titles and timestamps", () => {
  const deletion = {
    id: "song-1",
    type: "song",
    deleted: true,
    title: "Original",
    createdAt: "2025",
    lastModified: "2026",
  };
  expect(recordFingerprint(deletion)).toBe(recordFingerprint({ ...deletion, title: "Renamed", createdAt: "2024" }));
  expect(recordFingerprint(deletion)).not.toBe(recordFingerprint({ ...deletion, id: "song-2" }));
});
it("treats omitted occurrence defaults like explicit zero transpose", () => {
  const list = { id: "set-1", name: "Gig", songIds: ["song-1", "song-1"] };
  expect(recordFingerprint(list)).toBe(
    recordFingerprint({ ...list, songSettings: [{ transpose: 0 }, { transpose: 0 }] }),
  );
  expect(recordFingerprint({ ...list, songSettings: [{ transpose: 2 }, { transpose: 0 }] })).toBe(
    recordFingerprint({ ...list, songSettings: [{ transpose: 2 }, {}] }),
  );
  expect(recordFingerprint({ ...list, songSettings: [{ transpose: 0, capo: 0 }, { transpose: 0 }] })).not.toBe(
    recordFingerprint(list),
  );
});
