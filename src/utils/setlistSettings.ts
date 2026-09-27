import type { Setlist, SetlistSongSettings, Song } from "../db";
import { tempoMeter } from "./tempo";

export const defaultSongSetting = (
	song: Pick<Song, "defaultTranspose"> | undefined,
): SetlistSongSettings => ({ transpose: song?.defaultTranspose ?? 0 });

export const occurrenceSettings = (list: Setlist): SetlistSongSettings[] =>
	list.songIds.map((_, index) => list.songSettings?.[index] ?? { transpose: 0 });

export function transposeKey(key: string | undefined, transpose: number): string {
	if (!key) return "Unknown key";
	const match = /^([A-G])([#b]?)(.*)$/.exec(key);
	if (!match) return key;
	const pitches: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
	const pitch = pitches[match[1]] + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0);
	const names =
		match[2] === "b"
			? ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
			: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
	return names[(((pitch + transpose) % 12) + 12) % 12] + match[3];
}
export function settingLabel(song: Song | undefined, setting?: SetlistSongSettings) {
	const transpose = setting?.transpose ?? 0;
	const key = song?.key ?? /\{key:\s*([^}]+)\}/i.exec(song?.content ?? "")?.[1]?.trim();
	const capo = setting?.capo ?? song?.capo;
	const bpm = song?.tempo ?? Number(/\{tempo:\s*([^}]+)\}/i.exec(song?.content ?? "")?.[1]);
	const time = song?.time || /\{time:\s*([^}]+)\}/i.exec(song?.content ?? "")?.[1]?.trim();
	return [
		transposeKey(key, transpose),
		transpose ? `T${transpose > 0 ? "+" : ""}${transpose}` : "",
		bpm > 0 ? `${bpm}bpm` : "",
		tempoMeter(time).label,
		capo ? `Capo ${capo}` : "",
	]
		.filter(Boolean)
		.join(" | ");
}
export function occurrenceContent(song: Song, setting?: SetlistSongSettings) {
	if (setting?.capo === undefined) return song.content;
	return `{capo: ${setting.capo}}\n${song.content.replace(/\{capo:\s*[^}]*\}/gi, "")}`;
}
