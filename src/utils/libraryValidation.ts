import type { Setlist, Song } from "../db";
import { isCalendarDate } from "./calendarDate.ts";

function validCommon(value: unknown, expectedId: string): value is Record<string, unknown> {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.id === "string" &&
		record.id.trim().length > 0 &&
		record.id === expectedId &&
		[record.createdAt, record.lastModified].every(
			(date) => typeof date === "string" && Number.isFinite(Date.parse(date)),
		)
	);
}

function stringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function parseSyncedSong(content: string, expectedId: string): Song {
	const value: unknown = JSON.parse(content);
	if (
		!validCommon(value, expectedId) ||
		typeof value.title !== "string" ||
		typeof value.artist !== "string" ||
		typeof value.content !== "string" ||
		!stringArray(value.tags) ||
		(value.defaultTranspose !== undefined &&
			(!Number.isInteger(value.defaultTranspose) ||
				Math.abs(value.defaultTranspose as number) > 24)) ||
		["key", "time", "subtitle", "composer", "lyricist", "copyright", "album", "duration"].some(
			(key) => value[key] !== undefined && typeof value[key] !== "string",
		) ||
		["tempo", "capo", "year"].some(
			(key) =>
				value[key] !== undefined &&
				(typeof value[key] !== "number" || !Number.isFinite(value[key])),
		)
	) {
		throw new Error("Invalid remote song data");
	}
	return value as unknown as Song;
}

export function parseSyncedSetlist(content: string, expectedId: string): Setlist {
	const value: unknown = JSON.parse(content);
	if (
		!validCommon(value, expectedId) ||
		typeof value.name !== "string" ||
		(value.date !== undefined && !isCalendarDate(value.date)) ||
		!stringArray(value.songIds) ||
		(value.tags !== undefined && !stringArray(value.tags)) ||
		(value.description !== undefined && typeof value.description !== "string") ||
		(value.songSettings !== undefined &&
			(!Array.isArray(value.songSettings) ||
				value.songSettings.length !== value.songIds.length ||
				value.songSettings.some(
					(setting) =>
						!setting ||
						typeof setting !== "object" ||
						!Number.isInteger(setting.transpose) ||
						Math.abs(setting.transpose) > 24 ||
						(setting.capo !== undefined &&
							(!Number.isInteger(setting.capo) || setting.capo < 0 || setting.capo > 24)),
				)))
	) {
		throw new Error("Invalid remote setlist data");
	}
	return value as unknown as Setlist;
}

export function parseDeletion(
	value: unknown,
	expectedId: string,
	type: "song" | "setlist",
): import("../sync/records").DeletionRecord {
	if (
		!validCommon(value, expectedId) ||
		value.deleted !== true ||
		value.type !== type ||
		typeof value.title !== "string"
	)
		throw new Error("Invalid deletion record.");
	return value as unknown as import("../sync/records").DeletionRecord;
}
