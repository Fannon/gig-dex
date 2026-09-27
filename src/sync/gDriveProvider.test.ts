import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleDriveProvider } from "./gDriveProvider";

const mockFetch = vi.fn<typeof fetch>();
function respond(body: unknown) {
	mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
}

beforeEach(() => {
	localStorage.clear();
	localStorage.setItem("gdrive_access_token", "test-token");
	mockFetch.mockReset();
	vi.stubGlobal("fetch", mockFetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("Drive synchronization metadata", () => {
	it("uses song edit timestamps and lists all pages without importing unrelated files", async () => {
		respond({ files: [{ id: "folder" }] });
		respond({
			files: [
				{
					id: "first",
					name: "First",
					modifiedTime: "2026-09-27T00:00:00Z",
					properties: { internalId: "song-1", type: "song", lastModified: "2026-01-01T00:00:00Z" },
				},
			],
			nextPageToken: "next page",
		});
		respond({
			files: [
				{
					id: "second",
					name: "Second",
					modifiedTime: "2026-09-27T00:00:00Z",
					properties: {
						internalId: "setlist-1",
						type: "setlist",
						lastModified: "2026-02-01T00:00:00Z",
					},
				},
				{ id: "unrelated", name: "Personal notes" },
			],
		});
		const files = await new GoogleDriveProvider().listFiles();
		expect(files).toHaveLength(2);
		expect(files[0].lastModified).toBe("2026-01-01T00:00:00Z");
		expect(files[1].type).toBe("setlist");
		expect(String(mockFetch.mock.calls[2][0])).toContain("pageToken=next%20page");
	});
	it("reads embedded timestamps for legacy uploads rather than Drive upload time", async () => {
		respond({ files: [{ id: "folder" }] });
		respond({
			files: [
				{
					id: "legacy",
					name: "Old song",
					modifiedTime: "2026-09-27T00:00:00Z",
					properties: { internalId: "song-1", type: "song" },
				},
			],
		});
		respond({ id: "song-1", lastModified: "2025-01-01T00:00:00Z" });
		const files = await new GoogleDriveProvider().listFiles();
		expect(files[0].lastModified).toBe("2025-01-01T00:00:00Z");
	});
	it("persists the edit timestamp alongside the record identity on upload", async () => {
		respond({ files: [{ id: "folder" }] });
		respond({ files: [] });
		respond({ id: "uploaded" });
		await new GoogleDriveProvider().uploadFile(
			{ id: "song-1", title: "Test", type: "song", lastModified: "2025-01-01T00:00:00Z" },
			"{}",
		);
		expect(String(mockFetch.mock.calls[2][1]?.body)).toContain(
			'"lastModified":"2025-01-01T00:00:00Z"',
		);
	});
});
