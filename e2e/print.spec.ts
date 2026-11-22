import { expect, test } from "@playwright/test";
import { seedLibrary } from "./fixtures";

test("print a song in the key shown, without app chrome", async ({ page }) => {
  const { songIds } = await seedLibrary(page);
  await page.getByTitle("Transpose up one semitone").click();
  await page.getByRole("link", { name: "Print", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/print/song/${songIds[0]}\\?transpose=1`));
  await expect(page).toHaveTitle("Harbor Lights");
  const paper = page.getByRole("main", { name: "Print preview" });
  await expect(paper.getByRole("heading", { name: "Harbor Lights" })).toBeVisible();
  await expect(paper.locator(".print-song__meta")).toHaveText("Fixture Band · Key G# · Transposed +1 from G · 72 BPM");
  await expect(paper.locator(".chord").first()).toHaveText("G#");
  await page.getByLabel("Key").selectOption("Original key");
  await expect(paper.locator(".print-song__meta")).toHaveText("Fixture Band · Key G · 72 BPM");
  await expect(paper.locator(".chord").first()).toHaveText("G");
  await page.getByLabel("Key").selectOption("As transposed");
  await expect(paper.locator(".chord").first()).toHaveText("G#");
  await expect(page.locator(".library-sidebar, .workspace-topbar")).toHaveCount(0);

  await page.getByLabel("Chords").uncheck();
  await expect(paper.locator(".chord").first()).toBeHidden();
  await expect(paper.getByText("Harbor")).not.toHaveCount(0);

  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("toolbar", { name: "Print options" })).toBeHidden();
  await expect(paper.getByRole("heading", { name: "Harbor Lights" })).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await page.getByLabel("Chords").check();

  await page.getByRole("link", { name: "← Back" }).click();
  await expect(page).toHaveURL(new RegExp(`/song/${songIds[0]}$`));
});

test("print a setlist with its song list and per-entry keys", async ({ page }) => {
  const { setlistId } = await seedLibrary(page);
  await page.goto("./");
  await page.evaluate(
    async ({ base, setlistId }) => {
      const { updateSetlist } = await import(`${base}src/db.ts`);
      await updateSetlist(setlistId, { songSettings: [{ transpose: 2 }, { transpose: 0 }] });
    },
    { base: new URL(".", page.url()).pathname, setlistId },
  );
  await page.goto(`./setlist/${setlistId}`);
  await page.getByRole("link", { name: "Print", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/print/setlist/${setlistId}$`));
  await expect(page).toHaveTitle("Fixture Gig");

  const list = page.getByRole("region", { name: "Song list" });
  await expect(list.getByRole("heading", { name: "Fixture Gig" })).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveText([
    /Harbor Lights\s*Key A · Transposed \+2 from G · 72 BPM/,
    /Mountain Road\s*Key C · 110 BPM · 3\/4/,
  ]);
  const songs = page.locator(".print-song");
  await expect(songs).toHaveCount(2);
  await expect(songs.nth(0).locator(".print-song__header h2")).toHaveText("1. Harbor Lights");
  await expect(songs.nth(0).locator(".chord").first()).toHaveText("A");
  await expect(songs.nth(1).locator(".print-song__header h2")).toHaveText("2. Mountain Road");
  // The preview shows one sheet per printed page: the song list, then each song.
  const sheets = page.locator(".print-page__sheet");
  await expect(sheets).toHaveCount(3);
  const pdf = async () => {
    // Honour the page's @page rule the way the print dialog does.
    const file = (await page.pdf({ format: "A4", preferCSSPageSize: true })).toString("latin1");
    expect(file.startsWith("%PDF")).toBe(true);
    const [, width, height] = /MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)/.exec(file) ?? [];
    return { width: Number(width), height: Number(height), pages: file.match(/\/Type\s*\/Page(?!s)/g)?.length };
  };
  await page.emulateMedia({ media: "print" });
  await expect(sheets.nth(0)).toHaveCSS("break-before", "auto");
  await expect(sheets.nth(1)).toHaveCSS("break-before", "page");
  await expect(sheets.nth(2)).toHaveCSS("break-before", "page");
  await page.screenshot({ path: "reports/print/setlist.png", fullPage: true });
  const portrait = await pdf();
  expect(portrait.pages).toBe(3);
  expect(portrait.height).toBeGreaterThan(portrait.width);
  await page.emulateMedia({ media: "screen" });

  await page.getByLabel("Song list page").selectOption("Only the song list");
  await expect(songs).toHaveCount(0);
  await expect(list).toBeVisible();
  await page.getByLabel("Song list page").selectOption("Leave out");
  await expect(list).toHaveCount(0);
  await expect(sheets).toHaveCount(2);
  await page.emulateMedia({ media: "print" });
  await expect(songs.nth(0)).toHaveCSS("break-before", "auto");
  await expect(songs.nth(1)).toHaveCSS("break-before", "page");
  expect((await pdf()).pages).toBe(2);
  await page.emulateMedia({ media: "screen" });

  // Preferences are remembered for the next print.
  await page.reload();
  await expect(page.getByLabel("Song list page")).toHaveValue("songs");

  await page.emulateMedia({ media: "screen" });
  await page.getByLabel("Orientation").selectOption("landscape");
  const sheet = await sheets.first().boundingBox();
  // A4 landscape is 297mm (about 1123px) wide on screen, portrait 210mm (about 794px).
  expect(sheet?.width).toBeGreaterThan(1000);
  const landscape = await pdf();
  expect(landscape.width).toBeGreaterThan(landscape.height);
  await page.reload();
  await expect(page.getByLabel("Orientation")).toHaveValue("landscape");
});

