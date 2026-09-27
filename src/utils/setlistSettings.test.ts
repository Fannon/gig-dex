import { describe, expect, it } from "vitest";
import type { Setlist, Song } from "../db";
import { parseSyncedSetlist } from "./libraryValidation";
import {
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
		expect(settingLabel(song, { transpose: 2, capo: 0 })).toBe("Bm · +2 st");
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
