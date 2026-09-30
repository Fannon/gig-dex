import { useEffect, useState } from "react";
import { refreshSyncClientConfig } from "../sync";
import { clientConfigKeys, effectiveClientConfig, readClientSettings, saveClientSettings } from "../sync/clientConfig";
import { SyncManager } from "../sync/syncManager";

type CloudProvider = "Dropbox" | "Google Drive" | "OneDrive";

export function SyncClientSettings({
  provider,
  guide,
}: {
  provider: CloudProvider;
  guide: { href: string; label: string };
}) {
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
        const current = readClientSettings();
        saveClientSettings({
          ...current,
          ...(provider === "Dropbox"
            ? { dropbox: clear ? "" : settings.dropbox }
            : provider === "Google Drive"
              ? { google: clear ? "" : settings.google }
              : { microsoft: clear ? "" : settings.microsoft, tenant: clear ? "" : settings.tenant }),
        });
        refreshSyncClientConfig();
      });
      const value = readClientSettings();
      setSettings(value);
      setSaved(value);
      setMessage(clear ? `${provider} override cleared.` : `${provider} settings saved. Reconnect if prompted.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : `Could not save ${provider} settings.`);
    } finally {
      setBusy(false);
    }
  };
  const effective = effectiveClientConfig();
  const source = (key: "google" | "microsoft" | "dropbox") =>
    saved[key] ? "Settings value" : effective[key] ? "Build-time configuration" : "Not configured";
  return (
    <details className="settings-page__client-settings">
      <summary>Configure {provider}</summary>
      <p>
        {provider === "Dropbox"
          ? "Add the public app key from your Dropbox app registration. Register this site’s redirect URL first."
          : "Add the public Client ID from your cloud app registration. Register this site’s redirect URL first."}{" "}
        This setting stays in this browser. See the{" "}
        <a className="settings-page__sync-guide" href={guide.href} target="_blank" rel="noopener noreferrer">
          {guide.label}
        </a>
        .
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {provider === "Dropbox" && (
          <>
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
          </>
        )}
        {provider === "Google Drive" && (
          <>
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
          </>
        )}
        {provider === "OneDrive" && (
          <>
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
          </>
        )}
        <div className="settings-page__option-actions">
          <button type="submit" disabled={busy}>
            Save {provider} settings
          </button>
          <button type="button" disabled={busy} onClick={() => void save(true)}>
            Clear {provider} override
          </button>
        </div>
      </form>
      {message && <output>{message}</output>}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
