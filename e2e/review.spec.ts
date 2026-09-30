import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("song editing preserves pending tags and discards cancelled tag drafts", async ({ page }) => {
  await page.goto("./song/new");
  await page.getByLabel("Title", { exact: true }).fill("  Review song  ");
  await page.getByLabel("Lyrics with chords").fill("[C]Synthetic review line");
  await page.getByLabel("Tags", { exact: true }).fill("acoustic");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".song-page__title")).toHaveText("Review song");
  await expect(page.locator(".song-page__tag-inline")).toHaveText("acoustic");
  await page.reload();
  await expect(page.locator(".song-page__tag-inline")).toHaveText("acoustic");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Tags", { exact: true }).fill("discard me");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Tags", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Remove tag acoustic", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".song-page__title")).toHaveText("Review song");
  await page.reload();
  await expect(page.locator(".song-page__title")).toHaveText("Review song");
  await expect(page.locator(".song-page__tag-inline")).toHaveCount(0);
});

test("editor validates title and tempo and exposes keyboard controls", async ({ page }) => {
  await page.goto("./song/new");
  await page.getByLabel("Title", { exact: true }).fill("   ");
  await page.getByLabel("Lyrics with chords").fill("[C]Synthetic review line");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Please enter a title and content.");
  await page.getByLabel("Title", { exact: true }).fill("Review song");
  for (const tempo of ["-1", "301", "120.5"]) {
    await page.getByLabel("Tempo (BPM)").fill(tempo);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Tempo must be a whole number");
    await expect(page.getByLabel("Lyrics with chords")).toHaveValue("[C]Synthetic review line");
  }
  await page.getByLabel("Tempo (BPM)").fill("120");
  const separator = page.getByRole("separator", { name: "Resize editor and preview" });
  await separator.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => Number(await separator.getAttribute("aria-valuenow"))).toBeCloseTo(55);
  await page.keyboard.press("Home");
  await expect(separator).toHaveAttribute("aria-valuenow", "20");
  await page.keyboard.press("End");
  await expect(separator).toHaveAttribute("aria-valuenow", "80");
  await expect(page.getByRole("button", { name: "Simple", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".song-page__title")).toHaveText("Review song");
});

test("pasted ChordPro metadata survives saving without overriding later form edits", async ({ page }) => {
  await page.goto("./song/new");
  await page.getByLabel("Title", { exact: true }).fill("Fallback title");
  await page.getByRole("button", { name: "Advanced (ChordPro)", exact: true }).click();
  const content = "{title: Pasted title}\n{artist: Review band}\n{key: C}\n{tempo: 90}\n[C]Synthetic review line";
  await page.locator("#advanced-content").fill(content);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Pasted title");
  await expect(page.getByLabel("Key", { exact: true })).toHaveValue("C");
  await expect(page.getByLabel("Tempo (BPM)")).toHaveValue("90");
  await page.getByLabel("Title", { exact: true }).fill("Revised title");
  await page.locator("#advanced-content").fill(`${content}\n[G]Another review line`);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Revised title");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".song-page__title")).toHaveText("Revised title");
  await page.reload();
  await expect(page.locator(".song-page__key")).toHaveText("C");
  await expect(page.locator(".tempo-indicator__label")).toHaveText("90bpm");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Advanced (ChordPro)", exact: true }).click();
  await expect(page.locator("#advanced-content")).toHaveValue(/\{title: Revised title\}/);
  await expect(page.getByLabel("Artist", { exact: true })).toHaveValue("Review band");
});

test("song overview searches alternative titles and tags consistently with the sidebar", async ({ page }) => {
  await page.goto("./");
  await page.evaluate(async (base) => {
    const { addSong } = await import(`${base}src/db.ts`);
    await addSong({
      title: "Review song",
      subtitle: "Hidden alias",
      artist: "Band",
      tags: ["acoustic"],
      content: "[C]Review",
    });
    await addSong({ title: "Other song", artist: "Band", tags: ["electric"], content: "[G]Other" });
  }, new URL(page.url()).pathname);
  for (const query of ["hidden alias", "acoustic", "#ACOUSTIC"]) {
    await page.getByLabel("Search your songs").fill(query);
    await page.getByLabel("Search sidebar songs").fill(query);
    await expect(page.locator(".home-page__songs a")).toHaveText("Review songBand");
    await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(1);
  }
});

