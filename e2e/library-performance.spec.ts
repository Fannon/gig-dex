import { expect, type Page, test } from "@playwright/test";

type Reads = { allSongs: number; allSets: number; songIds: string[] };
type InstrumentedWindow = Window & { libraryReads: Reads };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const reads = { allSongs: 0, allSets: 0, songIds: [] as string[] };
    Object.defineProperty(window, "libraryReads", { value: reads });
    const storeAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args) {
      if (this.name === "songs") reads.allSongs++;
      if (this.name === "setlists") reads.allSets++;
      return storeAll.apply(this, args);
    };
    const indexAll = IDBIndex.prototype.getAll;
    IDBIndex.prototype.getAll = function (...args) {
      if (this.objectStore.name === "songs") reads.allSongs++;
      if (this.objectStore.name === "setlists") reads.allSets++;
      const request = indexAll.apply(this, args);
      if (this.objectStore.name === "songs" && sessionStorage.getItem("fail-library-reads") === "true")
        this.objectStore.transaction.abort();
      return request;
    };
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (query) {
      if (this.name === "songs") reads.songIds.push(String(query));
      return get.call(this, query);
    };
  });
});

async function seed(page: Page) {
  await page.goto("./");
  const ids = await page.evaluate(async () => {
    const { initDB } = await import(`${new URL(".", location.href).pathname}src/db.ts`);
    const db = await initDB();
    const tx = db.transaction(["songs", "setlists"], "readwrite");
    const ids = Array.from({ length: 191 }, () => crypto.randomUUID());
    for (const [index, id] of ids.entries())
      await tx.objectStore("songs").put({
        id,
        title: `Song ${String(index).padStart(3, "0")}`,
        artist: "Synthetic band",
        tags: ["gig"],
        content: "{key: C}\n[C]Synthetic library line",
        createdAt: "2026-01-01T00:00:00.000Z",
        lastModified: "2026-01-01T00:00:00.000Z",
      });
    const list = crypto.randomUUID();
    await tx.objectStore("setlists").put({
      id: list,
      name: "Repeated performance",
      songIds: [ids[0], ids[1], ids[0], "missing"],
      createdAt: "2026-01-01T00:00:00.000Z",
      lastModified: "2026-01-01T00:00:00.000Z",
    });
    await tx.done;
    return { songs: ids, list };
  });
  await page.reload();
  await expect(page.locator(".home-page__songs > li")).toHaveCount(191);
  return ids;
}
const reads = (page: Page) => page.evaluate(() => (window as InstrumentedWindow).libraryReads);

test("a failed library read offers retry without showing a false empty library", async ({ page }) => {
  await seed(page);
  await page.evaluate(() => sessionStorage.setItem("fail-library-reads", "true"));
  await page.reload();
  const home = page.locator(".home-page");
  await expect(home.getByRole("alert")).toContainText("Could not load the library");
  await expect(page.getByRole("heading", { name: "No songs yet", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Demo Songs", exact: true })).toHaveCount(0);
  await page.evaluate(() => sessionStorage.removeItem("fail-library-reads"));
  await home.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(home.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".home-page__songs > li")).toHaveCount(191);
  await expect(page.locator("#sidebar-songs .library-sidebar__song-row")).toHaveCount(191);
});

test("search and navigation reuse the loaded library and saved edits still refresh both views", async ({ page }) => {
  await seed(page);
  expect((await reads(page)).allSongs).toBeLessThanOrEqual(2);
  const initial = await reads(page);
  await page.getByLabel("Search your songs", { exact: true }).fill("Song 019");
  await expect(page.locator(".home-page__songs > li")).toHaveCount(1);
  await expect(page).toHaveURL(/q=Song\+019/);
  expect(await reads(page)).toEqual(initial);
  await page
    .locator(".home-page__songs")
    .getByRole("link", { name: /Song 019/ })
    .click();
  await expect(page.locator(".song-page__title")).toHaveText("Song 019");
  expect((await reads(page)).allSongs).toBe(initial.allSongs);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Edited performance song");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("#sidebar-songs").getByRole("link", { name: /Edited performance song/ })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Songs", exact: true })
    .click();
  await expect(page.locator(".home-page__songs").getByRole("link", { name: /Edited performance song/ })).toBeVisible();
  const afterSave = await reads(page);
  expect(afterSave.allSongs).toBe(initial.allSongs + 1);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Settings", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(
    page.getByText("191 songs · 1 setlist stored on this device · 1 missing song references", { exact: true }),
  ).toBeAttached();
  const settings = await reads(page);
  for (const section of ["Sync", "Library", "Appearance"]) {
    await page.getByRole("button", { name: section, exact: true }).click();
    await expect(page.getByRole("button", { name: section, exact: true })).toHaveAttribute("aria-current", "page");
  }
  expect(await reads(page)).toEqual(settings);
});

test("performance reads only requested songs and preserves repeated and missing occurrences", async ({ page }) => {
  const ids = await seed(page);
  await page
    .locator(".home-page__songs")
    .getByRole("link", { name: /Song 000/ })
    .click();
  await expect(page.locator(".song-page__title")).toHaveText("Song 000");
  const before = await reads(page);
  await page.getByRole("link", { name: "Perform", exact: true }).click();
  await expect(page.locator(".performance-page")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Song 000", exact: true })).toBeVisible();
  const single = await reads(page);
  expect(single.allSongs).toBe(before.allSongs);
  expect(new Set(single.songIds.slice(before.songIds.length))).toEqual(new Set([ids.songs[0]]));
  await page.getByRole("link", { name: "← Exit", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Sets", exact: true })
    .click();
  await expect(page.locator(".setlists-page__content h2")).toHaveText("Repeated performance");
  const beforeSet = await reads(page);
  await page.getByRole("link", { name: /Perform setlist/ }).click();
  await expect(page.locator(".performance-page")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Song 000", exact: true })).toBeVisible();
  const set = await reads(page);
  expect(set.allSongs).toBe(beforeSet.allSongs);
  expect(new Set(set.songIds.slice(beforeSet.songIds.length))).toEqual(
    new Set([ids.songs[0], ids.songs[1], "missing"]),
  );
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { name: "Song 001", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { name: "Song 000", exact: true })).toBeVisible();
  await expect(page.locator(".performance-page__caption")).toContainText("3/4");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { name: "Song unavailable", exact: true })).toBeVisible();
  expect(await reads(page)).toEqual(set);
});
