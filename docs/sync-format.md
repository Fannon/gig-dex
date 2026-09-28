# Sync folder format and compatibility

This document describes the durable files that Gig-Dex writes to a sync folder. A folder is a revision log, not a backup export or a mirror of the current library. Keep the files when changing devices or app versions. Use Gig-Dex's reviewed History cleanup to retire old revisions.

## Folder layout

- Local folder, OneDrive app folder, and Dropbox app folder: one flat file per revision, named `gigdex-song-<revision>.json` or `gigdex-setlist-<revision>.json`. The current writer uses a 64-character lowercase SHA-256 hex revision. Existing UUID revision names remain valid and readable.
- Local folder history cleanup copies old files to `.gigdex-trash/` and hides a source file only while its identical archive copy exists. Do not manually move files into or out of this directory.
- Google Drive uses files in the `Gig-Dex` folder. Its older title-based filenames remain valid. The Drive file properties carry the record ID, type, revision, parents, modification time, and format version; the JSON content is authoritative when it is read.
- Each provider has its own folder and revision graph. Its file names and remote IDs are scoped to that provider. Gig-Dex does not copy remote files directly between providers.

## JSON contract

Each file is UTF-8 JSON with one song, setlist, or deletion record at the top level. It retains the record's stable `id`, `createdAt`, and `lastModified` fields. Songs contain `title`, `artist`, `content`, and `tags`; setlists contain `name` and ordered `songIds`. A deletion record contains `id`, `type`, `deleted: true`, `title`, `createdAt`, and `lastModified`. Unknown record fields are preserved when read and written so optional additions can be made without discarding data.

The `_sync` member is protocol metadata:

```json
{
  "_sync": {
    "formatVersion": 1,
    "revision": "<64 lowercase hex characters>",
    "parents": ["<prior revision>"]
  }
}
```

The real file also contains the record fields beside `_sync`. `parents` names the revisions this file supersedes for **the same record ID and type**. It is sorted and contains no duplicates in new files. Two unjoined heads represent concurrent changes; Gig-Dex presents a conflict instead of choosing by timestamp. A deletion is a revision, so an offline device can learn that a record was deleted.

Version 1 uses a repeatable revision ID: SHA-256 of the canonical JSON for `{formatVersion: 1, parents, record}`. Object keys sort by Unicode code unit, parent IDs sort the same way, and `record` includes `lastModified` but excludes `_sync`. The whole stored file uses the same canonical key order. Readers verify this checksum and refuse an in-place edit or damaged file. The revision identifies the **exact record and ancestry**; it is not a content deduplication key for different records. Retries therefore use the same name and bytes. A provider must never overwrite a different file at that name. A 5 MB limit applies to new files and remote downloads.

Files with an `_sync` envelope but no `formatVersion` are version 0 and remain readable. Older Google Drive records may have no envelope; their Drive metadata supplies a synthetic legacy revision. A file declaring a newer format version stops sync until Gig-Dex is updated. Existing files are not rewritten in bulk; each future edit creates a new version 1 revision parented to the old head.

## Change rules

The folder and filename pattern, record IDs, `_sync.revision`, and `_sync.parents` are permanent protocol fields. New optional record fields may be added to version 1 only if old clients can safely preserve them and their meaning does not change. Any change to ancestry, deletion meaning, canonical hashing, or required record fields needs a new format version and a reader that still understands prior versions. Release the reader before writing the new version. Test mixed old and new revisions, two-device conflicts, interrupted uploads, and all four providers before changing this contract.

## Multiple configured providers

All connected providers read and write the same local IndexedDB library. Each provider has its own sync baseline and conflict history, and sync operations run one at a time. Syncing Dropbox and then OneDrive can relay the resulting local changes to OneDrive, but it does **not** make their remote folders one shared history. Sync each provider before switching devices, and resolve a conflict in the provider that reports it. For a simple multi-device setup, choosing one sync provider avoids extra conflict paths.

ChordPro import deduplicates normalized file content against local songs. Sync itself matches records by stable ID, tracks ancestor revisions, and avoids pushing semantically identical content. It does not merge different song IDs merely because their titles or lyrics match.
