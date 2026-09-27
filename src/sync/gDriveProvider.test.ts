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
		respond({ id: "uploaded" });
		await new GoogleDriveProvider().uploadFile(
			{ id: "song-1", title: "Test", type: "song", lastModified: "2025-01-01T00:00:00Z" },
			"{}",
		);
		expect(String(mockFetch.mock.calls[1][1]?.body)).toContain(
			'"lastModified":"2025-01-01T00:00:00Z"',
		);
	});
});

it("lists all concurrent branches and drops only their referenced ancestors", async () => {
	respond({ files: [{ id: "folder" }] });
	respond({
		files: [
			{
				id: "ancestor",
				name: "Old",
				properties: {
					internalId: "song",
					type: "song",
					revision: "r1",
					lastModified: "2025-01-01T00:00:00Z",
				},
			},
			{
				id: "a",
				name: "A",
				properties: {
					internalId: "song",
					type: "song",
					revision: "r2",
					parent0: "r1",
					lastModified: "2026-01-01T00:00:00Z",
				},
			},
			{
				id: "b",
				name: "B",
				properties: {
					internalId: "song",
					type: "song",
					revision: "r3",
					parent0: "r1",
					lastModified: "2024-01-01T00:00:00Z",
				},
			},
		],
	});
	expect((await new GoogleDriveProvider().listFiles()).map((file) => file.revision)).toEqual([
		"r2",
		"r3",
	]);
});

it("moves reviewed Drive revisions to trash using the original version and ETag", async () => {
	mockFetch.mockResolvedValueOnce(
		new Response(JSON.stringify({ id: "file", version: "7", properties: { revision: "r1" } }), {
			headers: { ETag: '"etag7"' },
		}),
	);
	respond({ id: "file", trashed: true });
	await new GoogleDriveProvider().archiveRevision({
		id: "song",
		type: "song",
		title: "Test",
		lastModified: "2025-01-01T00:00:00Z",
		revision: "r1",
		remoteId: "file",
		version: "7",
	});
	expect(mockFetch.mock.calls[1][1]?.method).toBe("PATCH");
	expect(mockFetch.mock.calls[1][1]?.headers).toMatchObject({ "If-Match": '"etag7"' });
	expect(JSON.parse(String(mockFetch.mock.calls[1][1]?.body))).toEqual({ trashed: true });
});
it("refuses Google cleanup when concurrency metadata is absent or changed", async () => {
	respond({ id: "file", version: "8", properties: { revision: "r1" } });
	await expect(
		new GoogleDriveProvider().archiveRevision({
			id: "song",
			type: "song",
			title: "Test",
			lastModified: "2025-01-01T00:00:00Z",
			revision: "r1",
			remoteId: "file",
			version: "7",
		}),
	).rejects.toThrow("concurrency token");
	expect(mockFetch).toHaveBeenCalledTimes(1);
});
