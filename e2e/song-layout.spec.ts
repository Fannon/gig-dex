import { expect, type Page, test } from "@playwright/test";
import { syntheticSongs } from "../scripts/song-layout-fixtures.mjs";

async function openSong(page: Page, content: string, title = "Layout test") {
  await page.goto("./song/new");
  await page.locator('input[placeholder="Song title"]').fill(title);
  await page.getByRole("button", { name: "Advanced (ChordPro)" }).click();
  await page.locator("#advanced-content").fill(content);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".song-view")).toHaveAttribute("data-layout", /fit|scroll/);
}

async function expectScreenFit(page: Page) {
  await expect(page.locator(".song-view")).toHaveAttribute("data-layout", "fit");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const content = document.querySelector<HTMLElement>(".song-view__content");
        if (!content) return false;
        const bounds = content.getBoundingClientRect();
        const rows = Array.from(content.querySelectorAll<HTMLElement>("table.row"));
        return (
          rows.length > 0 &&
          rows.every((row) => {
            const rects = Array.from(row.getClientRects());
            return (
              rects.length === 1 &&
              rects.every(
                (r) =>
                  r.left >= bounds.left - 1 &&
                  r.right <= bounds.right + 1 &&
                  r.top >= bounds.top - 1 &&
                  r.bottom <= bounds.bottom + 1,
              )
            );
          }) &&
          document.documentElement.scrollHeight <= innerHeight + 1 &&
          document.documentElement.scrollWidth <= innerWidth + 1
        );
      }),
    )
    .toBe(true);
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "phone", width: 390, height: 844 },
  { name: "landscape", width: 844, height: 390 },
]) {
  test(`short song fits ${viewport.name} with intact chord/lyric pairs`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await openSong(page, syntheticSongs[0].content);
    await expectScreenFit(page);
    const groups = await page.locator(".song-view__control-group").evaluateAll((groups) =>
      groups.map((g) => {
        const bounds = g.getBoundingClientRect();
        return Array.from(g.children).every((child) => child.getBoundingClientRect().right <= bounds.right + 1);
      }),
    );
    expect(groups.every(Boolean)).toBe(true);
    await info.attach("song-layout", { body: await page.screenshot(), contentType: "image/png" });
  });
}

test("chooses multiple columns, preserves section labels and refits after controls and resizing", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSong(page, `{key: C}\n${syntheticSongs[1].content}`);
  await expectScreenFit(page);
  expect(
    await page.locator(".song-view__content").evaluate((el) => Number(getComputedStyle(el).columnCount)),
  ).toBeGreaterThan(1);
  const labelsAttached = await page.locator("table.row:has(.label)").evaluateAll((labels) =>
    labels.every((label) => {
      const next = label.nextElementSibling;
      return next && Math.abs(label.getBoundingClientRect().left - next.getBoundingClientRect().left) < 1;
    }),
  );
  expect(labelsAttached).toBe(true);
  await page.getByRole("button", { name: "+1", exact: true }).click();
  await page.getByRole("button", { name: "I-V", exact: true }).click();
  await expectScreenFit(page);
  await page.getByText("Chords", { exact: true }).click();
  await expect(page.locator(".song-view__content .chord").first()).toBeHidden();
  await expectScreenFit(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expectScreenFit(page);
  await page.getByRole("button", { name: "A+", exact: true }).click();
  await expect(page.getByRole("button", { name: "Auto", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Auto", exact: true }).click();
  await expectScreenFit(page);
  await info.attach("song-layout", { body: await page.screenshot(), contentType: "image/png" });
});

test("splits an oversized section between complete lines", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSong(page, syntheticSongs[2].content);
  await expectScreenFit(page);
  await expect
    .poll(() => page.locator(".song-view__content tr:has(.lyrics)").allTextContents())
    .toEqual(Array.from({ length: 32 }, (_, i) => `Line ${i + 1}, the rhythm carries on`));
  expect(
    await page.locator(".song-view__content").evaluate((el) => Number(getComputedStyle(el).columnCount)),
  ).toBeGreaterThan(1);
});

test("makes every line reachable when a song cannot fit or manual text is too large", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSong(page, syntheticSongs[4].content);
  await expect(page.locator(".song-view")).toHaveAttribute("data-layout", "scroll");
  const wrapper = page.locator(".song-view__wrapper");
  await expect(wrapper).toHaveCSS("overflow", "auto");
  await wrapper.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.scrollLeft = el.scrollWidth;
  });
  await expect(page.locator(".song-view__content .reading-line").last()).toBeInViewport();
  await info.attach("scroll-fallback", { body: await page.screenshot(), contentType: "image/png" });
});