test("setlist navigation clamps invalid occurrences and reports modal save failures", async ({ page }) => {
  await page.goto("./");
  const ids = await page.evaluate(async (base) => {
    const { addSong, addSetlist } = await import(`${base}src/db.ts`);
    const song = await addSong({ title: "Review song", artist: "Band", tags: [], content: "[C]Review" });
    const first = await addSetlist({ name: "First set", songIds: [song] });
    const second = await addSetlist({ name: "Second set", songIds: [song] });
    return { first, second };
  }, new URL(page.url()).pathname);
  await page.goto(`./setlist/${ids.first}`);
  await expect(page.locator(".setlists-page__preview h2")).toHaveText("Review song");
  // Exercise client navigation so both sets share the same mounted workspace.
  await page.evaluate((id) => {
    history.pushState(null, "", `./${id}?song=99`);
    dispatchEvent(new PopStateEvent("popstate"));
  }, ids.second);
  await expect(page.locator(".setlists-page__content h2")).toHaveText("Second set");
  await expect(page.locator(".setlists-page__preview h2")).toHaveText("Review song");
  await page.getByRole("button", { name: "Edit details" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit setlist" });
  await dialog.getByLabel("Name", { exact: true }).fill("Unsaved name");
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "setlists") throw new DOMException("Storage full", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Could not save this change");
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("Unsaved name");
});

test("editor remains usable on phone and desktop across themes", async ({ page }) => {
  await mkdir("reports/final-review", { recursive: true });
  await page.goto("./");
  const id = await page.evaluate(async (base) => {
    const { addSong } = await import(`${base}src/db.ts`);
    return addSong({
      title: "Harbor rehearsal",
      artist: "Review band",
      tags: ["acoustic"],
      content: "{key: C}\n{start_of_verse: Verse}\n[C]Follow the lantern [G]down to the bay\n{end_of_verse}",
    });
  }, new URL(page.url()).pathname);
  for (const theme of ["black", "violet", "light"]) {
    await page.goto("./settings");
    await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`./song/${id}?edit=true`);
      await expect(page.getByLabel("Lyrics with chords")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (theme === "light") {
        const contrast = await page.getByLabel("Alternative title").evaluate((element) => {
          const luminance = (color: string) => {
            const [r, g, b] = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map((value) => {
              const channel = Number(value) / 255;
              return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const foreground = luminance(getComputedStyle(element, "::placeholder").color);
          const background = luminance(getComputedStyle(element).backgroundColor);
          return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
        });
        expect(contrast).toBeGreaterThanOrEqual(4.5);
        await expect(page.locator(".song-page__simple-preview > .label")).toHaveCSS("color", "rgb(80, 81, 93)");
        await expect(page.getByRole("button", { name: "Simple", exact: true })).toHaveCSS(
          "background-color",
          "rgb(103, 82, 169)",
        );
      }
      await page.screenshot({ path: `reports/final-review/editor-${theme}-${viewport.width}.png`, fullPage: true });
    }
  }
});

test("performance remains usable when reading preferences cannot be stored", async ({ page }) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === "performance_mode") throw new DOMException("Blocked", "SecurityError");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "performance_mode") throw new DOMException("Full", "QuotaExceededError");
      return set.call(this, key, value);
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page.getByRole("button", { name: "Add Demo Songs", exact: true }).click();
  await page.getByRole("link", { name: "Perform", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Amazing Grace", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Performance options", exact: true }).click();
  await page.getByLabel("Reading mode").selectOption("scroll");
  await expect(page.getByRole("dialog", { name: "Performance options" })).not.toBeVisible();
  await expect(page.locator(".song-view")).toHaveAttribute("data-layout", "scroll");
  await page.getByRole("button", { name: "Performance options", exact: true }).click();
  await expect(page.getByLabel("Reading mode")).toHaveValue("scroll");
  expect(errors).toEqual([]);
});

test("global reading preferences persist and update songs, previews and performance", async ({ page }) => {
  await page.goto("./");
  const ids = await page.evaluate(async (base) => {
    const { addSong, addSetlist } = await import(`${base}src/db.ts`);
    const song = await addSong({
      title: "Reading preferences",
      artist: "Review band",
      tags: [],
      content: `{key: C}\n${"[C]Synthetic [G]reading line\n".repeat(20)}`,
    });
    const list = await addSetlist({ name: "Reading set", songIds: [song] });
    return { song, list };
  }, new URL(page.url()).pathname);
  await page.goto("./settings");
  await page.getByLabel("Notation", { exact: true }).selectOption("nashville");
  await page.getByLabel("Columns", { exact: true }).selectOption("1");
  await page.reload();
  await expect(page.getByLabel("Notation", { exact: true })).toHaveValue("nashville");
  await expect(page.getByLabel("Columns", { exact: true })).toHaveValue("1");
  for (const route of [`song/${ids.song}`, `setlist/${ids.list}`, `perform/song/${ids.song}`]) {
    await page.goto(`./${route}`);
    await expect(page.locator(".song-view__content .chord").first()).toHaveText("1");
    await expect(page.locator(".song-view__content")).toHaveCSS("column-count", "1");
    await expect(page.getByRole("button", { name: "Std", exact: true })).toHaveCount(0);
  }
  const settings = await page.context().newPage();
  await settings.goto("./settings");
  await settings.getByLabel("Notation", { exact: true }).selectOption("roman");
  await expect(page.locator(".song-view__content .chord").first()).toHaveText("I");
  await settings.getByLabel("Columns", { exact: true }).selectOption("2");
  await settings.close();
  await expect
    .poll(() => page.locator(".song-view__content").evaluate((el) => Number(getComputedStyle(el).columnCount)))
    .toBeLessThanOrEqual(2);
});

test("mobile song controls stay compact and selected colors remain clear in every theme", async ({ page }, info) => {
  await mkdir("reports/final-review", { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.getByRole("button", { name: "Add Demo Songs", exact: true }).click();
  await expect(page.locator(".song-page__title")).toHaveText("Amazing Grace");
  const songUrl = page.url();
  for (const theme of ["black", "violet", "light"]) {
    await page.goto("./settings");
    await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    await expect(page.getByLabel("Notation", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `reports/final-review/reading-settings-${theme}-phone.png`, fullPage: true });
    await page.goto(songUrl);
    await expect(page.locator(".song-view")).toHaveAttribute("data-layout", /fit|scroll/);
    await expect(page.getByLabel("Notation", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Minimum font", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Song display options" })).toBeHidden();
    await page.screenshot({ path: `reports/final-review/song-${theme}-phone-collapsed.png` });
    await page.getByRole("button", { name: "Display options", exact: true }).click();
    const controls = await page.locator(".song-view__controls").boundingBox();
    expect(controls?.height).toBeLessThanOrEqual(110);
    expect((await page.getByRole("button", { name: "+1", exact: true }).boundingBox())?.height).toBeGreaterThanOrEqual(
      36,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (theme === "light") {
      await expect(page.getByRole("button", { name: "Auto", exact: true })).toHaveCSS(
        "background-color",
        "rgb(103, 82, 169)",
      );
      await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCSS("color", "rgb(166, 41, 41)");
    }
    await info.attach(`toolbar-${theme}`, { body: JSON.stringify(controls), contentType: "application/json" });
    await page.screenshot({ path: `reports/final-review/song-${theme}-phone.png` });
  }
});
