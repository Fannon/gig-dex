import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "small-phone", width: 320, height: 740 },
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test(`song display panel saves reading space and retains choices on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("./");
    const id = await page.evaluate(async () => {
      const base = new URL(".", location.href).pathname;
      const { addSong } = await import(`${base}src/db.ts`);
      return addSong({
        title: "Lantern song",
        artist: "Test band",
        key: "G",
        tempo: 73,
        time: "6/8",
        tags: ["evening"],
        content: "{key: G}\n{start_of_verse: Verse}\n[G]Follow the [C]lantern\n[G]Carry the [D]light\n{end_of_verse}",
      });
    });
    await page.goto(`./song/${id}`);
    const trigger = page.getByRole("button", { name: "Display options", exact: true });
    const panel = page.getByRole("region", { name: "Song display options" });
    const wrapper = page.locator(".song-view__wrapper");
    await expect(page.locator(".song-view")).toHaveAttribute("data-layout", /fit|scroll/);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
    await expect(page.locator(".song-page__header").getByRole("group", { name: "Transpose" })).toBeVisible();
    await expect(page.locator(".song-page__key")).toHaveText("G");
    const tempo = page.locator(".tempo-indicator--badge");
    await expect(tempo).toHaveAccessibleName("Start visual tempo at 73 BPM");
    await expect(tempo).toHaveText("73bpm");
    await expect(tempo).toHaveAttribute("title", /6\/8: 6 beats/);
    await expect(tempo.locator("[data-beat]")).toHaveCount(6);
    await expect(page.locator(".song-page__title-row")).not.toContainText("6/8");
    const badgeColors = await page
      .locator(".song-page__key, .tempo-indicator--badge")
      .evaluateAll((badges) => badges.map((badge) => getComputedStyle(badge).backgroundColor));
    expect(badgeColors[0]).not.toBe(badgeColors[1]);
    await tempo.click();
    await expect(tempo).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Stop visual tempo at 73 BPM" }).click();
    await page.getByRole("button", { name: "+1", exact: true }).click();
    await expect(page.locator(".song-page__key")).toHaveText("G#");
    await expect(panel).toBeHidden();
    await mkdir("reports/song-display", { recursive: true });
    await page.screenshot({ path: `reports/song-display/${viewport.name}-collapsed.png` });
    const closedHeight = (await wrapper.boundingBox())?.height ?? 0;
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    expect((await wrapper.boundingBox())?.height).toBeLessThan(closedHeight - 30);
    await panel.getByRole("button", { name: "A+", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Auto", exact: true })).toHaveAttribute("aria-pressed", "false");
    const fontSize = await panel.getByRole("group", { name: "Font size" }).locator(".song-view__value").innerText();
    await panel.getByText("Chords", { exact: true }).click();
    await expect(page.locator(".song-view__content")).toHaveClass(/hide-chords/);
    await page.screenshot({ path: `reports/song-display/${viewport.name}-expanded.png` });
    await panel.getByRole("button", { name: "A+", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(panel.getByRole("group", { name: "Font size" }).locator(".song-view__value")).toHaveText(fontSize);
    await expect(panel.getByRole("checkbox", { name: "Chords" })).not.toBeChecked();
    await panel.getByRole("button", { name: "Close display options", exact: true }).click();
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await expect(panel).toBeHidden();
    await expect(page.locator(".song-page__key")).toHaveText("G");
  });
}

test("metadata badges follow notation changes and retain a meter when no beat indicator exists", async ({ page }) => {
  await page.goto("./");
  const [withTempo, withoutTempo] = await page.evaluate(async () => {
    const base = new URL(".", location.href).pathname;
    const { addSong } = await import(`${base}src/db.ts`);
    return [
      await addSong({ title: "Metadata fixture", tags: [], content: "{key: B}\n{tempo: 73}\n{time: 6/8}\n[B]Lantern" }),
      await addSong({ title: "Without tempo", tags: [], content: "{key: C}\n{time: 3/4}\n[C]Lantern" }),
    ];
  });
  await page.goto(`./song/${withTempo}`);
  await expect(page.locator(".song-page__key")).toHaveText("B");
  await expect(page.locator(".tempo-indicator__label")).toHaveText("73bpm");
  const settings = await page.context().newPage();
  await settings.goto("./settings?section=appearance");
  await settings.getByLabel("Notation", { exact: true }).selectOption("german");
  await expect(page.locator(".song-page__key")).toHaveText("H");
  await expect(page.locator(".song-view__content .chord").first()).toHaveText("H");
  await settings.close();
  await page.getByRole("button", { name: "Display options", exact: true }).click();
  await page.locator("#sidebar-songs").getByRole("link", { name: "Without tempo", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/song/${withoutTempo}$`));
  await expect(page.getByRole("region", { name: "Song display options" })).toBeHidden();
  await expect(page.locator(".song-page__title-row")).toContainText("3/4");
  await expect(page.locator(".tempo-indicator")).toHaveCount(0);
});
