import { initDB } from "../db";
import { syncHeads } from "./revisionHistory";
import type { SyncMetadata, SyncProvider } from "./types";

const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = "https://graph.microsoft.com/Files.ReadWrite.AppFolder offline_access";
const TOKEN_KEY = "onedrive_tokens";
type Tokens = { access_token: string; refresh_token?: string; expiresAt: number };
type Item = {
	id: string;
	name: string;
	eTag?: string;
	createdDateTime?: string;
	file?: unknown;
	"@microsoft.graph.downloadUrl"?: string;
};

export function base64url(bytes: Uint8Array) {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}
export async function pkceChallenge(verifier: string) {
	return base64url(
		new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
	);
}

export class OneDriveProvider implements SyncProvider {
	name = "OneDrive";
	private tokens: Tokens | null = null;
	private folderId: string | null = null;
	private config: { clientId: string; tenant: string };
	constructor(
		config = {
			clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID || "",
			tenant: import.meta.env.VITE_MICROSOFT_TENANT || "common",
		},
	) {
		this.config = config;
		try {
			const value = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? "null");
			if (typeof value?.access_token === "string" && Number.isFinite(value.expiresAt))
				this.tokens = value;
		} catch {
			/* Ignore invalid credentials. */
		}
	}
	isEnabled() {
		return !!this.config.clientId;
	}
	isAuthenticated() {
		return !!this.tokens;
	}
	getScope() {
		if (!this.folderId) throw new Error("OneDrive folder is unavailable.");
		return `onedrive:${this.folderId}`;
	}
	private endpoint(path: string) {
		return `https://login.microsoftonline.com/${encodeURIComponent(this.config.tenant)}/oauth2/v2.0/${path}`;
	}
	private async token(parameters: Record<string, string>) {
		const response = await fetch(this.endpoint("token"), {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ client_id: this.config.clientId, scope: SCOPES, ...parameters }),
		});
		const result = await response.json();
		if (
			!response.ok ||
			typeof result.access_token !== "string" ||
			!Number.isFinite(Number(result.expires_in))
		)
			throw new Error("Microsoft sign-in expired or failed. Connect OneDrive again.");
		this.tokens = {
			access_token: result.access_token,
			refresh_token: result.refresh_token ?? this.tokens?.refresh_token,
			expiresAt: Date.now() + Number(result.expires_in) * 1000,
		};
		sessionStorage.setItem(TOKEN_KEY, JSON.stringify(this.tokens));
	}
	private async refresh() {
		if (!this.tokens?.refresh_token) throw new Error("Connect OneDrive again to continue.");
		try {
			await this.token({ grant_type: "refresh_token", refresh_token: this.tokens.refresh_token });
		} catch (error) {
			await this.logout();
			throw error;
		}
	}
	async authenticate() {
		if (!this.isEnabled()) throw new Error("A Microsoft Client ID is required to enable OneDrive.");
		if (this.tokens) {
			if (this.tokens.expiresAt <= Date.now() + 60000) await this.refresh();
			await this.folder();
			return true;
		}
		// Open synchronously before hashing so popup blockers retain the user gesture.
		const popup = window.open("about:blank", "Gig-Dex OneDrive", "popup=true,width=520,height=650");
		if (!popup) throw new Error("Allow the sign-in popup to connect OneDrive.");
		const redirect = new URL(
			`${import.meta.env.BASE_URL}onedrive-callback.html`,
			window.location.origin,
		).href;
		const state = crypto.randomUUID();
		const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
		try {
			const challenge = await pkceChallenge(verifier);
			const url = new URL(this.endpoint("authorize"));
			url.search = new URLSearchParams({
				client_id: this.config.clientId,
				response_type: "code",
				response_mode: "query",
				redirect_uri: redirect,
				scope: SCOPES,
				state,
				code_challenge: challenge,
				code_challenge_method: "S256",
				prompt: "select_account",
			}).toString();
			popup.location.href = url.href;
			const code = await new Promise<string>((resolve, reject) => {
				const began = Date.now();
				const timer = window.setInterval(() => {
					if (popup.closed || Date.now() - began > 180000) {
						clearInterval(timer);
						reject(new Error("Microsoft sign-in was cancelled or timed out."));
						return;
					}
					let returned: URL;
					try {
						returned = new URL(popup.location.href);
					} catch {
						return;
					}
					if (
						returned.origin !== window.location.origin ||
						returned.pathname !== new URL(redirect).pathname
					)
						return;
					clearInterval(timer);
					if (returned.searchParams.get("state") !== state) {
						reject(new Error("Microsoft sign-in state did not match."));
						return;
					}
					const value = returned.searchParams.get("code");
					if (!value || returned.searchParams.has("error"))
						reject(new Error("Microsoft sign-in was not completed."));
					else resolve(value);
				}, 150);
			});
			await this.token({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirect,
				code_verifier: verifier,
			});
			await this.folder();
			return true;
		} finally {
			if (!popup.closed) popup.close();
		}
	}
	async logout() {
		this.tokens = null;
		this.folderId = null;
		sessionStorage.removeItem(TOKEN_KEY);
	}
	private async request(url: string, init: RequestInit = {}, retried = false): Promise<Response> {
		// Never send a bearer token to arbitrary paging or download destinations.
		if (new URL(url).origin !== new URL(GRAPH).origin || !url.startsWith(`${GRAPH}/`))
			throw new Error("Invalid OneDrive API URL.");
		if (!this.tokens) throw new Error("Connect OneDrive first.");
		const headers = new Headers(init.headers);
		headers.set("Authorization", `Bearer ${this.tokens.access_token}`);
		const response = await fetch(url, { ...init, headers });
		if (response.status === 401 && !retried && this.tokens.refresh_token) {
			await this.refresh();
			return this.request(url, init, true);
		}
		if (response.status === 401) {
			await this.logout();
			throw new Error("OneDrive sign-in expired. Connect again.");
		}
		if (!response.ok) {
			const result = await response.json().catch(() => ({}));
			throw new Error(result.error?.message ?? `OneDrive request failed (${response.status}).`);
		}
		return response;
	}
	private async folder(): Promise<string> {
		if (!this.folderId) {
			const response = await this.request(`${GRAPH}/me/drive/special/approot`);
			const folder = await response.json();
			if (typeof folder.id !== "string" || !folder.id)
				throw new Error("OneDrive did not return an app folder.");
			this.folderId = folder.id;
		}
		if (!this.folderId) throw new Error("OneDrive app folder is unavailable.");
		return this.folderId;
	}
	async listRevisions(): Promise<SyncMetadata[]> {
		const folder = await this.folder();
		let url: string | undefined =
			`${GRAPH}/me/drive/items/${encodeURIComponent(folder)}/children?$select=id,name,eTag,createdDateTime,file`;
		const items: Item[] = [];
		const visited = new Set<string>();
		while (url) {
			if (visited.has(url)) throw new Error("Invalid OneDrive pagination.");
			visited.add(url);
			const response = await this.request(url);
			const result = await response.json();
			items.push(...(result.value ?? []));
			url = result["@odata.nextLink"];
		}
		const records: SyncMetadata[] = [];
		const db = await initDB();
		const prefix = `${this.getScope()}::`;
		for (const item of items) {
			if (!item.file || !/^gigdex-(song|setlist)-[0-9a-f-]+\.json$/.test(item.name)) continue;
			const cacheKey = `${prefix}${item.id}`;
			const cached = await db.get("revisionCache", cacheKey);
			if (
				item.eTag &&
				cached?.etag === item.eTag &&
				cached.remoteId === item.id &&
				item.name === `gigdex-${cached.type}-${cached.revision}.json`
			) {
				records.push({ ...cached, uploadedAt: item.createdDateTime });
				continue;
			}
			const value = JSON.parse(await this.downloadFile(item.id));
			const type = item.name.startsWith("gigdex-song-") ? "song" : "setlist";
			if (
				typeof value.id !== "string" ||
				typeof value.lastModified !== "string" ||
				!Number.isFinite(Date.parse(value.lastModified)) ||
				typeof value._sync?.revision !== "string" ||
				!Array.isArray(value._sync.parents) ||
				!value._sync.parents.every((parent: unknown) => typeof parent === "string")
			)
				throw new Error("Invalid OneDrive revision.");
			if (item.name !== `gigdex-${type}-${value._sync.revision}.json`)
				throw new Error("OneDrive revision identity changed.");
			const metadata: SyncMetadata = {
				id: value.id,
				title: value.title ?? value.name ?? "Untitled",
				type,
				lastModified: value.lastModified,
				revision: value._sync.revision,
				parents: value._sync.parents,
				remoteId: item.id,
				etag: item.eTag,
				uploadedAt: item.createdDateTime,
			};
			records.push(metadata);
			if (item.eTag) await db.put("revisionCache", metadata, cacheKey).catch(() => undefined);
		}
		const present = new Set(items.map((item) => `${prefix}${item.id}`));
		for (const key of await db.getAllKeys(
			"revisionCache",
			IDBKeyRange.bound(prefix, `${prefix}\uffff`),
		))
			if (!present.has(key)) await db.delete("revisionCache", key);
		return records;
	}
	async listFiles() {
		return syncHeads(await this.listRevisions());
	}
	async downloadFile(id: string) {
		const response = await this.request(
			`${GRAPH}/me/drive/items/${encodeURIComponent(id)}?$select=id,@microsoft.graph.downloadUrl`,
		);
		const item: Item = await response.json();
		const url = item["@microsoft.graph.downloadUrl"];
		if (!url || new URL(url).protocol !== "https:")
			throw new Error("Invalid OneDrive download URL.");
		const data = await fetch(url); // Preauthenticated URL, deliberately no Authorization header.
		if (!data.ok) throw new Error("Could not download the OneDrive revision.");
		return data.text();
	}
	async uploadFile(metadata: SyncMetadata, content: string) {
		if (!metadata.revision || !/^[0-9a-f-]+$/.test(metadata.revision))
			throw new Error("Missing OneDrive revision identity.");
		const folder = await this.folder();
		const name = `gigdex-${metadata.type}-${metadata.revision}.json`;
		await this.request(
			`${GRAPH}/me/drive/items/${encodeURIComponent(folder)}:/${name}:/content?@microsoft.graph.conflictBehavior=fail`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json", "If-None-Match": "*" },
				body: content,
			},
		);
	}
	async deleteFile(_id: string): Promise<void> {
		throw new Error("Use reviewed revision cleanup to remove OneDrive history.");
	}
	async archiveRevision(metadata: SyncMetadata) {
		if (!metadata.remoteId || !metadata.etag)
			throw new Error("OneDrive revision cannot be safely removed.");
		await this.request(`${GRAPH}/me/drive/items/${encodeURIComponent(metadata.remoteId)}`, {
			method: "DELETE",
			headers: { "If-Match": metadata.etag },
		});
	}
}
