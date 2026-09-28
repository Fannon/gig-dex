import { expect, test } from "@playwright/test";
import { createUpgradeServer } from "../scripts/pwa-upgrade-server.mjs";

test("production upgrade waits for editors and readers across tabs; offline relaunch and repair preserve songs", async ({
  page,
  context,
}) => {
  test.skip(!process.env.PLAYWRIGHT_URL, "Requires a completed production build.");
  const fixture = await createUpgradeServer({ base: process.env.VITE_BASE_PATH || "/" });
  try {
    await page.goto(fixture.url);
    await page.getByRole("button", { name: "Add Demo Song" }).click();
    await page.locator("#sidebar-songs .library-sidebar__links a").first().click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Advanced (ChordPro)", exact: true }).click();
    await page
      .locator("#advanced-content")
      .fill(Array.from({ length: 90 }, (_, index) => `[C]Synthetic tablet reading line ${index + 1}`).join("\n"));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const songUrl = page.url();
    await page.getByRole("link", { name: "Perform", exact: true }).click();
    const performUrl = page.url();
    await page.getByRole("button", { name: "Performance options", exact: true }).click();
    await page.getByLabel("Reading mode").selectOption("scroll");
    const reader = page.locator(".song-view__wrapper");
    await expect.poll(() => reader.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(100);
    await reader.evaluate((node) => {
      node.scrollTop = 450;
    });
    await expect.poll(() => reader.evaluate((node) => node.scrollTop)).toBe(450);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    fixture.upgrade();
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.ready).update();
    });
    await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.ready).waiting)).toBe(true);
    await expect(page.locator('meta[name="gigdex-test-deployment"]')).toHaveAttribute("content", "A");
    await expect(page.getByRole("button", { name: "Update and restart" })).toHaveCount(0);
    const other = await context.newPage();
    await other.goto(`${fixture.url}settings?section=offline`);
    await expect(other.getByRole("button", { name: "Update and restart" }).first()).toBeVisible();
    await other.getByRole("button", { name: "Update and restart" }).first().click();
    await expect(other.getByText(/save edits in other Gig-Dex tabs/).first()).toBeVisible();
    await expect(page.locator('meta[name="gigdex-test-deployment"]')).toHaveAttribute("content", "A");
    await page.getByRole("link", { name: "← Exit" }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill("Offline tablet song");
    await expect(page.getByRole("button", { name: "Update and restart" })).toBeDisabled();
    await other.getByRole("button", { name: "Update and restart" }).first().click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Offline tablet song");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    // Editing content invalidates the old reading signature; save a position for the reviewed song.
    await page.getByRole("link", { name: "Perform", exact: true }).click();
    await page.getByRole("button", { name: "Performance options", exact: true }).click();
    await expect(page.getByLabel("Reading mode")).toHaveValue("scroll");
    await page.getByRole("button", { name: "Close performance options" }).click();
    await expect.poll(() => reader.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(100);
    await reader.evaluate((node) => {
      node.scrollTop = 450;
    });
    await expect.poll(() => reader.evaluate((node) => node.scrollTop)).toBe(450);
    await page.getByRole("link", { name: "← Exit" }).click();
    await other.close();
    await page.getByRole("button", { name: "Update and restart" }).click();
    await expect(page.locator('meta[name="gigdex-test-deployment"]')).toHaveAttribute("content", "B");
    await expect(page.locator(".song-page__title")).toHaveText("Offline tablet song");
    await context.setOffline(true);
    await page.close();
    const cold = await context.newPage();
    await cold.goto(performUrl);
    await expect(cold.getByRole("heading", { name: "Offline tablet song" })).toBeVisible();
    await cold.getByRole("button", { name: "Performance options", exact: true }).click();
    await expect(cold.getByLabel("Reading mode")).toHaveValue("scroll");
    await cold.getByRole("button", { name: "Close performance options" }).click();
    await expect.poll(() => cold.locator(".song-view__wrapper").evaluate((node) => node.scrollTop)).toBeCloseTo(450, 0);
    await cold.getByRole("link", { name: "← Exit" }).click();
    await cold.getByRole("button", { name: "Edit", exact: true }).click();
    await cold.getByLabel("Title", { exact: true }).fill("Edited offline");
    await cold.getByRole("button", { name: "Save", exact: true }).click();
    await context.setOffline(false);
    await cold.goto(`${fixture.url}settings?section=offline`);
    await cold.getByText("Technical details", { exact: true }).click();
    await expect(cold.getByText("Ready to open offline", { exact: true })).toBeVisible();
    await cold.evaluate(async () => {
      await (await caches.open("unrelated-app-cache")).put("/unrelated", new Response("keep me"));
    });
    await cold.getByText("Refresh app files", { exact: true }).click();
    cold.once("dialog", (dialog) => dialog.accept());
    await cold.getByRole("button", { name: "Repair app files" }).click();
    await cold.goto(fixture.url);
    await expect(cold.getByRole("main").getByRole("link", { name: /Edited offline Traditional/ })).toBeVisible();
    expect(await cold.evaluate(() => caches.has("unrelated-app-cache"))).toBe(true);
    await cold.goto(songUrl);
    await expect(cold.locator(".song-page__title")).toHaveText("Edited offline");
    await cold.goto(`${fixture.url}settings?section=offline`);
    await cold.getByText("Technical details", { exact: true }).click();
    await expect(cold.getByText("Ready to open offline", { exact: true })).toBeVisible();
    await cold.screenshot({ path: "reports/pwa/production-settings.png", fullPage: true });
    await cold.close();
  } finally {
    await context.setOffline(false);
    await fixture.close();
  }
});

