import { expect, test } from "@playwright/test";

test("offline settings distinguish local songs, storage protection, installation and backups", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    let granted = false;
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        persisted: async () => granted,
        persist: async () => {
          granted = true;
          return true;
        },
        estimate: async () => ({ usage: 1048576, quota: 104857600 }),
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.getByRole("button", { name: "Add Demo Song" }).click();
  await expect(page.locator(".song-page__title")).toHaveText("Amazing Grace");
  await page.goto("./settings?section=offline");
  const settings = page.getByRole("region", { name: "Offline app" });
  await settings.getByText("Technical details", { exact: true }).click();
  await expect(settings).toContainText("2 songs · 1 setlist stored on this device");
  await expect(settings).toContainText("1.0 MB of 100.0 MB");
  await settings.getByRole("button", { name: "Keep my library safe" }).click();
  await expect(settings).toContainText("Persistent storage granted");
  await page.evaluate(() => {
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => {
        document.documentElement.dataset.installPrompt = "shown";
      },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });
  await settings.getByRole("button", { name: "Install Gig-Dex" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-install-prompt", "shown");
  await expect(settings.getByRole("button", { name: "Install Gig-Dex" })).toHaveCount(0);
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Export library" }).click();
  await page.getByRole("button", { name: "Offline", exact: true }).click();
  await expect(settings).not.toContainText("No backup exported");
  await context.setOffline(true);
  await expect(settings).toContainText("Offline · cloud sync needs a connection");
  await expect(page.getByRole("complementary", { name: "App status" })).toContainText("Offline");
  await settings.getByText("Install on an Android tablet", { exact: true }).click();
  await page.evaluate(() => {
    const route = document.querySelector(".app-route");
    if (route) route.scrollTop = 0;
  });
  await page.screenshot({ path: "reports/pwa/settings-phone.png" });
  await settings.getByText("Refresh app files", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "reports/pwa/installation-phone.png" });
  await context.setOffline(false);
});

test("performance wake lock is remembered, retried and released on exit", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.addInitScript(() => {
    let requests = 0;
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async () => {
          requests++;
          document.documentElement.dataset.wakeRequests = String(requests);
          if (requests === 1) throw new Error("Device denied wake lock");
          const lock = new EventTarget();
          return Object.assign(lock, {
            release: async () => {
              document.documentElement.dataset.wakeReleased = "true";
              lock.dispatchEvent(new Event("release"));
            },
          });
        },
      },
    });
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Add Demo Song" }).click();
  await page.getByRole("link", { name: "Perform", exact: true }).click();
  await page.getByRole("button", { name: "Performance options", exact: true }).click();
  const toggle = page.getByRole("button", { name: "Keep screen awake" });
  await toggle.click();
  await expect(page.getByText("Screen: Unavailable — tap Retry")).toBeVisible();
  await page.getByRole("button", { name: "Retry wake lock" }).click();
  await expect(page.getByText("Screen: Active")).toBeVisible();
  await page.screenshot({ path: "reports/pwa/performance-tablet.png" });
  await page.getByRole("button", { name: "Close performance options" }).click();
  await page.getByRole("link", { name: "← Exit" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-wake-released", "true");
  await page.getByRole("link", { name: "Perform", exact: true }).click();
  await page.getByRole("button", { name: "Performance options", exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Screen: Active")).toBeVisible();
});

test("a failed route download shows a recovery view with the library preserved", async ({ page, context }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Add Demo Song" }).click();
  await context.route("**/src/pages/SettingsPage.tsx*", (route) => route.abort());
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "This view couldn’t load" })).toBeVisible();
  await page.getByRole("link", { name: "Go to your library" }).click();
  await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(2);
});
