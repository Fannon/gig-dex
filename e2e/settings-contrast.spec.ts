import { mkdir } from "node:fs/promises";
import { expect, type Locator, test } from "@playwright/test";

async function textContrast(locator: Locator) {
  return locator.evaluate((element) => {
    const rgba = (value: string) => {
      const channels = (value.match(/[\d.]+/g) ?? []).map(Number);
      return [channels[0], channels[1], channels[2], channels[3] ?? 1];
    };
    const blend = (front: number[], back: number[]) =>
      front.slice(0, 3).map((channel, index) => channel * front[3] + back[index] * (1 - front[3]));
    const ancestors: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node);
    let background = [255, 255, 255];
    for (const ancestor of ancestors) background = blend(rgba(getComputedStyle(ancestor).backgroundColor), background);
    const foreground = blend(rgba(getComputedStyle(element).color), background);
    const luminance = (channels: number[]) => {
      const [r, g, b] = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const values = [luminance(foreground), luminance(background)];
    return {
      text: element.textContent?.trim().slice(0, 80),
      ratio: (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05),
    };
  });
}

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
