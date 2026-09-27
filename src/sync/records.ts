import type { Setlist, Song } from "../db";
export type RecordType = "song" | "setlist";
export interface DeletionRecord {
	id: string;
	type: RecordType;
	deleted: true;
	title: string;
	createdAt: string;
	lastModified: string;
}
export type LibraryRecord = Song | Setlist | DeletionRecord;
export interface SyncBase {
	id: string;
	fingerprint: string;
	revisions: string[];
	resolved?: boolean;
}
export interface RemoteVersion {
	revision: string;
	record: LibraryRecord;
}
export interface SyncConflict {
	id: string;
	recordId: string;
	type: RecordType;
	local?: LibraryRecord;
	remote: RemoteVersion[];
	createdAt: string;
}
export const recordKey = (type: RecordType, id: string) => `${type}:${id}`;
export const isDeletion = (record: LibraryRecord): record is DeletionRecord =>
	"deleted" in record && record.deleted === true;
export const recordTitle = (record: LibraryRecord) =>
	"name" in record ? record.name : record.title;
