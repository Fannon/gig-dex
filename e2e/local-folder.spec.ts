import { expect, test } from "@playwright/test";

interface FolderFixture {
	permission: PermissionState;
	chosen: string;
	pickerActivation: boolean[];
}

test("folder picker connects, survives reload, handles denied permission and switches without deleting files", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.addInitScript(() => {
		const state: FolderFixture = {
			permission: "granted",
			chosen: "Cloud songbook",
			pickerActivation: [],
		};
		(window as unknown as { folderFixture: FolderFixture }).folderFixture = state;
		const root = navigator.storage.getDirectory();
		window.showDirectoryPicker = async () => {
			state.pickerActivation.push(navigator.userActivation.isActive);
			return (await root).getDirectoryHandle(state.chosen, { create: true });
		};
		FileSystemHandle.prototype.requestPermission = async () => state.permission;
		FileSystemHandle.prototype.queryPermission = async () => state.permission;
	});
	await page.goto("./");
	await page.getByRole("button", { name: "Add Demo Song" }).click();
	await page.getByRole("link", { name: "Settings", exact: true }).click();
	const host = page.getByRole("region", { name: "Local Folder sync", exact: true });
	await host.getByRole("button", { name: /Connect local folder/ }).click();
	await expect(
		host.getByRole("heading", { name: "Local Folder Connected — Cloud songbook" }),
	).toBeVisible();
	await expect(host.getByText(/Last synced:/)).toBeVisible();
	expect(
		await page.evaluate(
			() => (window as unknown as { folderFixture: FolderFixture }).folderFixture.pickerActivation,
		),
	).toEqual([true]);
	const names = await page.evaluate(async () => {
		const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("Cloud songbook");
		const names = [];
		for await (const entry of dir.values()) names.push(entry.name);
		return names;
	});
	expect(names).toHaveLength(1);
	expect(names[0]).toMatch(/^gigdex-song-[0-9a-f-]+\.json$/);
	await page.reload();
	await expect(
		host.getByRole("heading", { name: "Local Folder Connected — Cloud songbook" }),
	).toBeVisible();
	await page.evaluate(() => {
		(window as unknown as { folderFixture: FolderFixture }).folderFixture.permission = "denied";
	});
	await host.getByRole("button", { name: "Sync Now", exact: true }).click();
	await expect(host.getByRole("alert")).toContainText("permission denied");
	await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(1);
	await page.evaluate(() => {
		const state = (window as unknown as { folderFixture: FolderFixture }).folderFixture;
		state.permission = "granted";
		state.chosen = "Second folder";
	});
	await host.getByRole("button", { name: "Change folder" }).click();
	await expect(
		host.getByRole("heading", { name: "Local Folder Connected — Second folder" }),
	).toBeVisible();
	await expect(host.getByRole("alert")).toHaveCount(0);
	expect(
		await page.evaluate(
			() => (window as unknown as { folderFixture: FolderFixture }).folderFixture.pickerActivation,
		),
	).toEqual([true]);
	await page.getByText("Use your own cloud Client IDs", { exact: true }).click();
	await page.screenshot({ path: "reports/local-folder/settings-desktop.png", fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
	await page.screenshot({ path: "reports/local-folder/settings-phone.png", fullPage: true });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	for (const button of await host.locator("button").all()) {
		const box = await button.boundingBox();
		expect(box?.x).toBeGreaterThanOrEqual(0);
		expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
	}
	await host.getByRole("button", { name: "Disconnect", exact: true }).click();
	await expect(host.getByRole("button", { name: /Connect local folder/ })).toBeVisible();
	const retained = await page.evaluate(async () => {
		const root = await navigator.storage.getDirectory();
		const counts = [];
		for (const name of ["Cloud songbook", "Second folder"]) {
			const dir = await root.getDirectoryHandle(name);
			let count = 0;
			for await (const _entry of dir.values()) count++;
			counts.push(count);
		}
		return counts;
	});
	expect(retained).toEqual([1, 1]);
});

test("runtime Client IDs enable cloud hosts without rebuilding, persist, and reject invalid values", async ({
	page,
}) => {
	await page.goto("./settings");
	await page.getByText("Use your own cloud Client IDs", { exact: true }).click();
	await page
		.getByLabel("Google Client ID", { exact: true })
		.fill("123-test.apps.googleusercontent.com");
	await page.getByLabel("Microsoft Client ID", { exact: true }).fill("not-a-client-id");
	await page.getByRole("button", { name: "Save Client IDs" }).click();
	await expect(page.getByRole("alert")).toContainText("UUID format");
	expect(await page.evaluate(() => localStorage.getItem("byoid:google_client_id"))).toBeNull();
	await page
		.getByLabel("Microsoft Client ID", { exact: true })
		.fill("00000000-0000-4000-8000-000000000001");
	await page.getByRole("button", { name: "Save Client IDs" }).click();
	await expect(page.getByText(/Client settings saved/)).toBeVisible();
	await expect(page.getByRole("button", { name: /Connect Google Drive/ })).toBeVisible();
	await expect(page.getByRole("button", { name: /Connect OneDrive/ })).toBeVisible();
	await page.reload();
	await page.getByText("Use your own cloud Client IDs", { exact: true }).click();
	await expect(page.getByLabel("Google Client ID", { exact: true })).toHaveValue(
		"123-test.apps.googleusercontent.com",
	);
	await expect(page.getByText("Google: Settings value", { exact: true })).toBeVisible();
	await expect(page.getByText("Microsoft: Settings value", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Clear overrides" }).click();
	await expect(page.getByLabel("Google Client ID", { exact: true })).toHaveValue("");
	expect(await page.evaluate(() => localStorage.getItem("byoid:microsoft_client_id"))).toBeNull();
});

test("unsupported browsers explain folder alternatives without opening a picker", async ({
	page,
}) => {
	await page.addInitScript(() => {
		window.showDirectoryPicker = undefined;
	});
	await page.goto("./settings");
	const host = page.getByRole("region", { name: "Local Folder sync", exact: true });
	await expect(host).toContainText("Local folder sync needs Chrome/Edge on desktop");
	await expect(host.getByRole("button")).toHaveCount(0);
});
