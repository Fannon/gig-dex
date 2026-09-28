import { useCallback, useEffect, useState } from "react";
import { syncHosts } from "../sync";
import { CLIENT_CONFIG_EVENT } from "../sync/clientConfig";
import { SyncManager } from "../sync/syncManager";
import type { SyncStatus } from "../sync/types";
import { RevisionCleanup } from "./RevisionCleanup";
import { SyncClientSettings } from "./SyncClientSettings";

const Host = ({ host, onStatus }: { host: (typeof syncHosts)[number]; onStatus: (status: SyncStatus) => void }) => {
  const { provider, manager } = host;
  const [status, setStatus] = useState(manager.getStatus());
  const [connected, setConnected] = useState(provider.isAuthenticated?.() ?? false);
  const [ready, setReady] = useState(!provider.ready);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = useCallback(() => {
    const value = manager.getStatus();
    setStatus(value);
    onStatus(value);
    setConnected(provider.isAuthenticated?.() ?? false);
  }, [provider, manager, onStatus]);
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      await provider.ready;
      await provider.refreshConnection?.();
      if (mounted) {
        setReady(true);
        update();
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener(CLIENT_CONFIG_EVENT, update);
    return () => {
      mounted = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener(CLIENT_CONFIG_EVENT, update);
    };
  }, [provider, update]);
  const sync = async () => {
    setBusy(true);
    setError("");
    try {
      const pending = manager.sync();
      update();
      await pending;
      update();
    } finally {
      setBusy(false);
    }
  };
  const reset = () => {
    localStorage.removeItem(`last_sync:${provider.name}`);
    manager.resetStatus();
  };
  const logout = async () => {
    setBusy(true);
    setError("");
    try {
      await SyncManager.exclusive(() => provider.logout());
      reset();
      update();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not disconnect.");
    } finally {
      setBusy(false);
    }
  };
  const changeFolder = async () => {
    setBusy(true);
    setError("");
    try {
      const scope = provider.getScope?.();
      const chosen = await SyncManager.exclusive(() => provider.pickFolder?.() ?? Promise.resolve(false));
      if (!chosen) return;
      if (scope !== provider.getScope?.()) reset();
      await manager.sync();
      update();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not change folders.");
    } finally {
      setBusy(false);
    }
  };
  const folder = provider.getFolderName?.();
  const description = provider.pickFolder
    ? "Sync via your Drive/OneDrive/Dropbox desktop folder. Works offline."
    : "Sync songs, sets and deletions across devices";
  return (
    <section className="settings-page__sync-box" aria-label={`${provider.name} sync`}>
      {!provider.isEnabled() ? (
        <div className="settings-page__option settings-page__option--disabled">
          <div className="settings-page__option-text">
            <h3>{provider.name} Sync</h3>
            <p>
              {provider.pickFolder
                ? "Local folder sync needs Chrome/Edge on desktop. Use a cloud host or backup files on mobile."
                : "Not configured. Add your Client ID below to enable sync."}
            </p>
          </div>
        </div>
      ) : !connected && !folder ? (
        <button type="button" className="settings-page__option" onClick={() => void sync()} disabled={busy || !ready}>
          <div className="settings-page__option-text">
            <h3>{provider.pickFolder ? "Connect local folder" : `Connect ${provider.name}`}</h3>
            <p>{description}</p>
          </div>
        </button>
      ) : (
        <div className="settings-page__option">
          <div className="settings-page__option-text">
            <h3>
              {provider.name} {connected ? "Connected" : "— permission required"}
              {folder ? ` — ${folder}` : ""}
            </h3>
            <p>
              {status.lastSyncTime ? `Last synced: ${new Date(status.lastSyncTime).toLocaleString()}` : "Never synced"}
            </p>
            {provider.pickFolder && <p>{description} Disconnecting keeps all folder files.</p>}
          </div>
          <div className="settings-page__option-actions">
            <button
              type="button"
              className="settings-page__sync-btn"
              disabled={busy || !ready}
              onClick={() => void sync()}
            >
              {busy ? "Syncing…" : "Sync Now"}
            </button>
            {provider.pickFolder && (
              <button
                type="button"
                className="settings-page__sync-btn"
                disabled={busy || !ready}
                onClick={() => void changeFolder()}
              >
                Change folder
              </button>
            )}
            <button
              type="button"
              className="settings-page__logout-btn"
              disabled={busy || !ready}
              onClick={() => void logout()}
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
      {provider.getFolderWarning?.() && <output>{provider.getFolderWarning()}</output>}
      {connected && <RevisionCleanup provider={provider} disabled={busy} />}
      {(error || status.error) && (
        <p className="settings-page__sync-error" role="alert">
          {error || status.error}
        </p>
      )}
    </section>
  );
};
export const CloudSync = ({ onStatus }: { onStatus: (status: SyncStatus) => void }) => (
  <section className="settings-page__section">
    <h2>Cloud Sync</h2>
    <div className="settings-page__options">
      {syncHosts.map((host) => (
        <Host key={host.provider.name} host={host} onStatus={onStatus} />
      ))}
    </div>
    <SyncClientSettings />
  </section>
);
