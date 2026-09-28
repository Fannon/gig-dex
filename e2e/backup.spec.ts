import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("import multiple songs, report duplicates and invalid content, export and restore full library", async ({
  page,
}) => {
  await page.goto("./settings?section=library");
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
  await expect(page.getByText(/Ready to restore/)).toBeVisible();
  await page.getByRole("button", { name: "Restore library", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Backup restored successfully.");
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
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Restore library", exact: true }).click();
  await expect(page.getByText(/Ready to restore/)).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restore library", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Backup restored successfully.");
  await page.goto("./");
  await expect(page.getByText("No songs yet")).toBeVisible();
});
