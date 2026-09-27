import assert from "node:assert/strict";
import { test } from "node:test";
import { convertChordle, normalizeSections } from "./chordle-import.mjs";

const song = `{t: Synthetic Lantern}\n{artist: Test Band}\n{key: Am}\n{tempo: 96}\n{tag: acoustic}\n{start_of_chorus: Refrain}\n[Am]A synthetic line\n{end_of_chorus}\n{x_chordle_repeat_section: Refrain}`;
const entries = {
	"songs/song.chordle": song,
	"setlists/list.chordle": JSON.stringify({
		id: "list",
		title: "Synthetic Gig",
		sessionDate: "2020-01-02T00:00:00",
		songs: [
			{ id: "song", key: "Cm", capo: 3 },
			{ id: "song", key: "Am", order: 1 },
		],
	}),
};
test("imports metadata, repeats, dates and independent occurrence keys", () => {
	const backup = convertChordle(entries, "2026-01-01T00:00:00Z");
	assert.equal(backup.songs.length, 1);
	assert.equal(backup.songs[0].tempo, 96);
	assert.deepEqual(backup.songs[0].tags, ["acoustic"]);
	assert.equal(backup.songs[0].content.match(/A synthetic line/g).length, 2);
	assert.deepEqual(backup.setlists[0].songIds, ["song", "song"]);
	assert.deepEqual(backup.setlists[0].songSettings, [{ transpose: 3, capo: 3 }, { transpose: 0 }]);
	assert.match(backup.setlists[0].description, /2020-01-02/);
	assert.equal(backup.setlists[0].date, "2020-01-02");
	assert.deepEqual(convertChordle(entries, backup.exportedAt), backup);
});
test("rejects missing references, unresolved sections and invalid occurrence settings", () => {
	assert.throws(() => normalizeSections("{x_chordle_repeat_section: Missing}"), /Unresolved/);
	assert.throws(
		() =>
			convertChordle({ ...entries, "songs/song.chordle": "{key: C}\n{start_of_verse}\n[C]Test" }),
		/Unclosed/,
	);
	assert.throws(
		() =>
			convertChordle({
				...entries,
				"setlists/list.chordle": JSON.stringify({
					id: "list",
					title: "Test",
					songs: [{ id: "missing" }],
				}),
			}),
		/missing/,
	);
	assert.throws(
		() =>
			convertChordle({
				...entries,
				"setlists/list.chordle": JSON.stringify({
					id: "list",
					title: "Test",
					songs: [{ id: "song", capo: -1 }],
				}),
			}),
		/Invalid/,
	);
});
test("sorts explicit order with omitted zero and expands standard chorus", () => {
	const backup = convertChordle({
		...entries,
		"songs/song.chordle": song.replace("{x_chordle_repeat_section: Refrain}", "{chorus}"),
		"setlists/list.chordle": JSON.stringify({
			id: "list",
			title: "Test",
			songs: [
				{ id: "song", order: 2, key: "Gm" },
				{ id: "song", key: "Am" },
			],
		}),
	});
	assert.equal(backup.setlists[0].songSettings[0].transpose, 0);
	assert.equal(backup.setlists[0].songSettings[1].transpose, -2);
	assert.equal(backup.songs[0].content.match(/A synthetic line/g).length, 2);
});

test("flags unresolved repeats without losing source and malformed text", () => {
	const backup = convertChordle({
		...entries,
		"songs/song.chordle": `${song}\n{x_chordle_repeat_section: Missing}\n[`,
	});
	assert.equal(backup.importWarnings.length, 1);
	assert.equal(backup.importWarnings[0].warnings.length, 2);
	assert.ok(backup.songs[0].tags.includes("import-review"));
	assert.ok(backup.songs[0].content.includes("{x_chordle_repeat_section: Missing}"));
	assert.ok(backup.songs[0].content.endsWith("["));
});
