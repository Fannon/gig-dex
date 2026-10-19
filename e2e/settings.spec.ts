import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("phone settings expose every section and export works with the keyboard and nearby feedback", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("./settings?section=library");
  const navigation = page.getByRole("navigation", { name: "Settings sections", exact: true });
  for (const section of ["Appearance", "Library", "Sync", "Offline", "About"])
    await expect(navigation.getByRole("button", { name: section, exact: true })).toBeInViewport({ ratio: 1 });
  const card = page.getByRole("region", { name: "Back up your library", exact: true });
  const button = card.getByRole("button", { name: "Export library", exact: true });
  await button.focus();
  await expect(button).toBeFocused();
  const pending = page.waitForEvent("download");
  await button.press("Enter");
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^gig-dex-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const contents = JSON.parse(await readFile((await download.path()) ?? "", "utf8"));
  expect(contents).toMatchObject({ format: "gig-dex", version: 1, songs: [], setlists: [] });
  await expect(card.getByRole("status")).toHaveText("Backup downloaded: 0 songs and 0 setlists.");
  await navigation.getByRole("button", { name: "About", exact: true }).click();
  await expect(page.getByRole("link", { name: "Project & help", exact: true })).toBeVisible();
  await page.goBack();
  await expect(navigation.getByRole("button", { name: "Library", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(button).toBeVisible();
});

test.describe("Settings Page", () => {
  test("should navigate to settings page", async ({ page }) => {
    await page.goto("./");

    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL("./settings");
    await expect(page.locator(".settings-page__content h1")).toContainText("Settings");
  });

  test("sync has its own navbar link to sync settings", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("./");
    const syncLink = page.getByRole("link", { name: "Sync settings — no sync connected", exact: true });
    await expect(syncLink).toBeVisible();
    await expect(syncLink).toHaveAttribute("data-configured", "false");
    await expect(syncLink).toHaveCSS("color", "rgb(165, 165, 178)");
    expect(await page.locator(".workspace-topbar").evaluate((header) => header.scrollWidth <= header.clientWidth)).toBe(
      true,
    );
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Settings" }),
    ).toBeVisible();
    await syncLink.click();
    await expect(page).toHaveURL("./settings?section=sync");
    await expect(page.getByRole("heading", { name: "Active syncs" })).toBeVisible();
  });

  test("should display data management options", async ({ page }) => {
    await page.goto("./settings");

    await page.getByRole("button", { name: "Library", exact: true }).click();
    // Use more specific locators
    await expect(page.getByRole("button", { name: "Export library", exact: true })).toBeVisible();
    await expect(page.getByLabel("Restore backup")).toBeVisible();
    await expect(page.getByLabel("Import ChordPro songs")).toBeVisible();
  });

  test("should display cloud sync section", async ({ page }) => {
    await page.goto("./settings");

    await page.getByRole("button", { name: "Sync", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Active syncs" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Add sync provider" })).toBeVisible();

    // Check for either "Google Drive Sync" (when not configured) or "Connect Google Drive" (when configured)
    await expect(page.locator(".settings-page__option-text h3").filter({ hasText: /Google Drive/i })).toBeVisible();
  });

  test("should display about section", async ({ page }) => {
    await page.goto("./settings");

    await page.getByRole("button", { name: "About", exact: true }).click();
    await expect(page.locator(".settings-page__about-brand p")).toContainText("Version 0.1.0");
    await expect(page.getByRole("link", { name: /Learn ChordPro/i })).toBeVisible();
  });

  test("should navigate back to home", async ({ page }) => {
    await page.goto("./settings");

    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Songs", exact: true })
      .click();
    await expect(page).toHaveURL("./");
  });
});
