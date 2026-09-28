import { mkdir } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

async function seed(page: Page) {
	await page.goto("./");
	return page.evaluate(async (base) => {
		const db = await import(`${base}src/db.ts`);
		const first = await db.addSong({
			title: "First fixture",
			artist: "Test",
			key: "C",
			tags: [],
			content: "{key: C}\n[C]Synthetic first line",
		});
		const second = await db.addSong({
			title: "Second fixture",
			artist: "Test",
			key: "G",
			defaultTranspose: -4,
			tags: [],
			content: "{key: G}\n[G]Synthetic second line",
		});
		const list = await db.addSetlist({
			name: "First set",
			date: "2026-09-27",
			tags: ["acoustic"],
			songIds: [first, first],
			songSettings: [{ transpose: 1 }, { transpose: -2 }],
		});
		await db.addSetlist({ name: "Second set", songIds: [first, second] });
		await db.addSetlist({ name: "Other set", songIds: [second] });
		return { first, second, list };
	}, new URL(page.url()).pathname);
}

test("Sets supports sidebar song drops, occurrence reordering, end drops and safe removal", async ({
	page,
}) => {
	const { first, list } = await seed(page);
	await page.goto(`./setlist/${list}`);
	const rows = page.locator(".setlists-page__song");
	const end = page.locator(".setlists-page__drop-end");
	await expect(rows).toHaveCount(2);
	await page
		.locator("#sidebar-songs")
		.getByRole("link", { name: "Second fixture Test" })
		.dragTo(end);
	await expect(rows).toHaveCount(3);
	await expect(rows.nth(2)).toContainText("Second fixture");
	await expect(rows.nth(2)).toContainText("T-4");
	await rows
		.nth(0)
		.getByRole("button", { name: /First fixture/ })
		.click();
	await rows.nth(0).locator(".setlists-page__song-select").dragTo(end);
	await expect(rows.nth(2)).toContainText("T+1");
	await expect(rows.nth(0)).toContainText("T-2");
	await expect(
		page.getByRole("region", { name: "Song preview" }).getByRole("link", { name: "Open song ↗" }),
	).toHaveAttribute("href", new RegExp(`/song/${first}\\?setlist=${list}&occurrence=2$`));
	const heading = page.locator(".setlists-page__preview-heading");
	const open = await heading.getByRole("link").boundingBox();
	const eyebrow = await heading.locator(".setlists-page__eyebrow").boundingBox();
	expect(Math.abs((open?.y ?? 0) - (eyebrow?.y ?? 0))).toBeLessThan(8);
	await rows
		.nth(2)
		.locator(".setlists-page__song-select")
		.dragTo(page.locator(".setlists-page__drop-remove"));
	await expect(rows).toHaveCount(2);
	await expect(rows.first()).toContainText("T-2");
	await page
		.locator("#sidebar-songs")
		.getByRole("link", { name: "Second fixture Test" })
		.dragTo(page.locator(".setlists-page__drop-remove"));
	await expect(rows).toHaveCount(2);
	await page
		.locator("#sidebar-setlist .library-sidebar__song-row")
		.first()
		.getByRole("link")
		.dragTo(page.locator(".library-sidebar__drop-remove"));
	await expect(rows).toHaveCount(1);
	await expect(
		page
			.getByRole("region", { name: "Song preview" })
			.getByRole("heading", { name: "Second fixture" }),
	).toBeVisible();
	await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(2);
	await mkdir("reports/sets", { recursive: true });
	await page.screenshot({ path: "reports/sets/drag-desktop.png" });
	await page.reload();
	await expect(rows).toHaveCount(1);
});

test("song membership counts distinct sets and filters only by a complete ID", async ({ page }) => {
	const { first, second } = await seed(page);
	await page.goto(`./song/${first}`);
	await page.getByRole("link", { name: "In 2 Sets", exact: true }).click();
	await expect(page.getByLabel("Search setlists", { exact: true })).toHaveValue(first);
	const lists = page.locator(".setlists-page__item");
	await expect(lists).toHaveCount(2);
	await expect(lists).toContainText(["set", "set"]);
	await lists.nth(1).click();
	await expect(page).toHaveURL(new RegExp(`/setlist/[^?]+\\?q=${first}$`));
	await expect(page.getByLabel("Search setlists", { exact: true })).toHaveValue(first);
	await expect(lists).toHaveCount(2);
	await page.reload();
	await expect(page.getByLabel("Search setlists", { exact: true })).toHaveValue(first);
	await expect(lists).toHaveCount(2);
	await page.goBack();
	await expect(page).toHaveURL(new RegExp(`/setlists\\?q=${first}$`));
	await expect(lists).toHaveCount(2);
	await page.getByLabel("Search setlists", { exact: true }).fill(first.slice(0, 12));
	await expect(lists).toHaveCount(0);
	await page.getByLabel("Search setlists", { exact: true }).fill(`${first} acoustic`);
	await expect(lists).toHaveCount(1);
	await expect(lists).toContainText("First set");
	await page.getByLabel("Search setlists", { exact: true }).fill(second);
	await expect(lists).toHaveCount(2);
	await page.reload();
	await expect(page.getByLabel("Search setlists", { exact: true })).toHaveValue(first);
	await expect(lists).toHaveCount(2);
});

