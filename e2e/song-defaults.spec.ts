import { mkdir } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

async function seed(page: Page) {
	await page.goto("./");
	return page.evaluate(async (base) => {
		const db = await import(`${base}src/db.ts`);
		const song = await db.addSong({
			title: "Default fixture",
			artist: "Test",
			key: "C",
			tempo: 120,
			time: "6/8",
			tags: [],
			content: "{key: C}\n[C]Synthetic reading line",
		});
		const list = await db.addSetlist({ name: "Existing set", songIds: [song, song] });
		return { song, list };
	}, new URL(page.url()).pathname);
}

test("song default and alternative title persist, while new entries copy the default independently", async ({
	page,
}) => {
	const { song, list } = await seed(page);
	await page.goto(`./song/${song}`);
	await page.getByRole("button", { name: "Edit", exact: true }).click();
	await page.getByLabel("Alternative title", { exact: true }).fill("Silver signal");
	await page.getByLabel("Standard transposition", { exact: true }).fill("-4");
	await expect(page.locator("#song-capo")).toHaveCount(0);
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(page.locator(".song-page__title-row")).toContainText("G# | T-4 | 120bpm | 6/8");
	await page.getByRole("button", { name: "Add to Set", exact: true }).click();
	const rows = page.locator("#sidebar-setlist .library-sidebar__song-row");
	await expect(rows).toHaveCount(1);
	await expect(rows.first()).toContainText("T-4");
	await rows.first().getByRole("link").click();
	await page.getByRole("button", { name: "+1", exact: true }).click();
	await expect(rows.first()).toContainText("T-3");
	await page.getByRole("button", { name: "Add to Set", exact: true }).click();
	await expect(rows).toHaveCount(2);
	await expect(rows.nth(1)).toContainText("T-4");
	await page.getByRole("button", { name: "Edit", exact: true }).click();
	await expect(page.getByLabel("Standard transposition", { exact: true })).toHaveValue("-4");
	await page.getByLabel("Standard transposition", { exact: true }).fill("2");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(rows.first()).toContainText("T-3");
	await expect(rows.nth(1)).toContainText("T-4");
	await page.getByRole("button", { name: "Add to Set", exact: true }).click();
	await expect(rows).toHaveCount(3);
	await expect(rows.nth(2)).toContainText("T+2");
	await page.getByLabel("Search sidebar songs").fill("Silver signal");
	await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(1);
	await page.keyboard.press("Control+k");
	const search = page.getByRole("dialog", { name: "Search library" });
	await search.getByLabel("Search songs and setlists").fill("Silver signal");
	await expect(search.getByRole("link")).toHaveCount(1);
	await expect(search.getByRole("link")).toContainText("Default fixture");
	await page.keyboard.press("Escape");
	await page.goto(`./setlist/${list}`);
	await expect(page.locator(".setlists-page__song").first()).toContainText("C | 120bpm | 6/8");
	await page.getByRole("button", { name: "Add songs", exact: true }).click();
	await page.getByLabel("Search songs", { exact: true }).fill("Silver signal");
	await expect(page.locator(".setlists-page__picker li")).toHaveCount(1);
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Add Default fixture", exact: true })
		.click();
	await page.getByRole("button", { name: "Done", exact: true }).click();
	await expect(page.locator(".setlists-page__song").nth(2)).toContainText("T+2");
	await page.goto(`./song/${song}`);
	await page.getByRole("button", { name: "Edit", exact: true }).click();
	await page.getByLabel("Alternative title", { exact: true }).fill("");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await page.reload();
	await page.getByRole("button", { name: "Edit", exact: true }).click();
	await expect(page.getByLabel("Alternative title", { exact: true })).toHaveValue("");
	await expect(page.getByLabel("Standard transposition", { exact: true })).toHaveValue("2");
});

test("Remove from Set removes only the selected occurrence and retains independent settings", async ({
	page,
}) => {
	const { song, list } = await seed(page);
	await page.goto(`./setlist/${list}`);
	await page.goto(`./song/${song}?setlist=${list}&occurrence=1`);
	const rows = page.locator("#sidebar-setlist .library-sidebar__song-row");
	await page.getByRole("button", { name: "+1", exact: true }).click();
	await expect(rows.nth(1)).toContainText("T+1");
	await page.getByRole("button", { name: "Remove from Set", exact: true }).click();
	await expect(rows).toHaveCount(1);
	await expect(rows.first()).not.toContainText("T+1");
	await expect(page).toHaveURL(new RegExp(`/song/${song}(?:\\?)?$`));
	await page.getByRole("button", { name: "Remove from Set", exact: true }).click();
	await expect(rows).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Remove from Set", exact: true })).toHaveCount(0);
	await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(1);
});

test("performance starts tempo automatically and quick edit returns to its occurrence ", async ({
	page,
}) => {
	const { song, list } = await seed(page);
	await page.goto(`./perform/setlist/${list}?occurrence=1`);
	await expect(page.getByRole("button", { name: "Stop visual tempo at 120 BPM" })).toBeVisible();
	await page.getByRole("button", { name: "Stop visual tempo at 120 BPM" }).click();
	await page.keyboard.press("ArrowLeft");
	await expect(page.locator(".performance-page__caption")).toContainText("1/2");
	await expect(page.getByRole("button", { name: "Stop visual tempo at 120 BPM" })).toBeVisible();
	await page.keyboard.press("ArrowRight");
	await page.getByRole("link", { name: "Edit song", exact: true }).click();
	await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Default fixture");
	await page.getByLabel("Title", { exact: true }).fill("Edited fixture");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/perform/setlist/${list}\\?occurrence=1$`));
	await expect(page.getByRole("heading", { name: "Edited fixture" })).toBeVisible();
	await page.getByRole("link", { name: "Edit song", exact: true }).click();
	await page.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/perform/setlist/${list}\\?occurrence=1$`));
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.locator(".tempo-indicator__dots > span")).toHaveCount(6);
	await expect(page.locator(".tempo-indicator small")).toHaveCount(0);
	expect(
		await page
			.locator(".performance-page__bar")
			.evaluate((el) => el.getBoundingClientRect().height),
	).toBeLessThanOrEqual(72);
	expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
	await mkdir("reports/performance", { recursive: true });
	await page.screenshot({ path: "reports/performance/quick-edit-phone.png" });
	await page.goto(`./song/${song}`);
	await page.getByRole("button", { name: "Toggle sidebar" }).click();
	await page.screenshot({ path: "reports/performance/song-actions-phone.png" });
});

test("pure black defaults on a fresh library and explicit violet persists", async ({ page }) => {
	await page.goto("./settings");
	await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("black");
	await page.getByLabel("Theme", { exact: true }).selectOption("violet");
	await page.reload();
	await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("violet");
});
