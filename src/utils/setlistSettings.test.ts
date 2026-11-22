import { describe, expect, it } from "vitest";
import type { Setlist, SetlistSongSettings, Song } from "../db";
import { parseSyncedSetlist, parseSyncedSong } from "./libraryValidation";
import { applyReadingPreferences } from "./readingPreferences";
import {
  defaultSongSetting,
  effectiveTranspose,
  occurrenceSettings,
  rebaseSetting,
  settingLabel,
  transposeKey,
  wrapTranspose,
} from "./setlistSettings";

const list: Setlist = {
  id: "list",
  name: "Gig",
  songIds: ["song", "song"],
  createdAt: "2026-01-01",
  lastModified: "2026-01-01",
};
const song = { key: "Am", content: "{capo: 2}\n[Am]A synthetic line" } as Song;
describe("setlist occurrence settings", () => {
  it("defaults legacy lists and retains independent repeated occurrences", () => {
    expect(occurrenceSettings(list)).toEqual([{ transpose: 0 }, { transpose: 0 }]);
    expect(occurrenceSettings({ ...list, songSettings: [{ transpose: 2 }, { transpose: -2 }] })).toEqual([
      { transpose: 2 },
      { transpose: -2 },
    ]);
  });
  it("handles minor keys, flats and negative transposition", () => {
    expect(transposeKey("Am", 2)).toBe("Bm");
    expect(transposeKey("Bb", -2)).toBe("Ab");
    expect(settingLabel(song, { transpose: 2 })).toBe("Bm | T+2 | 4/4");
  });
  it("shows standard keys in German spelling after transposition", () => {
    applyReadingPreferences({ chordMode: "german", maxColumns: 0, wrapLines: true });
    try {
      expect(settingLabel({ ...song, key: "B", content: "[Bm]" })).toBe("H | 4/4");
      expect(settingLabel({ ...song, key: "Bb", content: "[Bb]" })).toBe("B | 4/4");
    } finally {
      applyReadingPreferences({ chordMode: "standard", maxColumns: 0, wrapLines: true });
    }
  });
  it("ignores legacy capo directives and entry settings", () => {
    expect(settingLabel(song, { transpose: 0, capo: 4 } as SetlistSongSettings)).toBe("Am | 4/4");
  });
  it("rejects misaligned and malformed settings in backups and sync", () => {
    for (const songSettings of [[{ transpose: 0 }], [{ transpose: 1.5 }, { transpose: 0 }]]) {
      expect(() => parseSyncedSetlist(JSON.stringify({ ...list, songSettings }), "list")).toThrow();
    }
    expect(parseSyncedSetlist(JSON.stringify(list), "list")).toEqual(list);
  });
});

it("copies starting transposition without coupling existing occurrences", () => {
  const source = { ...song, defaultTranspose: -4 };
  const first = defaultSongSetting(source);
  source.defaultTranspose = 2;
  expect(first.transpose).toBe(-4);
  expect(defaultSongSetting(source).transpose).toBe(2);
  expect(occurrenceSettings(list)[0].transpose).toBe(0);
  expect(settingLabel({ ...song, tempo: 120, time: "6/8" }, { transpose: 0 })).toBe("Am | 120bpm | 6/8");
});
it("validates song defaults on sync and backup restoration", () => {
  const record = {
    ...song,
    id: "song",
    title: "Synthetic",
    artist: "Test",
    tags: [],
    createdAt: "2026-01-01",
    lastModified: "2026-01-01",
    subtitle: "Alternative",
    defaultTranspose: -4,
  };
  expect(parseSyncedSong(JSON.stringify(record), "song")).toEqual(record);
  for (const defaultTranspose of [1.5, 25, -25, "2", null])
    expect(() => parseSyncedSong(JSON.stringify({ ...record, defaultTranspose }), "song")).toThrow();
});

describe("entry base keys", () => {
  const inG = { key: "G", content: "{key: G}\n[G]Line" } as Song;
  const inA = { key: "A", content: "{key: A}\n[A]Line" } as Song;
  it("records the song key an entry's transposition was chosen for", () => {
    expect(defaultSongSetting({ ...inG, defaultTranspose: 2 })).toEqual({ transpose: 2, baseKey: "G" });
    expect(defaultSongSetting({ content: "[G]No key" } as Song)).toEqual({ transpose: 0 });
  });
  it("keeps entries sounding the same after the song's key changes", () => {
    // Chosen as +2 from G (sounds A); the song is now written in A.
    expect(effectiveTranspose(inA, { transpose: 2, baseKey: "G" })).toBe(0);
    expect(effectiveTranspose(inA, { transpose: 0, baseKey: "G" })).toBe(-2);
    expect(effectiveTranspose(inA, { transpose: 0, baseKey: "Gm" })).toBe(-2);
    expect(settingLabel(inA, { transpose: 0, baseKey: "G" })).toBe("G | T-2 | 4/4");
    // Legacy entries and unknown keys use the stored transposition as is.
    expect(effectiveTranspose(inA, { transpose: 3 })).toBe(3);
    expect(effectiveTranspose({ content: "[A]" } as Song, { transpose: 3, baseKey: "G" })).toBe(3);
    expect(effectiveTranspose(inA, { transpose: 11, baseKey: "C" })).toBe(2);
  });
  it("rebases only entries that cannot correct themselves", () => {
    // Chords moved with the label: entries with a base key are already right.
    expect(rebaseSetting({ transpose: 2, baseKey: "G" }, "G", "A", 2)).toBeNull();
    // Legacy entries are pinned to the new key, keeping their sound.
    expect(rebaseSetting({ transpose: 0 }, "G", "A", 2)).toEqual({ transpose: -2, baseKey: "A" });
    expect(rebaseSetting({ transpose: 2 }, "G", "A", 2)).toEqual({ transpose: 0, baseKey: "A" });
    // Nothing moved.
    expect(rebaseSetting({ transpose: 2 }, "G", "G", 0)).toBeNull();
    // A corrected label without moved chords: the entry keeps its sound against the same chords.
    expect(rebaseSetting({ transpose: 2, baseKey: "G" }, "G", "A", 0)).toEqual({ transpose: 2, baseKey: "A" });
    // A key set for the first time pins legacy entries.
    expect(rebaseSetting({ transpose: 1 }, undefined, "E", 0)).toEqual({ transpose: 1, baseKey: "E" });
    // A cleared key drops the base key but keeps the sound.
    expect(rebaseSetting({ transpose: 0, baseKey: "G" }, "A", undefined, 0)).toEqual({ transpose: -2 });
    expect(wrapTranspose(-12)).toBe(0);
  });
  it("accepts base keys in backups and sync", () => {
    const songSettings = [{ transpose: 2, baseKey: "G" }, { transpose: 0 }];
    expect(parseSyncedSetlist(JSON.stringify({ ...list, songSettings }), "list").songSettings).toEqual(songSettings);
    for (const baseKey of [3, "", "x".repeat(40)])
      expect(() =>
        parseSyncedSetlist(
          JSON.stringify({ ...list, songSettings: [{ transpose: 0, baseKey }, { transpose: 0 }] }),
          "list",
        ),
      ).toThrow();
  });
});
