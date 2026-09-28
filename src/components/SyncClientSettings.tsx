import { useEffect, useState } from "react";
import { refreshSyncClientConfig } from "../sync";
import { clientConfigKeys, effectiveClientConfig, readClientSettings, saveClientSettings } from "../sync/clientConfig";
import { SyncManager } from "../sync/syncManager";

export function SyncClientSettings() {
  const [settings, setSettings] = useState(readClientSettings);
  const [saved, setSaved] = useState(readClientSettings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    refreshSyncClientConfig();
    const changed = (event: StorageEvent) => {
      if (event.key && !Object.values(clientConfigKeys).includes(event.key)) return;
      refreshSyncClientConfig();
      const value = readClientSettings();
      setSettings(value);
      setSaved(value);
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  const save = async (clear = false) => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await SyncManager.exclusive(async () => {
        saveClientSettings(clear ? { google: "", microsoft: "", tenant: "", dropbox: "" } : settings);
        refreshSyncClientConfig();
      });
      const value = readClientSettings();
      setSettings(value);
      setSaved(value);
      setMessage(clear ? "Saved overrides cleared." : "Client settings saved. Changed hosts need reconnecting.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save client settings.");
    } finally {
      setBusy(false);
    }
  };
  const effective = effectiveClientConfig();
  const source = (key: "google" | "microsoft" | "dropbox") =>
    saved[key] ? "Settings value" : effective[key] ? "Build-time configuration" : "Not configured";
  return (
    <details className="settings-page__client-settings">
      <summary>Advanced setup: cloud Client IDs</summary>
      <p>
        Add public OAuth Client IDs or a Dropbox app key from your own cloud app registrations. Register this app’s
        redirect URLs first. These settings stay on this browser and apply without a rebuild.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label htmlFor="sync-google-client-id">Google Client ID</label>
        <input
          id="sync-google-client-id"
          value={settings.google}
          placeholder="…apps.googleusercontent.com"
          autoComplete="off"
          disabled={busy}
          onChange={(event) => setSettings({ ...settings, google: event.target.value })}
        />
        <small>Google: {source("google")}</small>
        <label htmlFor="sync-microsoft-client-id">Microsoft Client ID</label>
        <input
          id="sync-microsoft-client-id"
          value={settings.microsoft}
          placeholder="Application (client) ID"
          autoComplete="off"
          disabled={busy}
          onChange={(event) => setSettings({ ...settings, microsoft: event.target.value })}
        />
        <small>Microsoft: {source("microsoft")}</small>
        <label htmlFor="sync-microsoft-tenant">Microsoft tenant</label>
        <input
          id="sync-microsoft-tenant"
          value={settings.tenant}
          placeholder="common"
          autoComplete="off"
          disabled={busy}
          onChange={(event) => setSettings({ ...settings, tenant: event.target.value })}
        />
        <small>Use common for personal and work accounts unless your registration needs a specific tenant.</small>
        <label htmlFor="sync-dropbox-app-key">Dropbox app key</label>
        <input
          id="sync-dropbox-app-key"
          value={settings.dropbox}
          placeholder="App key"
          autoComplete="off"
          disabled={busy}
          onChange={(event) => setSettings({ ...settings, dropbox: event.target.value })}
        />
        <small>Dropbox: {source("dropbox")}</small>
        <div className="settings-page__option-actions">
          <button type="submit" disabled={busy}>
            Save Client IDs
          </button>
          <button type="button" disabled={busy} onClick={() => void save(true)}>
            Clear overrides
          </button>
        </div>
      </form>
      {message && <output>{message}</output>}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
