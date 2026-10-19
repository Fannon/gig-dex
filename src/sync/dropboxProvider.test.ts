/// <reference types="node" />
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initDB } from "../db";
import { DropboxProvider } from "./dropboxProvider";

const mocked = vi.fn<typeof fetch>();
const revision = "a0000000-0000-0000-0000-000000000001";
const file = {
  ".tag": "file",
  id: "id:file",
  path_lower: `/gigdex-song-${revision}.json`,
  name: `gigdex-song-${revision}.json`,
  rev: "rev-one",
};
const record = { id: "song", title: "Test", lastModified: "2026-01-01T00:00:00Z", _sync: { revision, parents: [] } };
const respond = (value: unknown, headers?: HeadersInit, status = 200) =>
  mocked.mockResolvedValueOnce(new Response(JSON.stringify(value), { status, headers }));

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await (await initDB()).clear("revisionCache");
  sessionStorage.clear();
  sessionStorage.setItem(
    "dropbox_tokens",
    JSON.stringify({
      access_token: "test-token",
      expiresAt: Date.now() + 3600000,
      account_id: "dbid:user",
      appKey: "testappkey123",
    }),
  );
  mocked.mockReset();
  vi.stubGlobal("fetch", mocked);
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("lists paged app-folder files, validates content and reuses unchanged revision metadata", async () => {
  respond({ entries: [file], has_more: true, cursor: "next" });
  respond({ entries: [{ ".tag": "file", id: "unrelated", name: "notes.json" }], has_more: false });
  respond(record, { "Dropbox-API-Result": JSON.stringify({ rev: "rev-one" }) });
  const provider = new DropboxProvider("testappkey123");
  expect(await provider.listFiles()).toMatchObject([{ id: "song", remoteId: "id:file", etag: "rev-one" }]);
  expect(provider.getScope()).toBe("dropbox:testappkey123:dbid:user");
  expect(JSON.parse(String(mocked.mock.calls[0][1]?.body))).toMatchObject({ path: "", recursive: false });
  expect(JSON.parse(String(mocked.mock.calls[1][1]?.body))).toEqual({ cursor: "next" });
  respond(record, { "Dropbox-API-Result": JSON.stringify({ rev: "rev-two" }) });
  await expect(provider.downloadFile(file.id)).rejects.toThrow("changed during sync");
  respond({ entries: [file], has_more: false });
  await provider.listFiles();
  expect(mocked).toHaveBeenCalledTimes(5);
  respond({ entries: [{ ...file, rev: "rev-two" }], has_more: false });
  respond({ ...record, title: "Changed" }, { "Dropbox-API-Result": JSON.stringify({ rev: "rev-two" }) });
  expect((await provider.listFiles())[0].title).toBe("Changed");
  respond({ entries: [], has_more: false });
  await provider.listFiles();
  expect(await (await initDB()).count("revisionCache")).toBe(0);
});

it("stops if content changes after listing or pagination repeats", async () => {
  respond({ entries: [file], has_more: false });
  respond(record, { "Dropbox-API-Result": JSON.stringify({ rev: "rev-two" }) });
  await expect(new DropboxProvider("testappkey123").listFiles()).rejects.toThrow("changed during sync");
  respond({ entries: [], has_more: true, cursor: "again" });
  respond({ entries: [], has_more: true, cursor: "again" });
  await expect(new DropboxProvider("testappkey123").listFiles()).rejects.toThrow("pagination");
});

it("appends uniquely named revisions and conditionally deletes reviewed history", async () => {
  respond({ ".tag": "file" });
  respond({ metadata: file });
  const provider = new DropboxProvider("testappkey123");
  const metadata = {
    id: "song",
    type: "song" as const,
    title: "Test",
    lastModified: record.lastModified,
    revision,
    remoteId: file.id,
    etag: file.rev,
  };
  await provider.uploadFile(metadata, JSON.stringify(record));
  await provider.archiveRevision(metadata);
  const upload = JSON.parse(new Headers(mocked.mock.calls[0][1]?.headers).get("Dropbox-API-Arg") ?? "{}");
  expect(upload).toMatchObject({ path: file.path_lower, mode: "add", autorename: false, strict_conflict: true });
  expect(JSON.parse(String(mocked.mock.calls[1][1]?.body))).toEqual({ path: file.id, parent_rev: file.rev });
  await expect(provider.archiveRevision({ ...metadata, etag: undefined })).rejects.toThrow("safely removed");
  expect(mocked).toHaveBeenCalledTimes(2);
  respond({ error_summary: "path/conflict" }, undefined, 409);
  await expect(provider.archiveRevision(metadata)).rejects.toThrow("path/conflict");
});

