import { useState } from "react";
import { getAllSetlists, getAllSongs, notifyLibraryChanged } from "../db";
import { blockPwaUpdate } from "../pwa/lifecycle";
import {
  exportLibrary,
  type ImportResult,
  importChordPro,
  type LibraryBackup,
  parseBackup,
  restoreLibrary,
} from "../utils/libraryBackup";
import "./DataManagement.scss";

type LibraryOperation = "export" | "preview" | "restore" | "import";
const itemCount = (count: number, item: "song" | "setlist") => `${count} ${item}${count === 1 ? "" : "s"}`;

export const DataManagement = () => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [backup, setBackup] = useState<LibraryBackup | null>(null);
  const [backupName, setBackupName] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [results, setResults] = useState<ImportResult[]>([]);
  const [operation, setOperation] = useState<LibraryOperation>();
  const run = async (operation: LibraryOperation, action: () => Promise<void>) => {
    const releaseUpdate = blockPwaUpdate();
    setBusy(true);
    setError("");
    setMessage("");
    setOperation(operation);
    if (operation === "import") setResults([]);
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
  const feedback = (area: "export" | "restore" | "import") => {
    if ((operation === "preview" ? "restore" : operation) !== area) return null;
    return (
      <div className="settings-page__feedback">
        {busy && (
          <output>
            {operation === "export" ? "Preparing backup…" : operation === "preview" ? "Reading backup…" : "Importing…"}
          </output>
        )}
        {message && <output>{message}</output>}
        {error && <p role="alert">{error}</p>}
      </div>
    );
  };
  return (
    <section className="settings-page__section data-management">
      <h2>Library</h2>
      <p className="data-management__intro">
        Back up this device, restore a Gig-Dex backup, or add song files. Connected sync providers share completed
        imports automatically.
      </p>
      <section className="settings-page__card" aria-labelledby="library-export-heading">
        <h3 id="library-export-heading">Back up your library</h3>
        <p>Download all songs, setlists, tags, and metadata as one JSON file. Keep a copy outside the app.</p>
        <button
          type="button"
          className="settings-page__button--primary"
          disabled={busy}
          onClick={() =>
            void run("export", async () => {
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
              setMessage(
                `Backup downloaded: ${itemCount(data.songs.length, "song")} and ${itemCount(data.setlists.length, "setlist")}.`,
              );
            })
          }
        >
          Export library
        </button>
        {feedback("export")}
      </section>
      <section className="settings-page__card" aria-labelledby="library-restore-heading">
        <h3 id="library-restore-heading">Restore from a backup</h3>
        <p id="library-restore-help">
          Choose a Gig-Dex .json file to preview its songs and setlists. Selecting a file does not change your library.
        </p>
        <div className="data-management__file">
          <label htmlFor="library-backup-file">Restore backup</label>
          <input
            id="library-backup-file"
            type="file"
            accept=".json,application/json"
            aria-describedby="library-restore-help"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              setBackup(null);
              setBackupName("");
              if (file)
                void run("preview", async () => {
                  setBackup(parseBackup(await file.text()));
                  setBackupName(file.name);
                  setMode("merge");
                });
            }}
          />
        </div>
        <p className="settings-page__hint">A backup placed in your sync folder is ignored until you select it here.</p>
        {backup && (
          <div className="data-management__restore">
            <p className="data-management__source">Selected: {backupName}</p>
            <p>
              This file contains <strong>{itemCount(backup.songs.length, "song")}</strong> and{" "}
              <strong>{itemCount(backup.setlists.length, "setlist")}</strong>. Nothing has been imported yet.
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
                <option value="merge">Merge — keep current library</option>
                <option value="replace">Replace — remove current library</option>
              </select>
            </label>
            <p className="data-management__mode-help">
              {mode === "merge"
                ? "Keeps your current library and adds new items. Identical items are skipped; different versions are kept as copies. Matching titles alone are not treated as duplicates."
                : `Removes every current song and setlist on this device, then imports only the ${itemCount(backup.songs.length, "song")} and ${itemCount(backup.setlists.length, "setlist")} in this file. Use this only with a complete backup.`}
            </p>
            <div className="settings-page__option-actions">
              <button
                type="button"
                disabled={busy}
                className={mode === "replace" ? "settings-page__button--danger" : "settings-page__button--primary"}
                onClick={() => {
                  if (
                    mode === "replace" &&
                    !confirm(
                      `Remove all current songs and setlists from this device and replace them with ${itemCount(backup.songs.length, "song")} and ${itemCount(backup.setlists.length, "setlist")} from this file?`,
                    )
                  )
                    return;
                  void run("restore", async () => {
                    await restoreLibrary(backup, mode);
                    const [songs, setlists] = await Promise.all([getAllSongs(), getAllSetlists()]);
                    setBackup(null);
                    setBackupName("");
                    setMessage(
                      `${mode === "merge" ? "Import complete" : "Library replaced"} on this device. You now have ${itemCount(songs.length, "song")} and ${itemCount(setlists.length, "setlist")}. Connected sync starts automatically; check Sync for its status.`,
                    );
                  });
                }}
              >
                {mode === "merge" ? "Import backup" : "Replace library"}
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
          </div>
        )}
        {feedback("restore")}
      </section>
      <section className="settings-page__card" aria-labelledby="library-import-heading">
        <h3 id="library-import-heading">Add song files</h3>
        <p id="library-import-help">
          Select .cho, .chordpro, or text files. Songs are imported as soon as you select them; existing songs stay.
        </p>
        <div className="data-management__file">
          <label htmlFor="library-song-files">Import ChordPro songs</label>
          <input
            id="library-song-files"
            type="file"
            multiple
            accept=".cho,.chopro,.chordpro,.pro,.crd,.txt"
            aria-describedby="library-import-help"
            disabled={busy}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length)
                void run("import", async () => {
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
        </div>
        <p className="settings-page__hint">
          Select multiple files. Only identical song text is skipped; songs with the same title can both be added.
        </p>
        {feedback("import")}
        {!!results.length && (
          <details open>
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
    </section>
  );
};
