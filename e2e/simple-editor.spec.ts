import { expect, type Page, test } from "@playwright/test";

let base = "/";
test.beforeEach(async ({ page }) => {
  await page.goto("./");
  base = new URL(page.url()).pathname;
});
const addSong = (page: Page, content: string) =>
  page.evaluate(
    async ({ base, content }) => {
      const { addSong } = await import(`${base}src/db.ts`);
      return addSong({ title: "Fidelity fixture", artist: "Test", tags: [], content }) as Promise<string>;
    },
    { base, content },
  );
const storedContent = (page: Page, id: string) =>
  page.evaluate(
    async ({ base, id }) => {
      const { getSong } = await import(`${base}src/db.ts`);
      return ((await getSong(id)) as { content: string }).content;
    },
    { base, id },
  );

test("saving from the simple editor keeps chords, sections and directives", async ({ page }) => {
  const id = await addSong(
    page,
    "{title: Fidelity fixture}\n{key: C}\n\n{comment: Play softly}\n{start_of_chorus}\n[Cmaj7]Synthetic [Dsus2]hook\n{end_of_chorus}\n\n{chorus}\n\n[C]Bridge over [G]troubled water",
  );
  await page.goto(`./song/${id}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Simple", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".song-page__mode-note")).toHaveCount(0);
  await page.getByLabel("Title", { exact: true }).fill("Fidelity fixture edited");
  // Editing the lyrics makes the simple editor rebuild the ChordPro text.
  const lyrics = page.getByLabel("Lyrics with chords");
  await lyrics.fill(`${await lyrics.inputValue()}\nAn added line`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".song-page__title")).toHaveText("Fidelity fixture edited");
  const content = await storedContent(page, id);
  for (const expected of [
    "[Cmaj7]",
    "[Dsus2]",
    "{start_of_chorus: Chorus}",
    "{chorus}",
    "{comment: Play softly}",
    "[C]Bridge over [G]troubled water",
    "An added line",
  ])
    expect(content).toContain(expected);
});

test("songs the simple editor would change open in Advanced with an explanation", async ({ page }) => {
  const original = "{title: Fidelity fixture}\n[*Rit.]Slow [C]down";
  const id = await addSong(page, original);
  await page.goto(`./song/${id}?edit=true`);
  await expect(page.getByRole("button", { name: "Advanced (ChordPro)", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".song-page__mode-note")).toContainText("annotations such as [*Rit.]");
  await page.getByRole("button", { name: "Simple", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Saving from Simple will change");
  await page.getByRole("button", { name: "Advanced (ChordPro)", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(await storedContent(page, id)).toContain("[*Rit.]Slow [C]down");
});
