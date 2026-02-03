import { GoogleDriveProvider } from "./gDriveProvider";
import { SyncManager } from "./syncManager";

const gDriveProvider = new GoogleDriveProvider();
export const syncManager = new SyncManager(gDriveProvider);
export { gDriveProvider };

export const isGDriveEnabled = () => gDriveProvider.isEnabled();
export const isGDriveAuthenticated = () => gDriveProvider.isAuthenticated();
