import { useState } from "react";
import { cleanChordleSongs, getAllSetlists, getAllSongs, notifyLibraryChanged } from "../db";
import { blockPwaUpdate } from "../pwa/lifecycle";
import { cleanChordleContent, inferSongbookTags, standardizeSourceKey } from "../utils/chordleImport";
import {
  exportLibrary,
  type ImportResult,
  importChordPro,
  type LibraryBackup,
  parseBackup,
  restoreLibrary,
} from "../utils/libraryBackup";
import "./DataManagement.scss";

export const DataManagement = () => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [backup, setBackup] = useState<LibraryBackup | null>(null);
  const [backupName, setBackupName] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [results, setResults] = useState<ImportResult[]>([]);
  const run = async (action: () => Promise<void>) => {
    const releaseUpdate = blockPwaUpdate();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not complete this operation.");
    } finally {
      setBusy(false);
      releaseUpdate();
      notifyLibraryChanged();
    }
  };
  return (
    <section className="settings-page__section data-management">
      <h2>Import / Restore</h2>
      <p className="data-management__intro">
        JSON backups can add songs and setlists to this device. A backup placed in your sync folder is ignored until you
        select it here. Connected Dropbox, OneDrive, and folder sync share completed imports automatically while this
        app is open; use Sync now to check the result or pull changes from another device.
      </p>
      <button
        type="button"
        className="settings-page__option"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const data = await exportLibrary();
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = `gig-dex-backup-${new Date().toISOString().slice(0, 10)}.json`;
            link.click();
            try {
              localStorage.setItem("last_backup_export", new Date().toISOString());
            } catch {
              /* Optional reminder. */
            }
            window.dispatchEvent(new Event("gigdex-backup-export"));
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setMessage(`Backup downloaded: ${data.songs.length} songs and ${data.setlists.length} setlists.`);
          })
        }
      >
        <div className="settings-page__option-text">
          <h3>Export library</h3>
          <p>Download all songs, setlists, tags, and metadata as a JSON backup.</p>
        </div>
      </button>
      <label className="data-management__file">
        Restore backup
        <small>
          Choose a Gig-Dex .json file to preview its songs and setlists. Selecting a file does not change your library.
        </small>
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            setBackup(null);
            setBackupName("");
            if (file)
              void run(async () => {
                setBackup(parseBackup(await file.text()));
                setBackupName(file.name);
                setMode("merge");
              });
          }}
        />
      </label>
      {backup && (
        <div className="data-management__restore">
          <p className="data-management__source">Selected: {backupName}</p>
          <p>
            This file contains <strong>{backup.songs.length} songs</strong> and{" "}
            <strong>{backup.setlists.length} setlists</strong>. Nothing has been imported yet.
          </p>
          {backup.setlists.length > 0 && (
            <details>
              <summary>Show setlists in this file</summary>
              <ul>
                {backup.setlists.map((setlist) => (
                  <li key={setlist.id}>{setlist.name}</li>
                ))}
              </ul>
            </details>
          )}
          <label>
            Restore mode
            <select value={mode} onChange={(event) => setMode(event.target.value as "merge" | "replace")}>
              <option value="merge">Merge — keep existing library</option>
              <option value="replace">Replace — remove existing library</option>
            </select>
          </label>
          <p className="data-management__mode-help">
            {mode === "merge"
              ? "Keeps your current library. New records are added; identical records with the same ID are skipped. If an ID has different content, both versions are kept. Titles are not used to detect duplicates."
              : `Removes every current song and setlist on this device, then imports only the ${backup.songs.length} songs and ${backup.setlists.length} setlists in this file. Use this only with a complete backup.`}
          </p>
          <button
            type="button"
            disabled={busy}
            className={mode === "replace" ? "data-management__replace" : undefined}
            onClick={() => {
              if (
                mode === "replace" &&
                !confirm(
                  `Remove all current songs and setlists from this device and replace them with ${backup.songs.length} songs and ${backup.setlists.length} setlists from this file?`,
                )
              )
                return;
              void run(async () => {
                await restoreLibrary(backup, mode);
                const [songs, setlists] = await Promise.all([getAllSongs(), getAllSetlists()]);
                setBackup(null);
                setBackupName("");
                setMessage(
                  `${mode === "merge" ? "Import complete" : "Library replaced"} on this device. You now have ${songs.length} songs and ${setlists.length} setlists. Connected sync starts automatically; check Sync for its status.`,
                );
              });
            }}
          >
            {mode === "merge" ? "Import" : "Replace library"}
          </button>
          <button
            type="button"
            className="data-management__cancel"
            disabled={busy}
            onClick={() => {
              setBackup(null);
              setBackupName("");
            }}
          >
            Cancel restore
          </button>
        </div>
      )}
      <label className="data-management__file">
        Import ChordPro songs
        <small>Adds songs from .cho, .chordpro, or text files. This does not import setlists or .json backups.</small>
        <input
          type="file"
          multiple
          accept=".cho,.chopro,.chordpro,.pro,.crd,.txt"
          disabled={busy}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length)
              void run(async () => {
                const inputs = await Promise.all(
                  files.map(async (file) => ({ name: file.name, content: await file.text() })),
                );
                const imported = await importChordPro(inputs);
                setResults(imported);
                setMessage(
                  `${imported.filter((result) => result.status === "imported").length} imported, ${imported.filter((result) => result.status === "duplicate").length} duplicates skipped, ${imported.filter((result) => result.status === "error").length} failed.`,
                );
              });
          }}
        />
        <small>
          Select multiple files. Only identical song text is skipped; songs with the same title can both be added.
        </small>
      </label>
      <button
        type="button"
        className="settings-page__option"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const songs = await getAllSongs();
            const affected = songs.filter(
              (song) =>
                cleanChordleContent(song.content) !== song.content ||
                (song.key && standardizeSourceKey(song.content, song.key) !== song.key) ||
                inferSongbookTags(song.content, song.copyright).some(
                  (tag) => !song.tags.some((existing) => existing.toLowerCase() === tag),
                ),
            ).length;
            if (affected === 0) {
              setMessage("No imported songs need cleanup on this device.");
              return;
            }
            if (
              !confirm(
                `Clean up ${affected} imported ${affected === 1 ? "song" : "songs"} on this device? This removes x_chordle metadata, converts German H chords to standard B, and adds tags from explicit FJ/GSB songbook references. Export a backup first if you want to keep the original files.`,
              )
            )
              return;
            const count = await cleanChordleSongs();
            setMessage(
              count
                ? `Cleaned ${count} imported ${count === 1 ? "song" : "songs"} on this device. Connected sync starts automatically; check Sync for its status.`
                : "No imported songs need cleanup on this device.",
            );
          })
        }
      >
        <div className="settings-page__option-text">
          <h3>Clean up imported songs</h3>
          <p>
            Remove old x_chordle metadata, convert German H chords to standard B, and add FJ/GSB tags from explicit
            songbook references. Export a backup first if you want to keep the original files.
          </p>
        </div>
      </button>
      {busy && <output>Working…</output>}
      {message && <output>{message}</output>}
      {error && (
        <p role="alert" className="data-management__error">
          {error}
        </p>
      )}
      {!!results.length && (
        <details>
          <summary>Import results ({results.length})</summary>
          <ul>
            {results.map((result, index) => (
              <li key={`${result.file}-${index}`}>
                <strong>{result.file}</strong>: {result.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
};
