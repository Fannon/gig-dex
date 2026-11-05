import type { Page } from "@playwright/test";

/**
 * A small synthetic library for specs that need songs but do not test the
 * in-app demo songs. Keeping it separate lets the demo content change freely.
 */
export const FIXTURE_SONGS = [
  {
    title: "Harbor Lights",
    artist: "Fixture Band",
    key: "G",
    tempo: 72,
    tags: ["slow", "ballad"],
    content: `{title: Harbor Lights}
{artist: Fixture Band}
{key: G}
{tempo: 72}

{start_of_verse: Verse 1}
[G]Harbor lights are [C]glowing [G]bright
[G]Boats come home a[D]cross the [G]night
{end_of_verse}

{start_of_chorus: Chorus}
[C]Steady now, [G]steady [D]on
[C]Sing until the [D]night is [G]gone
{end_of_chorus}`,
  },
  {
    title: "Mountain Road",
    artist: "Fixture Band",
    key: "C",
    tempo: 110,
    time: "3/4",
    tags: ["waltz"],
    content: `{title: Mountain Road}
{artist: Fixture Band}
{key: C}
{tempo: 110}
{time: 3/4}

{start_of_verse: Verse 1}
[C]Up the mountain [F]road we [C]go
[Am]Singing high and [G]singing [C]low
{end_of_verse}

{start_of_verse: Instrumental}
[C] [F] [G] [C]
{end_of_verse}`,
  },
];

/** Seed the fixture library and a setlist through the app's database (dev server only), then open the first song. */
export async function seedLibrary(page: Page) {
  await page.goto("./");
  const ids = await page.evaluate(
    async ({ base, songs }) => {
      const { addSetlist, addSong } = await import(`${base}src/db.ts`);
      const songIds: string[] = [];
      for (const song of songs) songIds.push(await addSong(song));
      const setlistId: string = await addSetlist({ name: "Fixture Gig", songIds });
      return { songIds, setlistId };
    },
    { base: new URL(page.url()).pathname, songs: FIXTURE_SONGS },
  );
  await page.goto(`./song/${ids.songIds[0]}`);
  return ids;
}

/**
 * Production builds cannot import app modules, so add the demo songs through the UI.
 * Returns what was created so specs do not depend on the demo content.
 */
export async function addDemoSongs(page: Page) {
  await page.getByRole("button", { name: "Add demo songs", exact: true }).click();
  const title = await page.locator(".song-page__title").innerText();
  const count = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open("GigDexDB");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const counting = db.transaction("songs").objectStore("songs").count();
          counting.onerror = () => reject(counting.error);
          counting.onsuccess = () => {
            db.close();
            resolve(counting.result);
          };
        };
      }),
  );
  return { title, count };
}
