import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fetchSyncResponse, logSyncError, syncHttpError } from "./diagnostics";

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("logs HTTP status, endpoint, request ID and detailed errors without credentials or request data", async () => {
  const error = await syncHttpError(
    {
      provider: "Dropbox",
      url: "https://api.dropboxapi.com/2/files/list_folder?cursor=private",
      method: "POST",
      secrets: ["secret-access", "secret-refresh"],
    },
    new Response(
      JSON.stringify({
        error_summary: "missing_scope",
        error: { ".tag": "missing_scope", required_scope: "files.metadata.read" },
        access_token: "secret-access",
        refresh_token: "secret-refresh",
      }),
      { status: 400, statusText: "Bad Request", headers: { "x-dropbox-request-id": "request-123" } },
    ),
  );
  expect(error.message).toBe("Dropbox files/list_folder failed (400): missing_scope");
  expect(console.error).toHaveBeenCalledWith(
    "[Gig-Dex sync] Dropbox: HTTP request failed",
    expect.objectContaining({
      endpoint: "https://api.dropboxapi.com/2/files/list_folder",
      method: "POST",
      status: 400,
      statusText: "Bad Request",
      requestId: "request-123",
      apiDetails: expect.stringContaining('"required_scope":"files.metadata.read"'),
    }),
  );
  const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
  for (const value of ["secret-access", "secret-refresh", "cursor=private"]) expect(logged).not.toContain(value);
  logSyncError("Dropbox", "Sync record failed", error, { type: "song", id: "song-id" });
  expect(console.error).toHaveBeenLastCalledWith(
    "[Gig-Dex sync] Dropbox: Sync record failed",
    expect.objectContaining({ recordType: "song", recordId: "song-id", requestId: "request-123", status: 400 }),
  );
});

it("logs network failures without upload bodies, headers or signed download URLs", async () => {
  const url = "https://download.example.test/private?signature=signed-secret";
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError(`Cannot reach ${url} with Bearer secret-token`)));
  await expect(
    fetchSyncResponse(
      {
        provider: "OneDrive",
        url,
        method: "PUT",
        endpoint: "https://download.example.test/[revision download]",
        secrets: [url, "secret-token"],
      },
      { method: "PUT", headers: { Authorization: "Bearer secret-token" }, body: "PRIVATE SONG CONTENT" },
    ),
  ).rejects.toThrow("network request failed");
  expect(console.error).toHaveBeenCalledWith(
    "[Gig-Dex sync] OneDrive: Network request failed",
    expect.objectContaining({
      endpoint: "https://download.example.test/[revision download]",
      method: "PUT",
      errorType: "SyncRequestError",
    }),
  );
  const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
  for (const value of [url, "signed-secret", "secret-token", "PRIVATE SONG CONTENT"])
    expect(logged).not.toContain(value);
});

it("keeps plain-text and malformed JSON errors useful and bounded", async () => {
  const error = await syncHttpError(
    { provider: "Dropbox", url: "https://api.dropboxapi.com/2/files/list_folder", method: "POST" },
    new Response(`Invalid JSON in argument: ${"x".repeat(10000)}`, { status: 400 }),
  );
  expect(error.message).toContain("Invalid JSON in argument");
  expect(error.message.length).toBeLessThan(500);
  expect(vi.mocked(console.error).mock.calls[0][1].apiDetails).toHaveLength(4000);
  const json = await syncHttpError(
    { provider: "OneDrive", url: "https://graph.microsoft.com/v1.0/me/drive" },
    new Response(
      JSON.stringify({
        error: {
          code: "accessDenied",
          message: "Missing Files.ReadWrite.AppFolder",
          innerError: { "request-id": "inner-id" },
        },
      }),
      { status: 403, headers: { "request-id": "graph-id" } },
    ),
  );
  expect(json.message).toContain("Missing Files.ReadWrite.AppFolder");
  expect(console.error).toHaveBeenLastCalledWith(
    "[Gig-Dex sync] OneDrive: HTTP request failed",
    expect.objectContaining({
      status: 403,
      requestId: "graph-id",
      apiDetails: expect.stringContaining("accessDenied"),
    }),
  );
});
