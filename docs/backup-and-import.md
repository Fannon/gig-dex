# Backup and import

## Back up your library

**Settings → Library → Export library** downloads one `gig-dex-backup-<date>.json` file. It contains all songs and setlists with their tags and metadata, deletion records and unresolved sync conflicts. Sync connections, Client IDs, tokens and per-device reading positions are not included.

Keep a copy outside the browser: email it to yourself, put it on a USB stick or in cloud storage. Export before gigs, before updates and before cleaning up. The export time Gig-Dex remembers only records that a download was requested, not that the file was saved.

## Restore a backup

1. Select the file under **Settings → Library → Restore backup**. Selecting a file only shows a preview; nothing changes yet.
2. Check the song and setlist counts, and optionally expand the setlists in the file.
3. Choose a **Restore mode**:
   - **Merge** (default) keeps your current library. Songs and setlists that are already identical stay as they are; different versions of the same song are kept side by side as separate copies, and imported setlists point at the right copies. Songs you deleted earlier come back as new copies, so sync does not undo the deletion on other devices.
   - **Replace** removes the current library first and asks for confirmation with the exact counts. Use it only with a complete backup. Removed songs and setlists are recorded as deletions, so connected sync providers learn about them.
4. Press **Import backup**.

The whole file is validated before anything is written, and the import happens in one step: a damaged or unsupported file changes nothing.

A backup file placed in a sync folder is ignored by sync. Restore it here; a connected provider then syncs the imported records.

## Import ChordPro files

**Settings → Library → Import ChordPro songs** accepts several `.cho`, `.chopro`, `.chordpro`, `.pro`, `.crd` or `.txt` files at once. Each song keeps its original text and directives; title, artist, key, tempo, time and other metadata are read from it. Files identical to a song already in the library are skipped. The result lists how many files were imported, skipped as duplicates or failed, with the reason per file. Empty files fail; songs with broken chord markup are imported and shown as raw text so you can repair them in the editor.

To bring in a chord sheet from elsewhere, you can also create a new song and paste chords-over-words text into the simple editor.
