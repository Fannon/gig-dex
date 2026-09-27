import type { SyncMetadata, SyncProvider } from "./types";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const GOOGLE_DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

const SCOPES = "https://www.googleapis.com/auth/drive.file";

// Client ID is public and safe to embed - security comes from redirect URI restrictions
// For local dev, create a .env file with VITE_GOOGLE_CLIENT_ID=your_client_id
// For production, set it in your CI/CD environment variables
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

interface GDriveFile {
	id: string;
	name: string;
	modifiedTime: string;
	properties?: {
		internalId?: string;
		type?: string;
		lastModified?: string;
	};
}

export class GoogleDriveProvider implements SyncProvider {
	name = "Google Drive";
	private accessToken: string | null = null;
	private folderId: string | null = null;

	constructor() {
		this.accessToken = localStorage.getItem("gdrive_access_token");
	}

	isEnabled(): boolean {
		return !!CLIENT_ID;
	}

	isAuthenticated(): boolean {
		return !!this.accessToken;
	}

	async authenticate(): Promise<boolean> {
		if (this.accessToken) {
			// Verify token is still valid
			try {
				await this.fetchWithAuth(`${GOOGLE_DRIVE_API_BASE}/about?fields=user`);
				return true;
			} catch {
				// Token expired, clear it
				this.accessToken = null;
				localStorage.removeItem("gdrive_access_token");
			}
		}

		// Open popup for OAuth
		return new Promise((resolve) => {
			const width = 500;
			const height = 600;
			const left = window.screenX + (window.outerWidth - width) / 2;
			const top = window.screenY + (window.outerHeight - height) / 2;

			const redirectUri = window.location.origin + window.location.pathname;
			const url = `${GOOGLE_AUTH_ENDPOINT}?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
				redirectUri,
			)}&response_type=token&scope=${encodeURIComponent(SCOPES)}&include_granted_scopes=true`;

			const popup = window.open(
				url,
				"Google Sign In",
				`width=${width},height=${height},left=${left},top=${top},popup=true`,
			);

			if (!popup) {
				console.error("Popup blocked");
				resolve(false);
				return;
			}

			// Poll for the popup to redirect back with the token
			const pollTimer = setInterval(() => {
				try {
					if (popup.closed) {
						clearInterval(pollTimer);
						// Check if we got a token
						resolve(!!this.accessToken);
						return;
					}

					// Check if popup redirected to our origin
					if (popup.location.origin === window.location.origin) {
						const hash = popup.location.hash;
						if (hash.includes("access_token")) {
							const params = new URLSearchParams(hash.substring(1));
							const token = params.get("access_token");
							if (token) {
								this.accessToken = token;
								localStorage.setItem("gdrive_access_token", token);
							}
						}
						popup.close();
						clearInterval(pollTimer);
						resolve(!!this.accessToken);
					}
				} catch {
					// Cross-origin error is expected while on Google's domain
				}
			}, 200);

			// Timeout after 5 minutes
			setTimeout(
				() => {
					clearInterval(pollTimer);
					if (!popup.closed) popup.close();
					resolve(false);
				},
				5 * 60 * 1000,
			);
		});
	}

	async logout(): Promise<void> {
		this.accessToken = null;
		this.folderId = null;
		localStorage.removeItem("gdrive_access_token");
	}

	private async fetchWithAuth(url: string, options: RequestInit = {}) {
		if (!this.accessToken) throw new Error("Not authenticated");

		const response = await fetch(url, {
			...options,
			headers: {
				...options.headers,
				Authorization: `Bearer ${this.accessToken}`,
			},
		});

		if (response.status === 401) {
			this.logout();
			throw new Error("Authentication expired");
		}

		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(error.error?.message || "Google Drive API error");
		}

