import { expect, type Page, test } from "@playwright/test";
import { seedLibrary } from "./fixtures";

/** Read a setlist's entry settings straight from the app's database. */
const entries = (page: Page, base: string, setlistId: string) =>
  page.evaluate(
    async ({ base, setlistId }) => {
      const { getSetlist } = await import(`${base}src/db.ts`);
      const list = await getSetlist(setlistId);
      return { settings: list?.songSettings, lastModified: list?.lastModified };
    },
    { base, setlistId },
  );

test("changing a song's key rewrites its chords while setlists keep their sound", async ({ page }) => {
  const { songIds, setlistId } = await seedLibrary(page);
  // seedLibrary opens ./song/<id>, so the app base is one level up.
  const base = new URL("..", page.url()).pathname;
  // Harbor Lights (G) appears twice: once as written, once +2 (sounds A). Entries predate base keys.
  await page.evaluate(
    async ({ base, setlistId, songId }) => {
      const { updateSetlist, updateSong } = await import(`${base}src/db.ts`);
      await updateSetlist(setlistId, {
        songIds: [songId, songId],
        songSettings: [{ transpose: 0 }, { transpose: 2 }],
      });
      await updateSong(songId, { defaultTranspose: 2 });
    },
    { base, setlistId, songId: songIds[0] },
  );
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  // Unsaved text edits survive a key change.
  const lyrics = page.getByLabel("Lyrics with chords");
  await lyrics.fill(`${await lyrics.inputValue()}\n\nG\nAn extra rehearsal line`);

  const changeKey = page.getByLabel("Change key");
  await expect(changeKey.locator("option")).toHaveCount(12);
  await changeKey.selectOption({ label: "A (+2)" });
  await expect(page.getByLabel("Key", { exact: true })).toHaveValue("A");
  await expect(page.getByLabel("Standard transposition")).toHaveValue("0");
  await expect(page.locator(".song-page__key-message")).toContainText("up 2 semitones to A");
  await expect(lyrics).toHaveValue(/^A\s+D\s+A\nHarbor lights/m);
  await expect(lyrics).toHaveValue(/A\nAn extra rehearsal line/);
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.locator(".song-page__key")).toHaveText("A");
  await expect(page.locator(".song-view__content .chord").first()).toHaveText("A");
  await expect(page.locator(".song-view__content")).toContainText("An extra rehearsal line");
  // Legacy entries were pinned to the new key, so they still play G and A.
  const pinned = await entries(page, base, setlistId);
  expect(pinned.settings).toEqual([
    { transpose: -2, baseKey: "A" },
    { transpose: 0, baseKey: "A" },
  ]);
  await page.goto(`./setlist/${setlistId}`);
  const labels = page.locator(".setlists-page__song small").filter({ hasText: "|" });
  await expect(labels).toHaveText([/^G \| T-2 \| 72bpm/, /^A \| 72bpm/]);

  // A second change touches only the song: entries with a base key correct themselves.
  await page.goto(`./song/${songIds[0]}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Change key").selectOption({ label: "Bb (+1)" });
  await expect(page.getByLabel("Standard transposition")).toHaveValue("-1");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // The song is now written in Bb; its standard transposition keeps it sounding A.
  await expect(page.locator(".song-view__content .chord").first()).toHaveText("A");
  await page.getByTitle("Transpose up one semitone").click();
  await expect(page.locator(".song-page__key")).toHaveText("Bb");
  await expect(page.locator(".song-view__content .chord").first()).toHaveText("Bb");
  expect(await entries(page, base, setlistId)).toEqual(pinned);
  await page.goto(`./setlist/${setlistId}`);
  await expect(labels).toHaveText([/^G \| T-3 \| 72bpm/, /^A \| T-1 \| 72bpm/]);

  // The setlist entry plays in its own key on the song page and in print.
  await page.goto(`./song/${songIds[0]}?setlist=${setlistId}&occurrence=0`);
  await expect(page.locator(".song-view__content .chord").first()).toHaveText("G");
  await page.goto(`./print/setlist/${setlistId}`);
  await expect(page.locator(".print-song").nth(1).locator(".chord").first()).toHaveText("A");
});

test("change key needs a song key and can be reverted before saving", async ({ page }) => {
  const { songIds } = await seedLibrary(page);
  await page.goto(`./song/${songIds[0]}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const key = page.getByLabel("Key", { exact: true });
  await key.fill("");
  await expect(page.getByLabel("Change key")).toBeDisabled();
  await key.fill("G");
  await page.getByLabel("Change key").selectOption({ label: "E (−3)" });
  await expect(key).toHaveValue("E");
  await page.getByLabel("Change key").selectOption({ label: "G (+3)" });
  await expect(key).toHaveValue("G");
  await expect(page.locator(".song-page__key-message")).toHaveText("Chords are back in G.");
  await expect(page.getByLabel("Lyrics with chords")).toHaveValue(/^G\s+C\s+G\nHarbor lights/m);
});
