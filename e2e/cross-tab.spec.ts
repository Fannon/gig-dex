import { expect, type Page, test } from "@playwright/test";

async function createSong(page: Page, title: string) {
  await page.goto("./song/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.locator("textarea").fill("C\nSynthetic original line");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".song-page__title")).toHaveText(title);
}
async function renameSong(page: Page, title: string) {
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".song-page__title")).toHaveText(title);
}

test("saved songs, setlists and deletions refresh other tabs without focus or another local mutation", async ({
  page,
  context,
}) => {
  const observer = await context.newPage();
  await observer.goto("./");
  await expect(observer.getByRole("heading", { name: "No songs yet", exact: true })).toBeVisible();
  const initial = await observer.evaluate(() => {
    const counts = { focus: 0, mutations: 0 };
    Object.defineProperty(window, "crossTabCounts", { value: counts });
    window.addEventListener("focus", () => counts.focus++);
    window.addEventListener("gig-dex-library-mutated", () => counts.mutations++);
    return performance.timeOrigin;
  });
  await createSong(page, "Shared rehearsal");
  const songUrl = page.url();
  const home = observer.locator(".home-page__songs");
  await expect(home.getByRole("link", { name: /Shared rehearsal/ })).toBeVisible();
  await renameSong(page, "Renamed rehearsal");
  await expect(home.getByRole("link", { name: /Renamed rehearsal/ })).toBeVisible();
  await expect(home.getByRole("link", { name: /Shared rehearsal/ })).toHaveCount(0);

  await observer
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Sets", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Sets", exact: true })
    .click();
  await page.getByRole("button", { name: "New setlist", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "New Setlist", exact: true });
  await dialog.getByLabel("Name", { exact: true }).fill("Shared set");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(observer.locator(".setlists-page__content h2")).toHaveText("Shared set");
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edit setlist", exact: true });
  await dialog.getByLabel("Name", { exact: true }).fill("Renamed set");
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(observer.locator(".setlists-page__content h2")).toHaveText("Renamed set");
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete setlist", exact: true }).click();
  await expect(observer.getByText("No setlists yet", { exact: true })).toBeVisible();

  await observer
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Songs", exact: true })
    .click();
  await page.goto(songUrl);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(observer.getByRole("heading", { name: "No songs yet", exact: true })).toBeVisible();
  expect(await observer.evaluate(() => performance.timeOrigin)).toBe(initial);
  expect(await observer.evaluate(() => Reflect.get(window, "crossTabCounts"))).toEqual({ focus: 0, mutations: 0 });
});

test("other tabs refresh the sidebar while preserving dirty song drafts and the current performance", async ({
  page,
  context,
}) => {
  await createSong(page, "Original rehearsal");
  const editor = await context.newPage();
  await editor.goto(`${page.url()}?edit=true`);
  await editor.getByLabel("Title", { exact: true }).fill("Unsaved draft");
  await renameSong(page, "Saved in another tab");
  await expect(editor.locator("#sidebar-songs").getByRole("link", { name: /Saved in another tab/ })).toBeVisible();
  await expect(editor.getByLabel("Title", { exact: true })).toHaveValue("Unsaved draft");
  editor.on("dialog", (dialog) => dialog.accept());
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor.locator(".song-page__title")).toHaveText("Saved in another tab");
  await editor.getByRole("link", { name: "Perform", exact: true }).click();
  await expect(editor.getByRole("heading", { name: "Saved in another tab", exact: true })).toBeVisible();
  await editor.evaluate(() => {
    Reflect.set(window, "performanceRefreshes", 0);
    window.addEventListener("gig-dex-library-changed", () => {
      Reflect.set(window, "performanceRefreshes", Reflect.get(window, "performanceRefreshes") + 1);
    });
  });
  await renameSong(page, "Next rehearsal");
  await expect.poll(() => editor.evaluate(() => Reflect.get(window, "performanceRefreshes"))).toBeGreaterThan(0);
  await expect(editor.getByRole("heading", { name: "Saved in another tab", exact: true })).toBeVisible();
  await expect(editor.locator(".song-view__content")).toContainText("Synthetic original line");
  await editor.getByRole("link", { name: "← Exit", exact: true }).click();
  await expect(editor.locator("#sidebar-songs").getByRole("link", { name: /Next rehearsal/ })).toBeVisible();
});

test("Dropbox checks wait across tabs and closing the active tab releases the next check", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    localStorage.setItem("byoid:dropbox_app_key", "testappkey123");
    sessionStorage.setItem(
      "dropbox_tokens",
      JSON.stringify({
        access_token: "mock-access",
        expiresAt: Date.now() + 3600000,
        account_id: "dbid:tabs",
        appKey: "testappkey123",
      }),
    );
  });
  let calls = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await context.route("https://api.dropboxapi.com/2/files/list_folder", async (route) => {
    const call = ++calls;
    if (call === 1) await gate;
    await route.fulfill({ json: { entries: [], has_more: false } }).catch(() => {});
  });
  try {
    await page.goto("./settings?section=sync");
    await expect.poll(() => calls).toBe(1);
    const next = await context.newPage();
    await next.goto("./settings?section=sync");
    const host = next.getByRole("region", { name: "Dropbox sync", exact: true });
    await expect(host.getByRole("button", { name: "Waiting for another tab…", exact: true })).toBeDisabled();
    expect(calls).toBe(1);
    await expect(next.locator(".workspace-sync-link")).toHaveAttribute("data-syncing", "true");
    // A closed or crashed owner must not leave a persistent stale lock behind.
    await page.close();
    await expect.poll(() => calls).toBe(2);
    await expect(host.getByRole("button", { name: "Sync now", exact: true })).toBeEnabled();
    await expect(next.locator(".workspace-sync-link")).toHaveAttribute("data-syncing", "false");
    await expect(next.locator(".workspace-sync-link")).toHaveAttribute("data-needs-attention", "false");
    await host.getByRole("button", { name: "Sync now", exact: true }).click();
    await expect.poll(() => calls).toBe(3);
    await expect(host.getByRole("button", { name: "Sync now", exact: true })).toBeEnabled();
  } finally {
    release();
  }
});
