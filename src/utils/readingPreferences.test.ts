import { beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  localStorage.clear();
});

it("recovers from malformed and unsupported reading preferences", async () => {
  const { savedReadingPreferences } = await import("./readingPreferences");
  for (const raw of ["broken", "null", '{"chordMode":"unknown","maxColumns":-1,"wrapLines":"false"}']) {
    localStorage.setItem("song_reading_preferences", raw);
    expect(savedReadingPreferences()).toEqual({ chordMode: "standard", maxColumns: 0, wrapLines: true });
  }
});

it("persists notation, column limits and line wrapping together", async () => {
  const { applyReadingPreferences, savedReadingPreferences } = await import("./readingPreferences");
  const preferences = { chordMode: "roman", maxColumns: 2, wrapLines: false } as const;
  applyReadingPreferences(preferences);
  vi.resetModules();
  expect((await import("./readingPreferences")).savedReadingPreferences()).toEqual(preferences);
  expect(savedReadingPreferences()).toEqual(preferences);
});

it("keeps preferences for this session when storage writes fail", async () => {
  const { applyReadingPreferences, savedReadingPreferences } = await import("./readingPreferences");
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  try {
    applyReadingPreferences({ chordMode: "nashville", maxColumns: 1, wrapLines: true });
    expect(savedReadingPreferences()).toEqual({ chordMode: "nashville", maxColumns: 1, wrapLines: true });
  } finally {
    write.mockRestore();
  }
});