test("print options show comments and set columns, text size and margins", async ({ page }) => {
  await page.goto("./");
  const songId = await page.evaluate(async (base) => {
    const { addSong } = await import(`${base}src/db.ts`);
    return addSong({
      title: "Comment Fixture",
      artist: "Test",
      tags: [],
      content:
        "{title: Comment Fixture}\n{comment: Standalone tip}\n\n{start_of_verse: Verse 1}\n[G]Hello\n{comment: Inline tip}\n[C]World\n{end_of_verse}",
    });
  }, new URL(page.url()).pathname);
  await page.goto(`./print/song/${songId}`);
  const paper = page.getByRole("main", { name: "Print preview" });
  // Comments, such as performance notes, are left out by default.
  await expect(paper.getByText("Standalone tip")).toBeHidden();
  await expect(paper.getByText("Inline tip")).toBeHidden();
  // The paragraph that only held a comment leaves no gap; lyrics and labels stay.
  await expect(paper.locator(".paragraph:visible")).toHaveCount(1);
  await expect(paper.locator(".print-song__body")).toHaveCSS("column-count", "2");
  const sheet = paper.locator(".print-page__sheet");
  await expect(sheet).toHaveCSS("padding-left", /^37\.7/); // 10mm

  await page.getByLabel("Comments").check();
  await expect(paper.getByText("Standalone tip")).toBeVisible();
  await expect(paper.getByText("Inline tip")).toBeVisible();
  await expect(paper.locator(".paragraph:visible")).toHaveCount(2);
  await expect(paper.getByText("Verse 1")).toBeVisible();
  await expect(paper.getByText("World")).toBeVisible();

  await page.getByLabel("Columns").selectOption("4");
  await expect(paper.locator(".print-song__body")).toHaveCSS("column-count", "4");
  await page.getByLabel("Text size").selectOption("18");
  await expect(page.locator(".print-page")).toHaveCSS("font-size", "24px"); // 18pt
  await page.getByLabel("Margins").selectOption("25");
  // 25mm at 96dpi.
  await expect(sheet).toHaveCSS("padding-left", /^94\.4/);
  await page.emulateMedia({ media: "print" });
  await expect(sheet).toHaveCSS("padding-left", "0px");
  // The printed margin comes from the page's @page rule.
  expect(await page.locator(".print-page > style").evaluate((style) => style.textContent)).toBe(
    "@page { size: A4 portrait; margin: 25mm; }",
  );

  await page.emulateMedia({ media: "screen" });
  await page.reload();
  await expect(page.getByLabel("Comments")).toBeChecked();
  await expect(page.getByLabel("Text size")).toHaveValue("18");
  await expect(page.getByLabel("Margins")).toHaveValue("25");
  await expect(page.getByLabel("Columns")).toHaveValue("4");
});

