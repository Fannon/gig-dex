import { describe, expect, it } from "vitest";
import { parseSyncedSetlist, parseSyncedSong } from "./libraryValidation";

const common = {
	id: "record",
	createdAt: "2025-01-01T00:00:00Z",
	lastModified: "2026-01-01T00:00:00Z",
};
const song = {
	...common,
	title: "Test",
	artist: "Artist",
	content: "[C]Original",
	tags: ["test"],
	composer: "Composer",
};

describe("downloaded library records", () => {
	it("preserves the full validated song and setlist records", () => {
		expect(parseSyncedSong(JSON.stringify(song), "record")).toEqual(song);
		const setlist = { ...common, name: "Set", songIds: ["first", "second", "first"] };
		expect(parseSyncedSetlist(JSON.stringify(setlist), "record")).toEqual(setlist);
	});
	it.each([
		null,
		[],
		{},
		{ ...song, id: "other" },
		{ ...song, tags: [42] },
		{ ...song, artist: null },
		{ ...song, content: {} },
		{ ...song, lastModified: "invalid" },
	])("rejects invalid song data: %j", (value) => {
		expect(() => parseSyncedSong(JSON.stringify(value), "record")).toThrow();
	});
	it.each([
		{ ...common, name: "Set", songIds: [7] },
		{ ...common, name: "Set", songIds: [], createdAt: null },
	])("rejects invalid setlist data: %j", (value) => {
		expect(() => parseSyncedSetlist(JSON.stringify(value), "record")).toThrow();
	});
});
