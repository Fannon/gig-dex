import { GoogleDriveProvider } from "./gDriveProvider";
import { OneDriveProvider } from "./oneDriveProvider";
import { SyncManager } from "./syncManager";

const gDriveProvider = new GoogleDriveProvider();
export const syncManager = new SyncManager(gDriveProvider);
export { gDriveProvider };

export const isGDriveEnabled = () => gDriveProvider.isEnabled();
export const isGDriveAuthenticated = () => gDriveProvider.isAuthenticated();

export const oneDriveProvider = new OneDriveProvider();
export const oneDriveSyncManager = new SyncManager(oneDriveProvider);
export const syncHosts = [
	{ provider: gDriveProvider, manager: syncManager },
	{ provider: oneDriveProvider, manager: oneDriveSyncManager },
];