test("song and Sets headers share compact sizing and the Sets preview remains usable on phones", async ({
	page,
}) => {
	const { first, list } = await seed(page);
	await page.goto(`./song/${first}`);
	await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
	await expect(page.locator(".song-page__back")).toHaveCount(0);
	const songHeight = await page
		.locator(".song-page__header")
		.evaluate((el) => el.getBoundingClientRect().height);
	await page.goto(`./setlist/${list}`);
	const setHeight = await page
		.locator(".setlists-page__header")
		.evaluate((el) => el.getBoundingClientRect().height);
	expect(setHeight).toBe(songHeight);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole("button", { name: "Toggle sidebar" }).click();
	await page
		.getByRole("navigation", { name: "Setlist panels" })
		.getByRole("button", { name: "Songs", exact: true })
		.click();
	await expect(page.locator(".setlists-page__drop-end")).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
	await page.screenshot({ path: "reports/sets/content-phone.png" });
	await page
		.getByRole("navigation", { name: "Setlist panels" })
		.getByRole("button", { name: "Preview", exact: true })
		.click();
	await expect(page.getByRole("link", { name: "Open song ↗" })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
	await page.screenshot({ path: "reports/sets/preview-phone.png" });
});

test("new sets prefill today's date and drag indicators remain straight", async ({ page }) => {
	const { list } = await seed(page);
	await page.goto(`./setlist/${list}`);
	const rows = page.locator(".setlists-page__song");
	await expect(rows).toHaveCount(2);
	await expect(page.locator(".setlists-page__detail-header .setlists-page__eyebrow")).toContainText(
		"SETLIST · 2 SONGS · 2026-09-27",
	);
	await expect(
		page.locator(".setlists-page__actions").getByRole("button", { name: "Add songs", exact: true }),
	).toBeVisible();
	const heights = await page
		.locator(".setlists-page__actions > *")
		.evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().height));
	expect(heights).toEqual([38, 38, 38, 38, 38]);
	const source = await rows.first().locator(".setlists-page__song-select").boundingBox();
	const target = await rows.nth(1).boundingBox();
	if (!source || !target) throw new Error("Missing drag rows");
	await page.mouse.move(source.x + 50, source.y + source.height / 2);
	await page.mouse.down();
	await page.mouse.move(source.x + 60, source.y + source.height / 2, { steps: 5 });
	await page.mouse.move(target.x + 50, target.y + 2, { steps: 10 });
	await expect(rows.nth(1)).toHaveAttribute("data-drop-before", "true");
	const indicator = await rows.nth(1).evaluate((el) => {
		const css = getComputedStyle(el, "::before");
		return { height: css.height, radius: css.borderRadius, shadow: getComputedStyle(el).boxShadow };
	});
	expect(indicator).toEqual({ height: "2px", radius: "0px", shadow: "none" });
	await page.screenshot({ path: "reports/sets/straight-drop-indicator.png" });
	await page.mouse.up();
	await expect(page.locator("#sidebar-setlist .library-sidebar__song-row button")).toHaveCount(0);
	await page.getByRole("button", { name: "New setlist", exact: true }).click();
	const today = await page.evaluate(() => {
		const date = new Date();
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
	});
	await expect(page.getByRole("dialog").getByLabel("Date", { exact: true })).toHaveValue(today);
	let prompted = false;
	page.once("dialog", async (dialog) => {
		prompted = true;
		await dialog.dismiss();
	});
	await page.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(page.getByRole("dialog")).not.toBeVisible();
	expect(prompted).toBe(false);
	await page.getByRole("button", { name: "New setlist", exact: true }).click();
	await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill("Dated fixture");
	await page.getByRole("button", { name: "Create", exact: true }).click();
	await expect(page.locator(".setlists-page__detail-header time")).toHaveAttribute(
		"datetime",
		today,
	);
});
