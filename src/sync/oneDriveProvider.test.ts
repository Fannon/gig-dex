/// <reference types="node" />
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initDB } from "../db";
import { OneDriveProvider, pkceChallenge } from "./oneDriveProvider";

const mocked = vi.fn<typeof fetch>();
const respond = (value: unknown, status = 200) =>
	mocked.mockResolvedValueOnce(new Response(JSON.stringify(value), { status }));
const revision = "a0000000-0000-0000-0000-000000000001";
const config = { clientId: "public-client-id", tenant: "common" };
beforeEach(async () => {
	await (await initDB()).clear("revisionCache");
	sessionStorage.clear();
	sessionStorage.setItem(
		"onedrive_tokens",
		JSON.stringify({ access_token: "test-token", expiresAt: Date.now() + 3600000 }),
	);
	mocked.mockReset();
	vi.stubGlobal("fetch", mocked);
	vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());
it("uses the RFC 7636 S256 challenge", async () => {
	expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
		"E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
	);
});
it("lists paged app-folder revisions and downloads without leaking credentials", async () => {
	respond({ id: "folder" });
	respond({
		value: [
			{
				id: "item",
				name: `gigdex-song-${revision}.json`,
				eTag: "etag",
				file: {},
				createdDateTime: "2026-01-01T00:00:00Z",
			},
		],
		"@odata.nextLink": "https://graph.microsoft.com/v1.0/next",
	});
	respond({ value: [{ id: "unrelated", name: "personal.json", file: {} }] });
	respond({ id: "item", "@microsoft.graph.downloadUrl": "https://download.example.test/content" });
	respond({
		id: "song",
		title: "Test",
		lastModified: "2026-01-01T00:00:00Z",
		_sync: { revision, parents: [] },
	});
	const provider = new OneDriveProvider(config);
	const files = await provider.listFiles();
	expect(files).toHaveLength(1);
	expect(files[0]).toMatchObject({ remoteId: "item", revision, etag: "etag" });
	expect(provider.getScope()).toBe("onedrive:folder");
	expect(mocked.mock.calls[4][1]).toBeUndefined();
	expect(new Headers(mocked.mock.calls[3][1]?.headers).get("Authorization")).toBe(
		"Bearer test-token",
	);
});
it("refuses token-bearing pagination outside Graph", async () => {
	respond({ id: "folder" });
	respond({ value: [], "@odata.nextLink": "https://attacker.example/steal" });
	await expect(new OneDriveProvider(config).listFiles()).rejects.toThrow(
		"Invalid OneDrive API URL",
	);
	expect(mocked).toHaveBeenCalledTimes(2);
});
it("appends uniquely named revisions and uses conditional recycle-bin deletion", async () => {
	respond({ id: "folder" });
	respond({ id: "uploaded" });
	respond({});
	const provider = new OneDriveProvider(config);
	const metadata = {
		id: "song",
		type: "song" as const,
		title: "Test",
		lastModified: "2026-01-01T00:00:00Z",
		revision,
		remoteId: "uploaded",
		etag: "original",
	};
	await provider.uploadFile(metadata, "{}");
	await provider.archiveRevision(metadata);
	expect(String(mocked.mock.calls[1][0])).toContain(`gigdex-song-${revision}.json:/content`);
	expect(new Headers(mocked.mock.calls[1][1]?.headers).get("If-None-Match")).toBe("*");
	expect(mocked.mock.calls[2][1]?.method).toBe("DELETE");
	expect(new Headers(mocked.mock.calls[2][1]?.headers).get("If-Match")).toBe("original");
});
it("refreshes an expired session token and rotates the refresh token", async () => {
	sessionStorage.setItem(
		"onedrive_tokens",
		JSON.stringify({ access_token: "expired", refresh_token: "refresh", expiresAt: 0 }),
	);
	respond({ access_token: "new", refresh_token: "rotated", expires_in: 3600 });
	respond({ id: "folder" });
	const provider = new OneDriveProvider(config);
	expect(await provider.authenticate()).toBe(true);
	expect(String(mocked.mock.calls[0][1]?.body)).toContain("grant_type=refresh_token");
	expect(JSON.parse(sessionStorage.getItem("onedrive_tokens") ?? "{}").refresh_token).toBe(
		"rotated",
	);
	await provider.logout();
	expect(sessionStorage.getItem("onedrive_tokens")).toBeNull();
});
it("does not delete a revision without a concurrency token", async () => {
	await expect(
		new OneDriveProvider(config).archiveRevision({
			id: "song",
			type: "song",
			title: "Test",
			lastModified: "2026-01-01T00:00:00Z",
			revision,
			remoteId: "id",
		}),
	).rejects.toThrow("safely removed");
	expect(mocked).not.toHaveBeenCalled();
});

it("reuses metadata for unchanged eTags and invalidates changed revisions", async () => {
	respond({ id: "folder" });
	respond({ value: [{ id: "item", name: `gigdex-song-${revision}.json`, eTag: "one", file: {} }] });
	respond({ id: "item", "@microsoft.graph.downloadUrl": "https://download.example.test/content" });
	respond({
		id: "song",
		title: "Test",
		lastModified: "2026-01-01T00:00:00Z",
		_sync: { revision, parents: [] },
	});
	const provider = new OneDriveProvider(config);
	await provider.listFiles();
	respond({ value: [{ id: "item", name: `gigdex-song-${revision}.json`, eTag: "one", file: {} }] });
	await provider.listFiles();
	expect(mocked).toHaveBeenCalledTimes(5);
	respond({ value: [{ id: "item", name: `gigdex-song-${revision}.json`, eTag: "two", file: {} }] });
	respond({ id: "item", "@microsoft.graph.downloadUrl": "https://download.example.test/content" });
	respond({
		id: "song",
		title: "Edited",
		lastModified: "2026-01-01T00:00:00Z",
		_sync: { revision, parents: [] },
	});
	expect((await provider.listFiles())[0].title).toBe("Edited");
	expect(mocked).toHaveBeenCalledTimes(8);
	respond({ value: [] });
	await provider.listFiles();
	expect(await (await initDB()).count("revisionCache")).toBe(0);
});
