import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("search highlights literal matches and counts distinct sets, with exact hashtag filters", async ({
	page,
}) => {
	await page.goto("./");
	await page.evaluate(async (base) => {
		const db = await import(`${base}src/db.ts`);
		const first = await db.addSong({
			title: "Lantern [North]",
			subtitle: "Silver signal",
			artist: "Band",
			tags: ["Test"],
			content: "[C]Synthetic first line",
		});
		const second = await db.addSong({
			title: "Test in title only",
			artist: "Test",
			tags: ["testing"],
			content: "[G]Synthetic second line",
		});
		await db.addSetlist({ name: "Tagged gig", tags: ["test"], songIds: [first, first] });
		await db.addSetlist({ name: "Other tagged gig", tags: ["TEST"], songIds: [second] });
		await db.addSetlist({ name: "Live gig", tags: ["live"], songIds: [first] });
	}, new URL(page.url()).pathname);
	await page.keyboard.press("Control+k");
	const dialog = page.getByRole("dialog", { name: "Search library" });
	const input = dialog.getByLabel("Search songs and setlists");
	await input.fill("[north]");
	const row = dialog.getByRole("link");
	await expect(row).toHaveCount(1);
	await expect(row.locator("mark")).toHaveText("[North]");
	await expect(row).toContainText("In 2 Sets");
	await input.fill("silver SIGNAL");
	await expect(row).toHaveCount(1);
	await expect(row.locator("mark")).toHaveText(["Silver", "signal"]);
	await input.fill("#test");
	await expect(row).toHaveCount(3);
	await expect(dialog.locator('[data-type="Song"]')).toHaveCount(1);
	await expect(dialog.locator('[data-type="Setlist"]')).toHaveCount(2);
	await expect(row.filter({ hasText: "Test in title only" })).toHaveCount(0);
	await expect(row.filter({ hasText: "Lantern" }).locator("mark")).toHaveText("Test");
	await mkdir("reports/search", { recursive: true });
	await page.screenshot({ path: "reports/search/centered-tag-results.png" });
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
	await page.screenshot({ path: "reports/search/centered-tag-results-phone.png" });
	await page.keyboard.press("Escape");
	if (
		(await page.getByRole("button", { name: "Toggle sidebar" }).getAttribute("aria-expanded")) ===
		"false"
	)
		await page.getByRole("button", { name: "Toggle sidebar" }).click();
	await page.getByLabel("Search sidebar songs").fill("#TEST");
	await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(1);
	await page.getByRole("button", { name: "Toggle sidebar" }).click();
	await page.goto("./setlists");
	await page.getByLabel("Search setlists", { exact: true }).fill("#test");
	await expect(page.locator(".setlists-page__item")).toHaveCount(2);
});

test("minimum font lives in Settings and refits an open song after a preference change", async ({
	page,
}) => {
	await page.goto("./");
	await page.getByRole("button", { name: "Add Demo Song" }).click();
	await expect(page.locator(".song-view")).toHaveAttribute("data-layout", /fit|scroll/);
	await expect(page.getByLabel("Minimum font", { exact: true })).toHaveCount(0);
	await expect(page.locator(".song-view__layout-status")).toHaveCount(0);
	await page.evaluate(() => {
		localStorage.setItem("song_minimum_font", "20");
		window.dispatchEvent(new StorageEvent("storage", { key: "song_minimum_font", newValue: "20" }));
	});
	await expect
		.poll(() =>
			page
				.locator(".song-view__content")
				.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
		)
		.toBeGreaterThanOrEqual(20);
	await page.goto("./settings");
	await expect(page.getByLabel("Minimum font", { exact: true })).toHaveValue("20");
	await page.getByLabel("Minimum font", { exact: true }).selectOption("16");
	await page.reload();
	await expect(page.getByLabel("Minimum font", { exact: true })).toHaveValue("16");
	await mkdir("reports/search", { recursive: true });
	await page.screenshot({ path: "reports/search/settings-minimum-font.png" });
});
