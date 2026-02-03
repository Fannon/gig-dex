export interface SyncMetadata {
	id: string;
	lastModified: string;
	title: string;
	type: "song" | "setlist";
	gdriveId?: string; // Internal Google Drive file ID, used for downloading
}

export interface SyncProvider {
	name: string;
	isEnabled(): boolean;
	authenticate(): Promise<boolean>;
	logout(): Promise<void>;

	// List all files in the sync folder
	listFiles(): Promise<SyncMetadata[]>;

	// Download a specific file
	downloadFile(id: string): Promise<string>;

	// Upload a file
	uploadFile(metadata: SyncMetadata, content: string): Promise<void>;

	// Delete a file (optional for now)
	deleteFile(id: string): Promise<void>;
}

export interface SyncStatus {
	lastSyncTime: string | null;
	isSyncing: boolean;
	error: string | null;
}
