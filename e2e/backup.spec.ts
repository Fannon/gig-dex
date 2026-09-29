import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("import multiple songs, report duplicates and invalid content, export and restore full library", async ({
  page,
}) => {
  await page.goto("./settings?section=library");
  await expect(page.getByRole("heading", { name: "Import / Restore" })).toBeVisible();
  await expect(page.locator(".data-management__file").first()).toHaveCSS("align-items", "stretch");
  const content = "{title: Harbor}\n{artist: River Band}\n{composer: Original Composer}\n[C]Original test song";
  await page.getByLabel("Import ChordPro songs").setInputFiles([
    { name: "harbor.cho", mimeType: "text/plain", buffer: Buffer.from(content) },
    { name: "same.cho", mimeType: "text/plain", buffer: Buffer.from(content) },
    {
      name: "repair.cho",
      mimeType: "text/plain",
      buffer: Buffer.from("{title: Repair}\n[C missing bracket"),
    },
    { name: "empty.cho", mimeType: "text/plain", buffer: Buffer.from("") },
  ]);
  await expect(page.getByRole("status")).toContainText("2 imported, 1 duplicates skipped, 1 failed");
  await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(2);
  await page.evaluate(async () => {
    const base = location.pathname.replace(/settings$/, "");
    const { addSetlist, getAllSongs } = await import(`${base}src/db.ts`);
    const [song] = await getAllSongs();
    await addSetlist({ name: "Backup gig", tags: ["acoustic"], songIds: [song.id, song.id] });
  });
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export library/ }).click();
  const download = await pending;
  const file = await download.path();
  expect(file).not.toBeNull();
  const backup = await readFile(file ?? "", "utf8");
  const parsed = JSON.parse(backup);
  expect(parsed.songs).toHaveLength(2);
  expect(parsed.setlists[0].tags).toEqual(["acoustic"]);
  expect(parsed.songs.find((song: { title: string }) => song.title === "Harbor").composer).toBe("Original Composer");
  await page.getByLabel("Restore backup").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await expect(page.getByText("Selected: backup.json")).toBeVisible();
  await expect(page.getByLabel("Restore mode")).toHaveValue("merge");
  await expect(page.getByText(/Selecting a file does not change your library/)).toBeVisible();
  await expect(page.getByText(/Nothing has been imported yet/)).toBeVisible();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Import complete on this device.");
  await page
    .getByLabel("Restore backup")
    .setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await expect(page.getByRole("alert")).toContainText("Not a supported");
  await page.goto("./setlists");
  await expect(page.locator(".setlists-page__song")).toHaveCount(2);
  await page.goto("./");
  await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(2);
});

test("replace restore requires confirmation and restores an empty library", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Add Demo Song" }).click();
  await page.goto("./settings?section=library");
  const buffer = Buffer.from(
    JSON.stringify({
      format: "gig-dex",
      version: 1,
      exportedAt: new Date().toISOString(),
      songs: [],
      setlists: [],
    }),
  );
  await page.getByLabel("Restore backup").setInputFiles({ name: "empty.json", mimeType: "application/json", buffer });
  await page.getByLabel("Restore mode").selectOption("replace");
  await expect(page.getByText(/Removes every current song and setlist/)).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Replace library", exact: true }).click();
  await expect(page.getByText("Selected: empty.json")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Replace library", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Library replaced on this device.");
  await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(0);
  await page.goto("./");
  await expect(page.getByText("No songs yet")).toBeVisible();
});

test("standard B chords can be displayed with German notation", async ({ page }) => {
  await page.goto("./settings?section=library");
  const id = await page.evaluate(async () => {
    const base = location.pathname.replace(/settings$/, "");
    const { importChordPro } = await import(`${base}src/utils/libraryBackup.ts`);
    await importChordPro([
      {
        name: "standard.cho",
        content: "{title: Standard song}\n{key:B}\n[Bm] [Bb]",
      },
    ]);
    const { getAllSongs } = await import(`${base}src/db.ts`);
    return (await getAllSongs())[0].id;
  });
  const stored = await page.evaluate(async (songId) => {
    const base = location.pathname.replace(/settings$/, "");
    const { getSong } = await import(`${base}src/db.ts`);
    return (await getSong(songId))?.content;
  }, id);
  expect(stored).toContain("[Bm] [Bb]");
  await page.goto("./settings?section=appearance");
  await page.getByLabel("Notation").selectOption("german");
  await page.goto(`./song/${id}`);
  await expect(page.locator(".song-view__content")).toContainText("Hm");
});
