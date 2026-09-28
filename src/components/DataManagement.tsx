import { useState } from "react";
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

export const DataManagement = () => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [backup, setBackup] = useState<LibraryBackup | null>(null);
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
      window.dispatchEvent(new Event("gigdex-library-change"));
    }
  };
  return (
    <section className="settings-page__section data-management">
      <h2>Library</h2>
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
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            setBackup(null);
            if (file)
              void run(async () => {
                setBackup(parseBackup(await file.text()));
                setMode("merge");
              });
          }}
        />
      </label>
      {backup && (
        <div className="data-management__restore">
          <p>
            Ready to restore <strong>{backup.songs.length} songs</strong> and{" "}
            <strong>{backup.setlists.length} setlists</strong>.
          </p>
          <label>
            Restore mode
            <select value={mode} onChange={(event) => setMode(event.target.value as "merge" | "replace")}>
              <option value="merge">Add alongside existing library</option>
              <option value="replace">Replace existing library</option>
            </select>
          </label>
          <p>
            {mode === "merge"
              ? "Identical records are skipped. Different versions are kept as separate copies with their setlist references."
              : "This replaces all current songs and setlists. Export your current library first if you want to keep it."}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                mode === "replace" &&
                !confirm(
                  `Replace your library with ${backup.songs.length} songs and ${backup.setlists.length} setlists from this backup?`,
                )
              )
                return;
              void run(async () => {
                await restoreLibrary(backup, mode);
                setBackup(null);
                setMessage("Backup restored successfully.");
              });
            }}
          >
            Restore library
          </button>
          <button type="button" disabled={busy} onClick={() => setBackup(null)}>
            Cancel restore
          </button>
        </div>
      )}
      <label className="data-management__file">
        Import ChordPro songs
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
        <small>Select multiple files. Matching source text is skipped; different versions are kept.</small>
      </label>
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
