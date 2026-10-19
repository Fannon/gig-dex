export interface SyncMetadata {
  id: string;
  lastModified: string;
  title: string;
  type: "song" | "setlist";
  revision?: string;
  parents?: string[];
  formatVersion?: number;
  gdriveId?: string; // Internal Google Drive file ID, used for downloading
  remoteId?: string;
  etag?: string;
  uploadedAt?: string;
  version?: string;
}

/** Optional local bytes, tied to a provider's immutable revision/ETag. Never synced or backed up. */
export interface RevisionCacheEntry extends SyncMetadata {
  content?: string;
}

export interface SyncProvider {
  name: string;
  ready?: Promise<void>;
  refreshConnection?(): Promise<void>;
  getFolderName?(): string;
  getFolderWarning?(): string;
  pickFolder?(): Promise<boolean>;
  getScope?(): string;
  isAuthenticated?(): boolean;
  isEnabled(): boolean;
  authenticate(): Promise<boolean>;
  logout(): Promise<void>;

  // List all files in the sync folder
  listFiles(): Promise<SyncMetadata[]>;

  // Download a specific file
  downloadFile(id: string): Promise<string>;
  // Read the version from the latest listing; providers may reuse matching verified bytes.
  // downloadFile remains a fresh read for cleanup and ambiguous-upload verification.
  downloadSnapshot?(metadata: SyncMetadata): Promise<string>;

  // Upload a file
  uploadFile(metadata: SyncMetadata, content: string): Promise<void>;

  // Delete a file (optional for now)
  deleteFile(id: string): Promise<void>;
  listRevisions?(): Promise<SyncMetadata[]>;
  archiveRevision?(metadata: SyncMetadata): Promise<void>;
}

export interface SyncStatus {
  lastSyncTime: string | null;
  isSyncing: boolean;
  error: string | null;
  conflictCount?: number;
}