		return response;
	}

	private async getOrCreateSyncFolder(): Promise<string> {
		if (this.folderId) return this.folderId;

		const query = encodeURIComponent(
			"name = 'Gig-Dex' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
		);
		const response = await this.fetchWithAuth(`${GOOGLE_DRIVE_API_BASE}/files?q=${query}`);
		const data = await response.json();

		if (data.files && data.files.length > 0) {
			this.folderId = data.files[0].id;
		} else {
			const createResponse = await this.fetchWithAuth(`${GOOGLE_DRIVE_API_BASE}/files`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "Gig-Dex",
					mimeType: "application/vnd.google-apps.folder",
				}),
			});
			const folder = await createResponse.json();
			this.folderId = folder.id;
		}

		if (!this.folderId) throw new Error("Failed to create sync folder");
		return this.folderId;
	}

	async listFiles(): Promise<SyncMetadata[]> {
		const folderId = await this.getOrCreateSyncFolder();
		const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
		const files: GDriveFile[] = [];
		let pageToken: string | undefined;
		do {
			const response = await this.fetchWithAuth(
				`${GOOGLE_DRIVE_API_BASE}/files?q=${query}&fields=nextPageToken,files(id,name,modifiedTime,properties)${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
			);
			const data: { files?: GDriveFile[]; nextPageToken?: string } = await response.json();
			files.push(...(data.files || []));
			pageToken = data.nextPageToken;
		} while (pageToken);
		const result: SyncMetadata[] = [];
		for (const file of files) {
			if (!file.properties?.internalId || !["song", "setlist"].includes(file.properties.type || ""))
				continue;
			let lastModified = file.properties.lastModified;
			if (!lastModified) {
				// Older uploads only had Drive's upload time, which must not win
				// over a newer local edit. Read the actual record modification time.
				const record = JSON.parse(await this.downloadFile(file.id));
				lastModified = record.lastModified;
			}
			if (typeof lastModified !== "string" || !Number.isFinite(Date.parse(lastModified))) {
				throw new Error("Invalid remote modification time");
			}
			result.push({
				id: file.properties.internalId,
				lastModified,
				title: file.name,
				type: file.properties.type === "setlist" ? "setlist" : "song",
				gdriveId: file.id,
			});
		}
		return result;
	}

	async downloadFile(gdriveId: string): Promise<string> {
		const response = await this.fetchWithAuth(
			`${GOOGLE_DRIVE_API_BASE}/files/${gdriveId}?alt=media`,
		);
		return response.text();
	}

	async uploadFile(metadata: SyncMetadata, content: string): Promise<void> {
		const folderId = await this.getOrCreateSyncFolder();

		// Check if file exists
		const query = encodeURIComponent(
			`'${folderId}' in parents and properties has { key='internalId' and value='${metadata.id}' } and trashed = false`,
		);
		const searchResponse = await this.fetchWithAuth(`${GOOGLE_DRIVE_API_BASE}/files?q=${query}`);
		const searchData = await searchResponse.json();
		const existingFile = searchData.files?.[0];

		// Sanitize filename: YYYY-MM-DD_HH-mm_Title
		const datePrefix = metadata.lastModified.substring(0, 16).replace(/[:T]/g, "-");
		const sanitizedTitle = metadata.title.replace(/[^a-z0-9]/gi, "_").substring(0, 50);
		const filename = `${datePrefix}_${sanitizedTitle}.json`;

		const fileMetadata = {
			name: filename,
			properties: {
				internalId: metadata.id,
				type: metadata.type,
				lastModified: metadata.lastModified,
			},
			parents: existingFile ? undefined : [folderId],
		};

		const boundary = "foo_bar_baz";
		const multipartBody =
			`--${boundary}\r\n` +
			`Content-Type: application/json; charset=UTF-8\r\n\r\n` +
			`${JSON.stringify(fileMetadata)}\r\n` +
			`--${boundary}\r\n` +
			`Content-Type: application/json\r\n\r\n` +
			`${content}\r\n` +
			`--${boundary}--`;

		const url = existingFile
			? `${GOOGLE_DRIVE_UPLOAD_BASE}/files/${existingFile.id}?uploadType=multipart`
			: `${GOOGLE_DRIVE_UPLOAD_BASE}/files?uploadType=multipart`;

		await this.fetchWithAuth(url, {
			method: existingFile ? "PATCH" : "POST",
			headers: {
				"Content-Type": `multipart/related; boundary=${boundary}`,
			},
			body: multipartBody,
		});
	}

	async deleteFile(id: string): Promise<void> {
		const folderId = await this.getOrCreateSyncFolder();
		const query = encodeURIComponent(
			`'${folderId}' in parents and properties has { key='internalId' and value='${id}' } and trashed = false`,
		);
		const searchResponse = await this.fetchWithAuth(`${GOOGLE_DRIVE_API_BASE}/files?q=${query}`);
		const searchData = await searchResponse.json();
		const file = searchData.files?.[0];

		if (file) {
			await this.fetchWithAuth(`${GOOGLE_DRIVE_API_BASE}/files/${file.id}`, {
				method: "DELETE",
			});
		}
	}
}
