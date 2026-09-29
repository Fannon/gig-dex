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
  await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(2);
  await page.goto("./settings?section=sync");
  const host = page.getByRole("region", { name: "Local Folder sync", exact: true });
  await host.getByRole("button", { name: /Sync from a folder on this computer/ }).click();
  await expect(host.getByRole("heading", { name: "Local Folder Connected — Cloud songbook" })).toBeVisible();
  await expect(host.getByText(/Last synced/)).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { folderFixture: FolderFixture }).folderFixture.pickerActivation),
  ).toEqual([true]);
  const names = await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("Cloud songbook");
    const names = [];
    for await (const entry of dir.values()) names.push(entry.name);
    return names;
  });
  expect(names.filter((name) => /^gigdex-song-[0-9a-f-]+\.json$/.test(name))).toHaveLength(2);
  expect(names.filter((name) => /^gigdex-setlist-[0-9a-f-]+\.json$/.test(name))).toHaveLength(1);
  await page.reload();
  await expect(host.getByRole("heading", { name: "Local Folder Connected — Cloud songbook" })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { folderFixture: FolderFixture }).folderFixture.permission = "denied";
  });
  await host.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(host.getByRole("alert")).toContainText("permission denied");
  await expect(page.locator(".workspace-sync-alert")).toBeVisible();
  await host.getByText("Recent activity", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Local Folder sync activity" })).toContainText("permission denied");
  await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(2);
  await page.evaluate(() => {
    const state = (window as unknown as { folderFixture: FolderFixture }).folderFixture;
    state.permission = "granted";
    state.chosen = "Second folder";
  });
  await host.getByRole("button", { name: "Choose a different folder" }).click();
  await expect(host.getByRole("heading", { name: "Local Folder Connected — Second folder" })).toBeVisible();
  await expect(host.getByRole("alert")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { folderFixture: FolderFixture }).folderFixture.pickerActivation),
  ).toEqual([true]);
  await page.getByText("Configure Dropbox", { exact: true }).click();
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
  await host.getByRole("button", { name: "Stop syncing", exact: true }).click();
  await expect(host.getByRole("button", { name: /Sync from a folder on this computer/ })).toBeVisible();
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
  expect(retained).toEqual([3, 3]);
});

test("connected folder automatically syncs saved songs, setlists, and ChordPro imports", async ({ page }) => {
  await page.addInitScript(() => {
    const root = navigator.storage.getDirectory();
    window.showDirectoryPicker = async () => (await root).getDirectoryHandle("Automatic sync", { create: true });
    FileSystemHandle.prototype.requestPermission = async () => "granted";
    FileSystemHandle.prototype.queryPermission = async () => "granted";
  });
  await page.goto("./settings?section=sync");
  const host = page.getByRole("region", { name: "Local Folder sync", exact: true });
  await host.getByRole("button", { name: /Sync from a folder on this computer/ }).click();
  await expect(host.getByText(/Last synced/)).toBeVisible();
  await page.goto("./");
  await page.getByRole("button", { name: "Add Demo Song" }).click();
  const files = () =>
    page.evaluate(async () => {
      const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle("Automatic sync");
      const names: string[] = [];
      for await (const entry of folder.values()) names.push(entry.name);
      return names;
    });
  await expect.poll(async () => (await files()).filter((name) => name.startsWith("gigdex-song-")).length).toBe(2);
  await expect.poll(async () => (await files()).filter((name) => name.startsWith("gigdex-setlist-")).length).toBe(1);
  await page.goto("./settings?section=library");
  await page
    .getByLabel("Import ChordPro songs")
    .setInputFiles({ name: "imported.cho", mimeType: "text/plain", buffer: Buffer.from("{title: Imported}\n[C]Line") });
  await expect(page.getByText("1 imported, 0 duplicates skipped, 0 failed.")).toBeVisible();
  await expect.poll(async () => (await files()).filter((name) => name.startsWith("gigdex-song-")).length).toBe(3);
});

