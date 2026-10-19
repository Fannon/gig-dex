import { useEffect, useState } from "react";
import { refreshSyncClientConfig } from "../sync";
import { clientConfigKeys, effectiveClientConfig, readClientSettings, saveClientSettings } from "../sync/clientConfig";
import { SyncManager } from "../sync/syncManager";

type CloudProvider = "Dropbox" | "Google Drive" | "OneDrive";

export function SyncClientSettings({
  provider,
  guide,
  open,
  onOpenChange,
  onConnect,
  connecting = false,
}: {
  provider: CloudProvider;
  guide: { href: string; label: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect?: () => void;
  connecting?: boolean;
}) {
  const [settings, setSettings] = useState(readClientSettings);
  const [saved, setSaved] = useState(readClientSettings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const redirectUrl = new URL(`${import.meta.env.BASE_URL}dropbox-callback.html`, window.location.origin).href;
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
      setMessage(
        clear
          ? `${provider} settings reset.`
          : provider === "Dropbox"
            ? "App key saved. Connect your Dropbox account below to start syncing."
            : `${provider} settings saved. Reconnect if prompted.`,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : `Could not save ${provider} settings.`);
    } finally {
      setBusy(false);
    }
  };
  const effective = effectiveClientConfig();
  const source = (key: "google" | "microsoft" | "dropbox") =>
    saved[key] ? "Saved in this browser" : effective[key] ? "Site default" : "Not configured";
  return (
    <details
      id={`sync-${provider.toLowerCase().replaceAll(" ", "-")}-settings`}
      className="settings-page__client-settings"
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
    >
      <summary>Configure {provider}</summary>
      {provider === "Dropbox" ? (
        <div className="settings-page__setup-step">
          <h4>1. Create your Dropbox app</h4>
          <p>
            This is a one-time setup. Open the{" "}
            <a
              className="settings-page__sync-guide"
              href="https://www.dropbox.com/developers/apps"
              target="_blank"
              rel="noopener noreferrer"
            >
              Dropbox App Console
            </a>{" "}
            and create an app with <strong>Scoped access</strong> and <strong>App folder</strong> access. Follow the{" "}
            <a className="settings-page__sync-guide" href={guide.href} target="_blank" rel="noopener noreferrer">
              {guide.label}
            </a>{" "}
            to enable the required permissions.
          </p>
          <label htmlFor="sync-dropbox-redirect">Add this redirect URL in your Dropbox app’s Settings</label>
          <div className="settings-page__copy-field">
            <input id="sync-dropbox-redirect" aria-label="Dropbox redirect URL" readOnly value={redirectUrl} />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(redirectUrl)
                  .then(() => setCopyMessage("Redirect URL copied."))
                  .catch(() => setCopyMessage("Select and copy the redirect URL above."));
                if (!navigator.clipboard) setCopyMessage("Select and copy the redirect URL above.");
              }}
            >
              Copy URL
            </button>
          </div>
          {copyMessage && <output>{copyMessage}</output>}
        </div>
      ) : (
        <p>
          Add the public Client ID from your cloud app registration. Register this site’s redirect URL first. This
          setting stays in this browser. See the{" "}
          <a className="settings-page__sync-guide" href={guide.href} target="_blank" rel="noopener noreferrer">
            {guide.label}
          </a>
          .
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {provider === "Dropbox" && (
          <>
            <h4>2. Save your app key</h4>
            <p>Copy the App key from your Dropbox app’s Settings. Use the public key, not the app secret.</p>
            <label htmlFor="sync-dropbox-app-key">Dropbox app key</label>
            <input
              id="sync-dropbox-app-key"
              value={settings.dropbox}
              placeholder="App key"
              autoComplete="off"
              disabled={busy || connecting}
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
              disabled={busy || connecting}
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
              disabled={busy || connecting}
              onChange={(event) => setSettings({ ...settings, microsoft: event.target.value })}
            />
            <small>Microsoft: {source("microsoft")}</small>
            <label htmlFor="sync-microsoft-tenant">Microsoft tenant</label>
            <input
              id="sync-microsoft-tenant"
              value={settings.tenant}
              placeholder="common"
              autoComplete="off"
              disabled={busy || connecting}
              onChange={(event) => setSettings({ ...settings, tenant: event.target.value })}
            />
            <small>Use common for personal and work accounts unless your registration needs a specific tenant.</small>
          </>
        )}
        <div className="settings-page__option-actions">
          <button type="submit" disabled={busy || connecting}>
            {provider === "Dropbox" ? "Save app key" : `Save ${provider} settings`}
          </button>
          <button type="button" disabled={busy || connecting} onClick={() => void save(true)}>
            Reset {provider} settings
          </button>
        </div>
      </form>
      <p className="settings-page__hint">
        Save applies these settings to this browser. Reset uses this site’s defaults.
      </p>
      {connecting && (
        <p className="settings-page__hint">Wait for the connection or sync to finish before changing settings.</p>
      )}
      {message && <output>{message}</output>}
      {error && <p role="alert">{error}</p>}
      {provider === "Dropbox" && onConnect && (
        <div className="settings-page__setup-step">
          <h4>3. Connect your account</h4>
          <p>Sign in to Dropbox and approve access to your app folder. Your songs stay available on this device.</p>
          <button
            type="button"
            className="settings-page__sync-btn"
            onClick={onConnect}
            disabled={busy || connecting || !effective.dropbox || settings.dropbox.trim() !== saved.dropbox}
          >
            {connecting ? "Connecting…" : "Connect Dropbox"}
          </button>
        </div>
      )}
    </details>
  );
}