test("cancel restores saved content, and clearing simple lyrics does not restore old lyrics", async ({ page }) => {
  await openSong(page, "[C]Original lyrics", "Saved title");
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator('input[placeholder="Song title"]').fill("Unsaved title");
  await page.locator("textarea").fill("Changed lyrics");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".song-page__title")).toHaveText("Saved title");
  await expect(page.locator(".song-view__content")).toContainText("Original lyrics");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator("textarea").fill("");
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("title and content");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("textarea")).toBeVisible();
});

test("preserves extended metadata across editor mode switches and saving", async ({ page }) => {
  await openSong(page, "{composer: Test Composer}\n{copyright: Test Copyright}\n[C]Original lyrics");
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Advanced (ChordPro)" }).click();
  await expect(page.locator("textarea")).toHaveValue(/\{composer: Test Composer\}/);
  await expect(page.locator("textarea")).toHaveValue(/\{copyright: Test Copyright\}/);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Advanced (ChordPro)" }).click();
  await expect(page.locator("textarea")).toHaveValue(/\{copyright: Test Copyright\}/);
});

test("keeps malformed songs readable and lets the editor repair them", async ({ page }) => {
  await openSong(page, "{composer: Test Composer}\nBroken [C\ntext");
  await expect(page.getByRole("alert")).toContainText("invalid ChordPro");
  await expect(page.locator(".song-view__raw")).toContainText("Broken [C");
  await page.getByRole("button", { name: "+1", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator("textarea").fill("{composer: Test Composer}\n[C]Repaired text");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expectScreenFit(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".song-view__content")).toContainText("Repaired text");
});

test("wraps wide phone lyrics at word boundaries with all chords preserved and remembers minimum font", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const line =
    "[C]Follow the lantern across the harbor with a mid[G]word change and [Am]many more words until the [F]last light";
  const lyrics = "Follow the lantern across the harbor with a midword change and many more words until the last light";
  await openSong(
    page,
    `${Array.from({ length: 24 }, () => line).join("\n")}\n[C]Final reachable line`,
    "Phone reading",
  );
  await expect(page.locator(".song-view")).toHaveAttribute("data-layout", "scroll");
  const wrapper = page.locator(".song-view__wrapper");
  await expect(page.getByLabel("Wrap lines")).toBeChecked();
  await expect.poll(() => wrapper.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const rendered = await page.locator(".reading-line").first().locator(".lyrics").allTextContents();
  expect(rendered.join("")).toBe(lyrics);
  expect((await page.locator(".reading-line").first().locator(".chord").allTextContents()).filter(Boolean)).toEqual([
    "C",
    "G",
    "Am",
    "F",
  ]);
  const midword = page.locator(".chord-word").filter({ hasText: "midGword" }).first();
  await expect(midword).toBeVisible();
  await page.getByLabel("Wrap lines").uncheck();
  await expect(page.locator(".reading-line")).toHaveCount(0);
  await expect.poll(() => wrapper.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await page.getByLabel("Wrap lines").check();
  const songUrl = page.url();
  await expect(page.getByLabel("Minimum font", { exact: true })).toHaveCount(0);
  await expect(page.locator(".song-view__layout-status")).toHaveCount(0);
  await page.goto("./settings");
  await page.getByLabel("Minimum font", { exact: true }).selectOption("20");
  await page.reload();
  await expect(page.getByLabel("Minimum font", { exact: true })).toHaveValue("20");
  await page.goto(songUrl);
  await expect(page.locator(".song-view__value").nth(1)).toHaveText("20px");
  await wrapper.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByText("Final ", { exact: true })).toBeInViewport();
  await info.attach("phone-wrapped-reading", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

test("reuses fitting results for unchanged geometry and checks literal tab blocks", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSong(page, syntheticSongs[1].content);
  await expectScreenFit(page);
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  const runs = await page.locator(".song-view__content").getAttribute("data-fit-runs");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("resize"));
  });
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  await expect(page.locator(".song-view__content")).toHaveAttribute("data-fit-runs", runs ?? "");
  await page.goto("./song/new");
  await page.locator('input[placeholder="Song title"]').fill("Tab block");
  await page.getByRole("button", { name: "Advanced (ChordPro)" }).click();
  await page.locator("#advanced-content").fill(`{start_of_tab}\n${"Original tab notation ".repeat(50)}\n{end_of_tab}`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".song-view")).toHaveAttribute("data-layout", "scroll");
});