test("connected folder pulls a new song automatically when the app opens", async ({ page }) => {
  await page.addInitScript(() => {
    const root = navigator.storage.getDirectory();
    window.showDirectoryPicker = async () => (await root).getDirectoryHandle("Startup pull", { create: true });
    FileSystemHandle.prototype.requestPermission = async () => "granted";
    FileSystemHandle.prototype.queryPermission = async () => "granted";
  });
  await page.goto("./settings?section=sync");
  const host = page.getByRole("region", { name: "Local Folder sync", exact: true });
  await host.getByRole("button", { name: /Sync from a folder on this computer/ }).click();
  await expect(host.getByText(/Last synced/)).toBeVisible();
  await page.evaluate(async () => {
    const base = location.pathname.replace(/settings$/, "");
    const { createSyncFile, revisionFilename } = await import(`${base}src/sync/syncFormat.ts`);
    const date = new Date().toISOString();
    const song = {
      id: crypto.randomUUID(),
      title: "Remote startup song",
      artist: "",
      content: "{title: Remote startup song}\n[C]Ready",
      tags: [],
      createdAt: date,
      lastModified: date,
    };
    const { revision, content } = await createSyncFile(song, []);
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle("Startup pull");
    const file = await folder.getFileHandle(revisionFilename("song", revision), { create: true });
    const writable = await file.createWritable();
    await writable.write(content);
    await writable.close();
  });
  await page.reload();
  await expect(page.locator("#sidebar-songs").getByRole("link", { name: /Remote startup song/ })).toBeVisible();
});

test("runtime Client IDs enable cloud hosts without rebuilding, persist, and reject invalid values", async ({
  page,
}) => {
  await page.goto("./settings?section=sync");
  await page.getByText("Configure Google Drive", { exact: true }).click();
  await page.getByLabel("Google Client ID", { exact: true }).fill("123-test.apps.googleusercontent.com");
  await page.getByRole("button", { name: "Save Google Drive settings" }).click();
  await page.getByText("Configure OneDrive", { exact: true }).click();
  await page.getByLabel("Microsoft Client ID", { exact: true }).fill("not-a-client-id");
  await page.getByRole("button", { name: "Save OneDrive settings" }).click();
  await expect(page.getByRole("alert")).toContainText("UUID format");
  expect(await page.evaluate(() => localStorage.getItem("byoid:google_client_id"))).toBe(
    "123-test.apps.googleusercontent.com",
  );
  await page.getByLabel("Microsoft Client ID", { exact: true }).fill("00000000-0000-4000-8000-000000000001");
  await page.getByRole("button", { name: "Save OneDrive settings" }).click();
  await expect(page.getByText(/OneDrive settings saved/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Connect Google Drive/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Connect OneDrive/ })).toBeVisible();
  await page.reload();
  await page.getByText("Configure Google Drive", { exact: true }).click();
  await page.getByText("Configure OneDrive", { exact: true }).click();
  await expect(page.getByLabel("Google Client ID", { exact: true })).toHaveValue("123-test.apps.googleusercontent.com");
  await expect(page.getByText("Google: Settings value", { exact: true })).toBeVisible();
  await expect(page.getByText("Microsoft: Settings value", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear Google Drive override" }).click();
  await expect(page.getByLabel("Google Client ID", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Clear OneDrive override" }).click();
  expect(await page.evaluate(() => localStorage.getItem("byoid:microsoft_client_id"))).toBeNull();
});

test("unsupported browsers explain folder alternatives without opening a picker", async ({ page }) => {
  await page.addInitScript(() => {
    window.showDirectoryPicker = undefined;
  });
  await page.goto("./settings?section=sync");
  const host = page.getByRole("region", { name: "Local Folder sync", exact: true });
  await expect(host).toContainText("Folder sync is available in Chrome or Edge on a computer");
  await expect(host.getByRole("button")).toHaveCount(0);
});