it("refreshes an expired session and keeps account scope", async () => {
  sessionStorage.setItem(
    "dropbox_tokens",
    JSON.stringify({
      access_token: "expired",
      refresh_token: "refresh",
      expiresAt: 0,
      account_id: "dbid:user",
      appKey: "testappkey123",
    }),
  );
  respond({ access_token: "new", expires_in: 3600 });
  const provider = new DropboxProvider("testappkey123");
  expect(await provider.authenticate()).toBe(true);
  expect(String(mocked.mock.calls[0][1]?.body)).toContain("grant_type=refresh_token");
  expect(provider.getScope()).toBe("dropbox:testappkey123:dbid:user");
  await provider.logout();
  expect(sessionStorage.getItem("dropbox_tokens")).toBeNull();
});

it("looks up the current account using Dropbox's parameterless RPC contract", async () => {
  const saved = JSON.parse(sessionStorage.getItem("dropbox_tokens") ?? "{}");
  delete saved.account_id;
  sessionStorage.setItem("dropbox_tokens", JSON.stringify(saved));
  mocked.mockImplementationOnce(async (_url, init) =>
    String(init?.body) === "null"
      ? new Response(JSON.stringify({ account_id: "dbid:user" }))
      : new Response("request body: expected null, got value", { status: 400 }),
  );
  const provider = new DropboxProvider("testappkey123");
  await expect(provider.authenticate()).resolves.toBe(true);
  expect(provider.getScope()).toBe("dropbox:testappkey123:dbid:user");
});

it.each(["network", 429, 503])("retains the connection after a temporary refresh failure (%s)", async (failure) => {
  const saved = {
    access_token: "expired",
    refresh_token: "refresh",
    expiresAt: 0,
    account_id: "dbid:user",
    appKey: "testappkey123",
  };
  sessionStorage.setItem("dropbox_tokens", JSON.stringify(saved));
  if (typeof failure === "number") respond({ error: "temporarily_unavailable" }, undefined, failure);
  else mocked.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  const provider = new DropboxProvider("testappkey123");
  await expect(provider.authenticate()).rejects.toThrow();
  expect(provider.isAuthenticated()).toBe(true);
  expect(JSON.parse(sessionStorage.getItem("dropbox_tokens") ?? "null")).toEqual(saved);
  respond({ access_token: "recovered", expires_in: 3600 });
  await expect(provider.authenticate()).resolves.toBe(true);
  expect(provider.getScope()).toBe("dropbox:testappkey123:dbid:user");
  expect(new URLSearchParams(String(mocked.mock.calls[1][1]?.body)).get("refresh_token")).toBe("refresh");
});

it("refreshes once after an API 401 and retries the request with the new access token", async () => {
  const saved = JSON.parse(sessionStorage.getItem("dropbox_tokens") ?? "{}");
  sessionStorage.setItem("dropbox_tokens", JSON.stringify({ ...saved, refresh_token: "refresh" }));
  respond({ error_summary: "expired_access_token" }, undefined, 401);
  respond({ access_token: "new-access", expires_in: 3600 });
  respond({ entries: [], has_more: false });
  await expect(new DropboxProvider("testappkey123").listFiles()).resolves.toEqual([]);
  expect(mocked).toHaveBeenCalledTimes(3);
  expect(new Headers(mocked.mock.calls[2][1]?.headers).get("Authorization")).toBe("Bearer new-access");
});

it("shows Dropbox's plain-text 400 reason for folder listing failures", async () => {
  mocked.mockResolvedValueOnce(
    new Response('Error in call to API function "files/list_folder": missing scope', { status: 400 }),
  );
  await expect(new DropboxProvider("testappkey123").listFiles()).rejects.toThrow(
    'Dropbox files/list_folder failed (400): Error in call to API function "files/list_folder": missing scope',
  );
  expect(console.error).toHaveBeenCalledWith(
    "[Gig-Dex sync] Dropbox: HTTP request failed",
    expect.objectContaining({
      provider: "Dropbox",
      status: 400,
      endpoint: "https://api.dropboxapi.com/2/files/list_folder",
      method: "POST",
      apiDetails: expect.stringContaining("missing scope"),
    }),
  );
});

it("logs a failed token refresh with API diagnostics without exposing OAuth credentials", async () => {
  sessionStorage.setItem(
    "dropbox_tokens",
    JSON.stringify({
      access_token: "secret-access",
      refresh_token: "secret-refresh",
      expiresAt: 0,
      account_id: "dbid:user",
      appKey: "testappkey123",
    }),
  );
  respond(
    { error: "invalid_grant", error_description: "Refresh token revoked" },
    { "x-dropbox-request-id": "oauth-id" },
    400,
  );
  await expect(new DropboxProvider("testappkey123").authenticate()).rejects.toThrow("Refresh token revoked");
  expect(console.error).toHaveBeenCalledWith(
    "[Gig-Dex sync] Dropbox: HTTP request failed",
    expect.objectContaining({
      endpoint: "https://api.dropboxapi.com/oauth2/token",
      status: 400,
      requestId: "oauth-id",
    }),
  );
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/secret-access|secret-refresh/);
  expect(sessionStorage.getItem("dropbox_tokens")).toBeNull();
});
