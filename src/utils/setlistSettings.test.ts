import { describe, expect, it } from "vitest";
import type { Setlist, Song } from "../db";
import { parseSyncedSetlist, parseSyncedSong } from "./libraryValidation";
import {
	defaultSongSetting,
	occurrenceContent,
	occurrenceSettings,
	settingLabel,
	transposeKey,
} from "./setlistSettings";

const list: Setlist = {
	id: "list",
	name: "Gig",
	songIds: ["song", "song"],
	createdAt: "2026-01-01",
	lastModified: "2026-01-01",
};
const song = { key: "Am", content: "{capo: 2}\n[Am]A synthetic line", capo: 2 } as Song;
describe("setlist occurrence settings", () => {
	it("defaults legacy lists and retains independent repeated occurrences", () => {
		expect(occurrenceSettings(list)).toEqual([{ transpose: 0 }, { transpose: 0 }]);
		expect(
			occurrenceSettings({ ...list, songSettings: [{ transpose: 2 }, { transpose: -2 }] }),
		).toEqual([{ transpose: 2 }, { transpose: -2 }]);
	});
	it("handles minor keys, flats and negative transposition", () => {
		expect(transposeKey("Am", 2)).toBe("Bm");
		expect(transposeKey("Bb", -2)).toBe("Ab");
		expect(settingLabel(song, { transpose: 2, capo: 0 })).toBe("Bm | T+2 | 4/4");
	});
	it("changes occurrence capo without modifying the shared song", () => {
		expect(occurrenceContent(song, { transpose: 0, capo: 4 })).toBe(
			"{capo: 4}\n\n[Am]A synthetic line",
		);
		expect(song.capo).toBe(2);
	});
	it("rejects misaligned and malformed settings in backups and sync", () => {
		for (const songSettings of [
			[{ transpose: 0 }],
			[{ transpose: 1.5 }, { transpose: 0 }],
			[{ transpose: 0, capo: -1 }, { transpose: 0 }],
		]) {
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
	expect(
		settingLabel({ ...song, capo: undefined, tempo: 120, time: "6/8" }, { transpose: 0 }),
	).toBe("Am | 120bpm | 6/8");
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
		expect(() =>
			parseSyncedSong(JSON.stringify({ ...record, defaultTranspose }), "song"),
		).toThrow();
});