test("an interrupted update leaves the previous app and songs usable offline", async ({ page, context }) => {
  test.skip(!process.env.PLAYWRIGHT_URL, "Requires a completed production build.");
  const fixture = await createUpgradeServer({ base: process.env.VITE_BASE_PATH || "/" });
  try {
    await page.goto(fixture.url);
    await page.getByRole("button", { name: "Add Demo Song" }).click();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    fixture.upgrade({ failDownload: true });
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.ready).update();
    });
    await expect(page.getByRole("alert")).toContainText("App download failed");
    await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.ready).waiting)).toBe(false);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(2);
    await expect(page.locator('meta[name="gigdex-test-deployment"]')).toHaveAttribute("content", "A");
    await context.setOffline(false);
    fixture.upgrade();
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.ready).update();
    });
    await expect(page.getByRole("button", { name: "Update and restart" })).toBeVisible();
    await page.getByRole("button", { name: "Update and restart" }).click();
    await expect(page.locator('meta[name="gigdex-test-deployment"]')).toHaveAttribute("content", "B");
    await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(2);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.close();
  } finally {
    await context.setOffline(false);
    await fixture.close();
  }
});

test("update shows progress and an already-updated worker can restart another idle tab", async ({ page, context }) => {
  test.skip(!process.env.PLAYWRIGHT_URL, "Requires a completed production build.");
  const fixture = await createUpgradeServer({ base: process.env.VITE_BASE_PATH || "/" });
  try {
    // Make the activation interval observable without mocking the service worker lifecycle.
    await page.addInitScript(() => {
      const postMessage = ServiceWorker.prototype.postMessage;
      ServiceWorker.prototype.postMessage = function (message) {
        if (message?.type === "SKIP_WAITING") {
          setTimeout(() => postMessage.call(this, message), 500);
        } else postMessage.call(this, message);
      };
    });
    await page.goto(fixture.url);
    await page.getByRole("button", { name: "Add Demo Song" }).click();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const other = await context.newPage();
    await other.goto(fixture.url);
    await expect.poll(() => other.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    fixture.upgrade();
    await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
    await page.getByRole("button", { name: "Update and restart" }).click();
    await expect(page.getByRole("button", { name: "Updating…", exact: true })).toBeDisabled();
    await expect(page.locator('meta[name="gigdex-test-deployment"]')).toHaveAttribute("content", "B");
    await expect(page.getByRole("button", { name: "Update and restart" })).toHaveCount(0);
    // The worker is already active; this tab still has deployment A loaded.
    await expect(other.locator('meta[name="gigdex-test-deployment"]')).toHaveAttribute("content", "A");
    expect(await other.evaluate(async () => (await navigator.serviceWorker.ready).waiting)).toBeNull();
    await other.getByRole("button", { name: "Update and restart" }).click();
    await expect(other.locator('meta[name="gigdex-test-deployment"]')).toHaveAttribute("content", "B");
    await expect(other.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(2);
    await expect(other.getByRole("alert")).toHaveCount(0);
    await other.close();
    await page.close();
  } finally {
    await fixture.close();
  }
});
