import { useCallback, useEffect, useReducer, useState } from "react";
import { syncHosts } from "../sync";
import { CLIENT_CONFIG_EVENT } from "../sync/clientConfig";
import { SyncManager } from "../sync/syncManager";
import type { SyncStatus } from "../sync/types";
import { RevisionCleanup } from "./RevisionCleanup";
import { SyncActivityLog } from "./SyncActivityLog";
import { SyncClientSettings } from "./SyncClientSettings";

const guide = (name: string) =>
  name === "Dropbox"
    ? { label: "Dropbox setup guide", href: "https://github.com/Fannon/gig-dex/blob/main/docs/dropbox-sync.md" }
    : name === "Local Folder"
      ? { label: "Folder sync guide", href: "https://github.com/Fannon/gig-dex/blob/main/docs/local-folder-sync.md" }
      : {
          label: `${name} setup guide`,
          href: "https://github.com/Fannon/gig-dex/blob/main/docs/local-folder-sync.md#runtime-cloud-configuration",
        };

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
    window.addEventListener("gigdex-sync-status", update);
    return () => {
      mounted = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener(CLIENT_CONFIG_EVENT, update);
      window.removeEventListener("gigdex-sync-status", update);
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
  const providerGuide = guide(provider.name);
  const description = provider.pickFolder
    ? "Works with a cloud folder already on this computer, and can sync while offline."
    : "Keep songs and sets in sync across devices. Setup required.";
  return (
    <section className="settings-page__sync-box" aria-label={`${provider.name} sync`}>
      {!provider.isEnabled() ? (
        <div className="settings-page__option settings-page__option--disabled">
          <div className="settings-page__option-text">
            <h3>{provider.name} Sync</h3>
            <p>
              {provider.pickFolder
                ? "Folder sync is available in Chrome or Edge on a computer. Use a backup or direct cloud connection on mobile."
                : `Setup required: register your own cloud app, then add its ${provider.name === "Dropbox" ? "app key" : "Client ID"} under Configure ${provider.name}.`}
            </p>
          </div>
        </div>
      ) : !connected && !folder ? (
        <button
          type="button"
          className="settings-page__option"
          onClick={() => void sync()}
          disabled={busy || status.isSyncing || !ready}
        >
          <div className="settings-page__option-text">
            <h3>{provider.pickFolder ? "Sync from a folder on this computer" : `Connect ${provider.name}`}</h3>
            <p>{description}</p>
          </div>
        </button>
      ) : (
        <div className="settings-page__option">
          <div className="settings-page__option-text">
            <h3>
              {provider.name} {connected ? "Connected" : "— reconnect to continue"}
              {folder ? ` — ${folder}` : ""}
            </h3>
            <p>
              {status.lastSyncTime ? `Last synced ${new Date(status.lastSyncTime).toLocaleString()}` : "Not synced yet"}
            </p>
            {provider.pickFolder && <p>{description}</p>}
          </div>
          <div className="settings-page__option-actions">
            <button
              type="button"
              className="settings-page__sync-btn"
              disabled={busy || status.isSyncing || !ready}
              onClick={() => void sync()}
            >
              {busy || status.isSyncing ? "Syncing…" : "Sync now"}
            </button>
            {provider.pickFolder && (
              <button
                type="button"
                className="settings-page__sync-btn"
                disabled={busy || status.isSyncing || !ready}
                onClick={() => void changeFolder()}
              >
                Choose a different folder
              </button>
            )}
            <button
              type="button"
              className="settings-page__logout-btn"
              disabled={busy || status.isSyncing || !ready}
              onClick={() => void logout()}
            >
              Stop syncing
            </button>
          </div>
        </div>
      )}
      {provider.getFolderWarning?.() && <output>{provider.getFolderWarning()}</output>}
      {(error || status.error) && (
        <p className="settings-page__sync-error" role="alert">
          {error || status.error}
        </p>
      )}
      {connected && (
        <details className="settings-page__advanced">
          <summary>History cleanup</summary>
          <RevisionCleanup provider={provider} disabled={busy} />
        </details>
      )}
      {provider.name !== "Local Folder" && (
        <SyncClientSettings provider={provider.name as "Dropbox" | "Google Drive" | "OneDrive"} />
      )}
      <a className="settings-page__sync-guide" href={providerGuide.href} target="_blank" rel="noopener noreferrer">
        {providerGuide.label}
      </a>
      {(connected || !!folder) && (
        <details className="settings-page__advanced">
          <summary>Recent activity</summary>
          <SyncActivityLog provider={provider.name} />
        </details>
      )}
    </section>
  );
};
export const CloudSync = ({ onStatus }: { onStatus: (status: SyncStatus) => void }) => {
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    void Promise.all(syncHosts.map(({ provider }) => provider.ready)).then(redraw);
    window.addEventListener("gigdex-sync-status", redraw);
    window.addEventListener(CLIENT_CONFIG_EVENT, redraw);
    window.addEventListener("focus", redraw);
    return () => {
      window.removeEventListener("gigdex-sync-status", redraw);
      window.removeEventListener(CLIENT_CONFIG_EVENT, redraw);
      window.removeEventListener("focus", redraw);
    };
  }, []);
  const active = syncHosts.filter(({ provider }) => provider.isAuthenticated?.() || provider.getFolderName?.());
  const available = syncHosts.filter((host) => !active.includes(host));
  return (
    <>
      <section className="settings-page__section">
        <h2>Active syncs</h2>
        {active.length ? (
          <div className="settings-page__options">
            {active.map((host) => (
              <Host key={host.provider.name} host={host} onStatus={onStatus} />
            ))}
          </div>
        ) : (
          <p className="settings-page__hint">No sync provider is connected on this device.</p>
        )}
      </section>
      <section className="settings-page__section">
        <h2>Add sync provider</h2>
        <div className="settings-page__options">
          {available.map((host) => (
            <Host key={host.provider.name} host={host} onStatus={onStatus} />
          ))}
        </div>
      </section>
    </>
  );
};
