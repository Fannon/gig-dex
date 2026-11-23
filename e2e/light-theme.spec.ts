import { expect, test } from "@playwright/test";
import { textContrast } from "./fixtures";

test("themes are offered darkest first and the light theme keeps text readable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./settings");
  await expect(page.getByLabel("Theme", { exact: true }).locator("option")).toHaveText([
    "Pure black",
    "Dark violet",
    "Light",
  ]);
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  const { songId, setlistId } = await page.evaluate(
    async (base) => (await import(`${base}src/utils/demoSongs.ts`)).addDemoLibrary(),
    new URL(".", page.url()).pathname,
  );
  const readable = async (selectors: string[]) => {
    for (const selector of selectors) {
      const contrast = await textContrast(page.locator(selector).first());
      expect(contrast.ratio, `${selector}: ${JSON.stringify(contrast)}`).toBeGreaterThanOrEqual(4.5);
    }
  };

  await page.goto("./");
  await expect(page.locator(".home-page__songs li").first()).toBeVisible();
  await readable([".home-page__songs strong", ".home-page__song-artist", ".home-page__tags-list button"]);
  expect(await page.locator(".home-page__fab").evaluate((element) => getComputedStyle(element).color)).toBe(
    "rgb(255, 255, 255)",
  );

  await page.goto(`./song/${songId}`);
  await expect(page.locator(".song-view__content .chord").first()).toBeVisible();
  await readable([
    ".song-page__title",
    ".song-page__tag-inline",
    ".song-page__actions a.song-page__btn",
    ".song-view__content .lyrics",
    ".song-view__content .chord",
  ]);

  await page.goto(`./setlist/${setlistId}`);
  await expect(page.locator(".setlists-page__preview .song-view__content .chord").first()).toBeVisible();
  await readable([
    ".setlists-page__eyebrow",
    ".setlists-page__song-number",
    ".setlists-page__song-select small",
    ".setlists-page__perform",
    ".setlists-page__preview-header p",
  ]);
  await page.screenshot({ path: "reports/theme/light-setlists.png" });
});
