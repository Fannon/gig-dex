import { useCallback, useEffect, useState } from "react";
import { getAllSetlists, getAllSongs, LIBRARY_CHANGED_EVENT } from "../db";
import { checkPwaUpdate, installPwa, repairPwaCache, usePwaState } from "../pwa/lifecycle";
import { PwaUpdateControls } from "./PwaUpdateControls";
import "./PwaStatus.scss";

export function PwaSettings() {
  const state = usePwaState();
  const [persistent, setPersistent] = useState<boolean | undefined>();
  const [storage, setStorage] = useState<StorageEstimate>();
  const [library, setLibrary] = useState("Checking local library…");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [action, setAction] = useState<"storage" | "install" | "status" | "repair">("status");
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    let success = true;
    try {
      const [songs, lists] = await Promise.all([getAllSongs(), getAllSetlists()]);
      const ids = new Set(songs.map((song) => song.id));
      const missing = lists.reduce((count, list) => count + list.songIds.filter((id) => !ids.has(id)).length, 0);
      setLibrary(
        `${songs.length} song${songs.length === 1 ? "" : "s"} · ${lists.length} setlist${lists.length === 1 ? "" : "s"} stored on this device${missing ? ` · ${missing} missing song references` : ""}`,
      );
    } catch {
      setLibrary("Local library could not be read. Export a backup if possible before repairing.");
      success = false;
    }
    try {
      setPersistent(await navigator.storage?.persisted?.());
      setStorage(await navigator.storage?.estimate?.());
      setBackup(localStorage.getItem("last_backup_export"));
    } catch {
      setError("Storage information is unavailable in this browser.");
      success = false;
    }
    return success;
  }, []);
  useEffect(() => {
    void refresh();
    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), 100);
    };
    window.addEventListener("focus", update);
    window.addEventListener("gigdex-backup-export", update);
    window.addEventListener(LIBRARY_CHANGED_EVENT, update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("gigdex-backup-export", update);
      window.removeEventListener(LIBRARY_CHANGED_EVENT, update);
      window.clearTimeout(timer);
    };
  }, [refresh]);
  const run = async (area: typeof action, operation: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    setError("");
    setAction(area);
    try {
      await operation();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Action failed. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const formatBytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  const feedback = (area: typeof action) =>
    action === area && (
      <div className="settings-page__feedback">
        {busy && <output>Working…</output>}
        {message && <output>{message}</output>}
        {error && <p role="alert">{error}</p>}
      </div>
    );
  const repairHint = !state.online
    ? "Go online before repairing app files."
    : state.blocked
      ? "Save your edits and finish any sync or performance before repairing app files."
      : !state.ready
        ? "Open Gig-Dex online to finish downloading the offline app before repairing."
        : "";
  return (
    <section className="settings-page__section pwa-settings" aria-label="Offline app">
      <h2>Offline</h2>
      <p className="pwa-settings__summary">
        {state.ready ? "Gig-Dex is ready to open offline." : "Your library is stored on this device."} {library}
      </p>
      <section className="settings-page__card" aria-labelledby="offline-storage-heading">
        <h3 id="offline-storage-heading">Keep your library on this device</h3>
        <p>
          {persistent === true
            ? "Storage protection is on. Your browser will try to keep this library during automatic cleanup."
            : "Ask your browser to keep this library during automatic storage cleanup. Keep an exported backup too."}
        </p>
        {persistent === false && typeof navigator.storage?.persist === "function" && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run("storage", async () => {
                const granted = await navigator.storage.persist();
                setPersistent(granted);
                setMessage(
                  granted
                    ? "Your browser will try to keep this library during automatic cleanup."
                    : "The browser did not grant persistent storage. Keep regular backups; you can try again after installing the app.",
                );
              })
            }
          >
            Protect local storage
          </button>
        )}
        {(persistent === undefined || (persistent === false && typeof navigator.storage?.persist !== "function")) && (
          <p className="settings-page__hint">Storage protection is unavailable in this browser.</p>
        )}
        {feedback("storage")}
      </section>
      <section className="settings-page__card" aria-labelledby="offline-install-heading">
        <h3 id="offline-install-heading">Install Gig-Dex</h3>
        <p>
          Open Gig-Dex from your home screen or desktop. If no install button appears, use your browser’s Install app or
          Add to home screen option.
        </p>
        {state.installable && (
          <button
            type="button"
            className="settings-page__button--primary"
            disabled={busy}
            onClick={() => void run("install", installPwa)}
          >
            Install Gig-Dex
          </button>
        )}
        {feedback("install")}
        <details>
          <summary>Install on an Android tablet</summary>
          <p>
            Open the production HTTPS app in Chrome, then choose ⋮ → Add to home screen → Install. The wording may vary.
            Open the installed app and import or sync your library, then test reopening it in airplane mode before a
            gig.
          </p>
          <p>
            In performance mode, enable Keep screen awake to prevent the display from sleeping. The app reports whether
            the browser granted it.
          </p>
        </details>
      </section>
      <section className="settings-page__card" aria-labelledby="offline-updates-heading">
        <h3 id="offline-updates-heading">App updates</h3>
        <p>
          Updates download while you are online. Restart when ready to use the new version; saved songs and setlists
          stay on this device.
        </p>
        <div className="pwa-settings__actions">
          {state.ready && (
            <button
              type="button"
              disabled={busy || !state.online}
              onClick={() =>
                void run("status", async () => {
                  if (await checkPwaUpdate())
                    setMessage("Update check finished. Any available update appears below or in the navbar.");
                })
              }
            >
              Check for updates
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run("status", async () => {
                if (await refresh()) setMessage("Offline status refreshed.");
              })
            }
          >
            Refresh offline status
          </button>
        </div>
        {!state.online && <p className="settings-page__hint">Go online to check for app updates.</p>}
        {state.update && <PwaUpdateControls state={state} disabled={busy} />}
        {state.error && <p role="alert">{state.error}</p>}
        {feedback("status")}
      </section>
      <details className="pwa-settings__diagnostics">
        <summary>Technical details</summary>
        <dl>
          <dt>App download</dt>
          <dd>
            {state.ready
              ? "Ready to open offline"
              : import.meta.env.DEV
                ? "Development server — offline installation requires the production app"
                : "Preparing offline app…"}
          </dd>
          <dt>Connection</dt>
          <dd>
            {state.online
              ? "Device reports online · cloud availability depends on the host"
              : "Offline · cloud sync needs a connection"}
          </dd>
          <dt>Local library</dt>
          <dd>{library}</dd>
          <dt>Storage protection</dt>
          <dd>
            {persistent === true
              ? "Persistent storage granted"
              : persistent === false
                ? "Standard browser storage"
                : "Unavailable in this browser"}
          </dd>
          {storage?.usage !== undefined && (
            <>
              <dt>Storage used</dt>
              <dd>
                {formatBytes(storage.usage)}
                {storage.quota ? ` of ${formatBytes(storage.quota)} estimated quota` : ""}
              </dd>
            </>
          )}
          <dt>Last backup export</dt>
          <dd>{backup ? new Date(backup).toLocaleString() : "No backup exported on this device yet"}</dd>
        </dl>
        <p>
          Your local library is available without cloud sync. Missing songs must be imported or synced before a gig. See
          Sync for connection status and recent activity.
        </p>
        <p>
          Keep an exported backup outside the app. Clearing site/app data removes local songs even when persistent
          storage is granted.
        </p>
      </details>
      <details className="settings-page__card">
        <summary>Repair app files</summary>
        <p>
          Re-download app files if loading is broken. Songs, setlists, preferences, and cloud files are preserved. A
          working connection is required; close other Gig-Dex tabs first.
        </p>
        <button
          type="button"
          disabled={busy || state.blocked || !state.online || !state.ready}
          onClick={() => {
            if (
              window.confirm(
                "Repair downloaded app files and restart? Your local library will be preserved. Close other Gig-Dex tabs first.",
              )
            )
              void run("repair", repairPwaCache);
          }}
        >
          Repair app files
        </button>
        {repairHint && <p className="settings-page__hint">{repairHint}</p>}
        {feedback("repair")}
      </details>
    </section>
  );
}
