import { CLIENT_CONFIG_EVENT, effectiveClientConfig } from "./clientConfig";
import { GoogleDriveProvider } from "./gDriveProvider";
import { LocalFolderProvider } from "./localFolderProvider";
import { OneDriveProvider } from "./oneDriveProvider";
import { SyncManager } from "./syncManager";

const gDriveProvider = new GoogleDriveProvider();
export const syncManager = new SyncManager(gDriveProvider);
export { gDriveProvider };

export const isGDriveEnabled = () => gDriveProvider.isEnabled();
export const isGDriveAuthenticated = () => gDriveProvider.isAuthenticated();

export const oneDriveProvider = new OneDriveProvider();
export const oneDriveSyncManager = new SyncManager(oneDriveProvider);
export const localFolderProvider = new LocalFolderProvider();
export const localFolderSyncManager = new SyncManager(localFolderProvider);
export const syncHosts: { provider: import("./types").SyncProvider; manager: SyncManager }[] = [
  { provider: localFolderProvider, manager: localFolderSyncManager },
  { provider: gDriveProvider, manager: syncManager },
  { provider: oneDriveProvider, manager: oneDriveSyncManager },
];

export function refreshSyncClientConfig() {
  const config = effectiveClientConfig();
  if (gDriveProvider.setClientId(config.google)) {
    syncManager.resetStatus();
    localStorage.removeItem(`last_sync:${gDriveProvider.name}`);
  }
  if (oneDriveProvider.setConfig({ clientId: config.microsoft, tenant: config.tenant })) {
    oneDriveSyncManager.resetStatus();
    localStorage.removeItem(`last_sync:${oneDriveProvider.name}`);
  }
  window.dispatchEvent(new Event(CLIENT_CONFIG_EVENT));
}
