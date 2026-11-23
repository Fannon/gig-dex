import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { textContrast } from "./fixtures";

for (const theme of ["black", "violet", "light"])
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 320, height: 720 },
    { width: 390, height: 844 },
  ]) {
    test(`Settings text and Dropbox setup stay readable in ${theme} at ${viewport.width}px`, async ({ page }) => {
      await mkdir("reports/settings", { recursive: true });
      await page.setViewportSize(viewport);
      await page.goto("./settings");
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      const navigation = page.getByRole("navigation", { name: "Settings sections", exact: true });
      for (const button of await navigation.getByRole("button").all())
        await expect(button).toBeInViewport({ ratio: 1 });
      for (const section of ["Sync", "Appearance", "Library", "Offline", "About"]) {
        const tab = page.getByRole("button", { name: section, exact: true });
        await tab.click();
        await expect(tab).toHaveAttribute("aria-current", "page");
        if (section === "Sync") {
          const configuration = page.locator("#sync-dropbox-settings");
          if (!(await configuration.evaluate((element) => (element as HTMLDetailsElement).open)))
            await page.getByRole("button", { name: "Set up Dropbox", exact: true }).click();
          await expect(page.getByRole("heading", { name: "1. Create your Dropbox app", exact: true })).toBeVisible();
          await page.getByLabel("Dropbox app key", { exact: true }).fill("invalid");
          await page.getByRole("button", { name: "Save app key", exact: true }).click();
          await expect(configuration.getByRole("alert")).toContainText("Enter a Dropbox app key");
          const errorContrast = await textContrast(configuration.getByRole("alert"));
          expect(errorContrast.ratio, JSON.stringify(errorContrast)).toBeGreaterThanOrEqual(4.5);
        }
        const text = page.locator(
          ".settings-page :is(h1, h2, h3, h4, p, label, small, summary, a, output, button:not(:disabled), select, input:not([type]))",
        );
        for (const element of await text.all()) {
          if (!(await element.isVisible())) continue;
          const result = await textContrast(element);
          expect(result.ratio, JSON.stringify(result)).toBeGreaterThanOrEqual(4.5);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.locator(".app-route").evaluate((element) => {
          element.scrollTop = 0;
        });
        await page.screenshot({
          path: `reports/settings/${section.toLowerCase()}-${theme}-${viewport.width}.png`,
          fullPage: true,
        });
      }
    });
  }