test("the preview shows how many pages each sheet needs", async ({ page }) => {
  await page.goto("./");
  const songId = await page.evaluate(async (base) => {
    const { addSong } = await import(`${base}src/db.ts`);
    const verses = Array.from(
      { length: 12 },
      (_, verse) =>
        `{start_of_verse: Verse ${verse + 1}}\n${Array.from({ length: 4 }, (_, line) => `[G]Long song verse ${verse + 1} line ${line + 1} [C]keeps on [D]going`).join("\n")}\n{end_of_verse}`,
    ).join("\n\n");
    return addSong({ title: "Long Fixture", artist: "Test", tags: [], content: `{title: Long Fixture}\n\n${verses}` });
  }, new URL(page.url()).pathname);
  await page.goto(`./print/song/${songId}`);
  const sheet = page.locator(".print-song");
  // The preview's page count matches the browser's real pagination.
  const pdfPages = async () => {
    await page.emulateMedia({ media: "print" });
    const file = (await page.pdf({ preferCSSPageSize: true })).toString("latin1");
    await page.emulateMedia({ media: "screen" });
    return file.match(/\/Type\s*\/Page(?!s)/g)?.length;
  };
  const shownPages = async () => {
    const text = await sheet.locator(".print-page__count").innerText();
    return text === "Fits on 1 page" ? 1 : Number.parseInt(text, 10);
  };
  await page.getByLabel("Columns").selectOption("1");
  await page.getByLabel("Text size").selectOption("14");
  await expect(sheet.locator(".print-page__count")).toHaveText(/^[2-9] pages$/);
  await expect(sheet.locator(".print-page__break").first()).toHaveAttribute("data-page", "2");
  await expect.poll(shownPages).toBe(await pdfPages());
  await page.getByLabel("Text size").selectOption("24");
  await expect(sheet.locator(".print-page__count")).not.toHaveText("Fits on 1 page");
  await expect.poll(shownPages).toBe(await pdfPages());
  await page.getByLabel("Columns").selectOption("2");
  await page.getByLabel("Text size").selectOption("12");
  await expect(sheet.locator(".print-page__break")).toHaveCount(0);
  await expect.poll(shownPages).toBe(await pdfPages());

  // Smaller text in more columns fits the song on one page; break lines only make sense in one column.
  await page.getByLabel("Columns").selectOption("3");
  await page.getByLabel("Text size").selectOption("9");
  await expect(sheet.locator(".print-page__count")).toHaveText("Fits on 1 page");
  await expect(sheet.locator(".print-page__break")).toHaveCount(0);
  expect(await pdfPages()).toBe(1);

  // On a phone the sheet keeps its paper width and is scaled down to fit.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await sheet.boundingBox())?.width ?? 0).toBeLessThanOrEqual(390);
  expect(await sheet.evaluate((element) => element.offsetWidth)).toBeGreaterThan(780); // 210mm
  await expect(sheet.locator(".print-page__count")).toHaveText("Fits on 1 page");

  await page.emulateMedia({ media: "print" });
  await expect(sheet.locator(".print-page__count")).toBeHidden();
});

test("auto text size fits each song on one page", async ({ page }) => {
  await page.goto("./");
  const ids = await page.evaluate(async (base) => {
    const { addSong, addSetlist } = await import(`${base}src/db.ts`);
    const song = (title: string, verses: number) =>
      addSong({
        title,
        artist: "Test",
        tags: [],
        content: `{title: ${title}}\n\n${Array.from(
          { length: verses },
          (_, verse) =>
            `{start_of_verse: Verse ${verse + 1}}\n${Array.from({ length: 4 }, (_, line) => `[G]Verse ${verse + 1} line ${line + 1} [C]keeps on [D]going`).join("\n")}\n{end_of_verse}`,
        ).join("\n\n")}`,
      });
    const songIds = [await song("Short Fixture", 2), await song("Long Fixture", 8), await song("Huge Fixture", 120)];
    return { songIds, setlistId: await addSetlist({ name: "Auto Gig", songIds, tags: [] }) };
  }, new URL(page.url()).pathname);
  await page.goto(`./print/setlist/${ids.setlistId}`);
  await page.getByLabel("Song list page").selectOption("Leave out");
  await page.getByLabel("Text size").selectOption("Auto (fit 1 page)");
  const count = (title: string) => page.getByRole("region", { name: title }).locator(".print-page__count");
  await expect(count("Short Fixture")).toHaveText("Fits on 1 page at 18 pt");
  await expect(count("Long Fixture")).toHaveText(/^Fits on 1 page at (9|10|11|12|13|14|16) pt$/);
  await expect(count("Huge Fixture")).toHaveText(/^[2-9] pages at 8 pt$/);
  const sizes = await page
    .locator(".print-song")
    .evaluateAll((sheets) => sheets.map((sheet) => getComputedStyle(sheet).fontSize));
  expect(new Set(sizes).size).toBe(3);

  // Short and long songs each take exactly one printed page; the huge one needs the rest.
  const huge = Number.parseInt(await count("Huge Fixture").innerText(), 10);
  await page.emulateMedia({ media: "print" });
  const file = (await page.pdf({ preferCSSPageSize: true })).toString("latin1");
  expect(file.match(/\/Type\s*\/Page(?!s)/g)?.length).toBe(2 + huge);
  await page.emulateMedia({ media: "screen" });

  await page.reload();
  await expect(page.getByLabel("Text size")).toHaveValue("auto");
  await page.getByLabel("Text size").selectOption("11");
  await expect(count("Short Fixture")).toHaveText("Fits on 1 page");
  await expect(page.locator(".print-song").first()).toHaveCSS("font-size", /^14\.6/); // 11pt
});
