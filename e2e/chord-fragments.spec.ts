import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`empty lyric fragments keep chords above lyrics in the ${viewport.name} setlist preview`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("./");
    const setlist = await page.evaluate(async () => {
      const base = new URL(".", location.href).pathname;
      const { addSong, addSetlist } = await import(`${base}src/db.ts`);
      const song = await addSong({
        title: "Chord fragment alignment",
        tags: [],
        content: [
          "{start_of_chorus: Chorus}",
          "[C] Follow the [Am7]lantern [D]home[G]",
          "[C][Am7]Carry the [D]light",
          "[C]Follow [Am7] the [D]light",
          "[C] Follow the lantern across the harbor until the [Am7]last light [D]shines[G]",
          "[C][Am7][D]",
          "{end_of_chorus}",
        ].join("\n"),
      });
      return addSetlist({ name: "Chord alignment", tags: [], songIds: [song] });
    });
    await page.goto(`./setlist/${setlist}`);
    if (viewport.width <= 950)
      await page.getByRole("navigation", { name: "Setlist panels" }).getByRole("button", { name: "Preview" }).click();
    const lines = page.locator(".reading-line");
    await expect(lines).toHaveCount(4);
    await mkdir("reports/chord-fragments", { recursive: true });
    await page.screenshot({ path: `reports/chord-fragments/${viewport.name}.png` });
    const alignment = await lines.evaluateAll((lines) =>
      lines.map((line) => {
        const fragments = Array.from(line.querySelectorAll(".chord-fragment"));
        const pairs = fragments.map((fragment) => ({
          chord: fragment.querySelector(".chord")?.getBoundingClientRect(),
          lyric: fragment.querySelector(".lyrics")?.getBoundingClientRect(),
        }));
        return {
          chordsAboveLyrics: pairs.every(({ chord, lyric }) => chord && lyric && chord.bottom <= lyric.top + 1),
          lyricHeightReserved: pairs.every(({ lyric }) => lyric && lyric.height > 0),
          chordRowsAligned: pairs.every(({ chord, lyric }) =>
            pairs.every(
              (other) =>
                !chord ||
                !lyric ||
                !other.chord ||
                !other.lyric ||
                Math.abs(lyric.bottom - other.lyric.bottom) > 1 ||
                Math.abs(chord.top - other.chord.top) <= 1,
            ),
          ),
        };
      }),
    );
    expect(alignment).toEqual(
      Array.from({ length: 4 }, () => ({
        chordsAboveLyrics: true,
        lyricHeightReserved: true,
        chordRowsAligned: true,
      })),
    );
    expect((await lines.first().locator(".lyrics").allTextContents()).join("")).toBe("Follow the lantern home");
    expect((await lines.first().locator(".chord").allTextContents()).filter(Boolean)).toEqual(["C", "Am7", "D", "G"]);
    await page.getByText("Chords", { exact: true }).click();
    await expect(lines.locator(".chord").first()).toBeHidden();
    await expect(lines.first()).toContainText("Follow");
  });
}
