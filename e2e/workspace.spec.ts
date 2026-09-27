import { mkdir } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

async function seed(page: Page) {
	await page.goto("./");
	return page.evaluate(async () => {
		const { addSong, addSetlist } = await import(
			`${new URL(".", location.href).pathname}src/db.ts`
		);
		const song = await addSong({
			title: "Lantern",
			artist: "Night Band",
			tags: ["acoustic"],
			key: "Am",
			content: "{title: Lantern}\n{key: Am}\n[Am]A synthetic [E]lantern line",
		});
		const list = await addSetlist({
			name: "Lantern Gig",
			tags: ["acoustic"],
			songIds: [song, song],
		});
		return { song, list };
	});
}
const screenshots = () => mkdir("reports/workspace", { recursive: true });

test("shared header, collapsible sidebar and global keyboard search", async ({ page }) => {
	const { song, list } = await seed(page);
	await page.goto(`./song/${song}`);
	const sidebar = page.getByRole("complementary", { name: "Library sidebar" });
	await expect(sidebar).toBeVisible();
	const height = await page
		.locator(".workspace-topbar")
		.evaluate((el) => el.getBoundingClientRect().height);
	await sidebar.getByRole("button", { name: /^Songs/ }).click();
	await expect(sidebar.getByLabel("Search sidebar songs")).not.toBeVisible();
	await sidebar.getByRole("button", { name: /^Songs/ }).click();
	await sidebar.getByRole("link", { name: "Select a setlist" }).click();
	await page.goto(`./setlist/${list}`);
	await expect(sidebar.getByRole("button", { name: /^Setlist: Lantern Gig/ })).toBeVisible();
	await expect(sidebar.locator("#sidebar-setlist .library-sidebar__links a")).toHaveCount(2);
	await page.getByRole("button", { name: "Toggle sidebar" }).click();
	await expect(sidebar).not.toBeVisible();
	await page.reload();
	await expect(page.getByRole("button", { name: "Toggle sidebar" })).toBeVisible();
	await expect(sidebar).not.toBeVisible();
	await page.keyboard.press("Control+m");
	const dialog = page.getByRole("dialog", { name: "Search library" });
	await expect(dialog.getByLabel("Search songs and setlists")).toBeFocused();
	await expect(dialog.getByRole("link")).toHaveCount(0);
	await dialog.getByLabel("Search songs and setlists").fill("acoustic");
	await expect(dialog.getByRole("link")).toHaveCount(2);
	await expect(dialog.locator('[data-type="Song"]')).toHaveText("Song");
	await expect(dialog.locator('[data-type="Setlist"]')).toHaveText("Setlist");
	await dialog.getByRole("link", { name: /Setlist Lantern Gig/ }).click();
	await expect(page).toHaveURL(new RegExp(`/setlist/${list}`));
	await page
		.getByRole("navigation", { name: "Main navigation" })
		.getByRole("link", { name: "Settings" })
		.click();
	expect(
		await page.locator(".workspace-topbar").evaluate((el) => el.getBoundingClientRect().height),
	).toBe(height);
	await page.getByRole("button", { name: "Toggle sidebar" }).click();
	await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
	await screenshots();
	await page.screenshot({ path: "reports/workspace/desktop-settings.png" });
});

test("transpose persists per repeated occurrence, follows reorder and performance", async ({
	page,
}) => {
	const { list } = await seed(page);
	await page.goto(`./setlist/${list}?song=0`);
	await page
		.getByRole("region", { name: "Song preview" })
		.getByRole("button", { name: "+1", exact: true })
		.click();
	await expect(page.locator(".setlists-page__song").nth(0)).toContainText("A#m · +1 st");
	await expect(page.locator(".setlists-page__song").nth(1)).toContainText("Am · 0 st");
	await page.getByRole("button", { name: "Move song 1 down", exact: true }).click();
	await expect(page.locator(".setlists-page__song").nth(1)).toContainText("A#m · +1 st");
	await page.reload();
	await expect(page.locator(".setlists-page__song").nth(1)).toContainText("A#m · +1 st");
	await page.goto(`./perform/setlist/${list}`);
	await expect(page.locator(".performance-page__caption")).toContainText("1/2");
	await page.keyboard.press("ArrowRight");
	await expect(page.locator(".performance-page header")).toContainText("A#m · +1 st");
	await page.getByRole("button", { name: "Performance options", exact: true }).click();
	await page.getByRole("button", { name: "Song controls" }).click();
	await page.getByRole("button", { name: "+1", exact: true }).click();
	await expect(page.locator(".performance-page header")).toContainText("Bm · +2 st");
	await page.reload();
	await expect(page.locator(".performance-page header")).toContainText("Bm · +2 st");
	await page.goto(`./setlist/${list}`);
	await expect(page.locator(".setlists-page__song")).toHaveCount(2);
	await expect(page.locator(".song-view")).toHaveAttribute("data-layout", /fit|scroll/);
	await screenshots();
	await page.screenshot({ path: "reports/workspace/desktop-setlist.png" });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole("button", { name: "Toggle sidebar" }).click();
	await page.getByRole("button", { name: "Toggle sidebar" }).click();
	await page.screenshot({ path: "reports/workspace/phone-sidebar.png" });
});

test("sidebar adds and reorders songs, and opens occurrence settings in Songs mode", async ({
	page,
}) => {
	const { song, list } = await seed(page);
	await page.goto(`./setlist/${list}`);
	const sidebar = page.getByRole("complementary", { name: "Library sidebar" });
	await sidebar.getByRole("button", { name: "Add Lantern to current setlist" }).click();
	await expect(sidebar.locator("#sidebar-setlist .library-sidebar__links a")).toHaveCount(3);
	await expect(page.locator(".setlists-page__song")).toHaveCount(3);
	await sidebar.locator("#sidebar-setlist .library-sidebar__links a").nth(0).click();
	await expect(page).toHaveURL(new RegExp(`/song/${song}\\?setlist=${list}&occurrence=0`));
	await page.getByRole("button", { name: "+1", exact: true }).click();
	await expect(sidebar.locator("#sidebar-setlist .library-sidebar__links a").nth(0)).toContainText(
		"+1 st",
	);
	await sidebar.getByRole("button", { name: "Move setlist song 1 down" }).click();
	await expect(sidebar.locator("#sidebar-setlist .library-sidebar__links a").nth(1)).toContainText(
		"+1 st",
	);
	await expect(page).toHaveURL(/occurrence=1$/);
	await sidebar.locator("#sidebar-setlist .library-sidebar__links a").nth(1).click();
	await expect(
		page.locator(".song-view__control-group").filter({ hasText: "Transpose" }),
	).toContainText("+1");
	await page.reload();
	await expect(
		page.locator(".song-view__control-group").filter({ hasText: "Transpose" }),
	).toContainText("+1");
	await expect(page.locator(".song-view")).toHaveAttribute("data-layout", /fit|scroll/);
	await screenshots();
	await page.screenshot({ path: "reports/workspace/desktop-song.png" });
	await page.keyboard.press("Control+m");
	await page.getByLabel("Search songs and setlists").fill("Lantern");
	await page.screenshot({ path: "reports/workspace/global-search.png" });
	await page.keyboard.press("Escape");
	await page.getByRole("link", { name: "Perform", exact: true }).click();
	await expect(page.locator(".performance-page header")).toContainText("2/3");
	await expect(page.locator(".performance-page header")).toContainText("+1 st");
});

test("setlist date persists, is searchable and survives duplication", async ({ page }) => {
	const { list } = await seed(page);
	await page.goto(`./setlist/${list}`);
	await page.getByRole("button", { name: "Edit details" }).click();
	await page.getByRole("dialog").getByLabel("Date", { exact: true }).fill("2026-12-24");
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(
		page.getByRole("region", { name: "Setlist content" }).locator("time"),
	).toHaveAttribute("datetime", "2026-12-24");
	await page.reload();
	await expect(
		page.getByRole("region", { name: "Setlist content" }).locator("time"),
	).toHaveAttribute("datetime", "2026-12-24");
	await page.getByRole("button", { name: "Duplicate", exact: true }).click();
	await expect(
		page.getByRole("region", { name: "Setlist content" }).locator("time"),
	).toHaveAttribute("datetime", "2026-12-24");
	await page.keyboard.press("Control+m");
	const dialog = page.getByRole("dialog", { name: "Search library" });
	await dialog.getByLabel("Search songs and setlists").fill("2026-12-24");
	await expect(dialog.getByRole("link")).toHaveCount(2);
	await screenshots();
	await page.screenshot({ path: "reports/workspace/compact-search.png" });
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Edit details" }).click();
	await page.getByRole("dialog").getByLabel("Date", { exact: true }).fill("");
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByRole("region", { name: "Setlist content" }).locator("time")).toHaveCount(
		0,
	);
});

test("sidebar New song clears previous content and dirty navigation remains guarded", async ({
	page,
}) => {
	const { song } = await seed(page);
	await page.goto(`./song/${song}`);
	await page
		.getByRole("complementary")
		.getByRole("link", { name: "Add song", exact: true })
		.click();
	await expect(page.getByLabel("Title", { exact: true })).toHaveValue("");
	await page.getByLabel("Title", { exact: true }).fill("Unsaved new song");
	const firstPrompt = page.waitForEvent("dialog").then((prompt) => prompt.dismiss());
	await page
		.getByRole("navigation", { name: "Main navigation" })
		.getByRole("link", { name: "Setlists", exact: true })
		.click();
	await firstPrompt;
	await expect(page).toHaveURL(/\/song\/new$/);
	await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Unsaved new song");
	await page.keyboard.press("Control+m");
	const dialog = page.getByRole("dialog", { name: "Search library" });
	await dialog.getByLabel("Search songs and setlists").fill("Gig");
	const searchPrompt = page.waitForEvent("dialog").then((prompt) => prompt.dismiss());
	await dialog.getByRole("link").click();
	await searchPrompt;
	await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Unsaved new song");
	page.once("dialog", (prompt) => prompt.accept());
	await page
		.getByRole("navigation", { name: "Main navigation" })
		.getByRole("link", { name: "Setlists", exact: true })
		.click();
	await expect(page.locator(".setlists-page")).toBeVisible();
});

test("pure black theme persists and section categories have distinct colors without underlines", async ({
	page,
}) => {
	await page.goto("./");
	const song = await page.evaluate(async () => {
		const { addSong } = await import(`${new URL(".", location.href).pathname}src/db.ts`);
		const content = ["Intro", "Verse 1", "Refrain", "Bridge", "Outro"]
			.map((label) => `{start_of_verse: ${label}}\n[C]Synthetic ${label} line\n{end_of_verse}`)
			.join("\n\n");
		return addSong({ title: "Section theme fixture", artist: "", content, tags: [], key: "C" });
	});
	await page.goto("./settings");
	await page.getByLabel("Theme", { exact: true }).selectOption("black");
	await expect(page.locator("html")).toHaveAttribute("data-reading-theme", "black");
	await expect(page.getByText("Offline status & storage", { exact: true })).toBeVisible();
	await expect(page.getByRole("region", { name: "Offline app" }).locator("dl")).not.toBeVisible();
	const headings = await page.locator(".settings-page__content h2").allTextContents();
	expect(headings.slice(0, 3)).toEqual(["Appearance", "Import & backups", "Cloud Sync"]);
	await page.goto(`./song/${song}`);
	await expect(page.locator(".song-view")).toHaveAttribute("data-layout", /fit|scroll/);
	const colors = await page.locator(".song-view__content .label").evaluateAll((labels) =>
		labels.map((label) => ({
			color: getComputedStyle(label).color,
			border: getComputedStyle(label).borderBottomWidth,
		})),
	);
	expect(new Set(colors.map((label) => label.color)).size).toBe(5);
	expect(colors.every((label) => label.border === "0px")).toBe(true);
	expect(
		await page.locator(".song-page").evaluate((el) => getComputedStyle(el).backgroundColor),
	).toBe("rgb(0, 0, 0)");
	await screenshots();
	await page.screenshot({ path: "reports/workspace/black-sections.png" });
	await page.reload();
	await expect(page.locator("html")).toHaveAttribute("data-reading-theme", "black");
	await page.goto("./settings");
	await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("black");
	await page.screenshot({ path: "reports/workspace/settings-practical.png" });
});

test("light theme uses a soft background and readable section accents", async ({ page }) => {
	const { song } = await seed(page);
	await page.goto("./settings");
	await page.getByLabel("Theme", { exact: true }).selectOption("light");
	await expect(page.locator("html")).toHaveAttribute("data-reading-theme", "light");
	await page.goto(`./song/${song}`);
	await expect(page.locator(".song-view")).toHaveAttribute("data-layout", /fit|scroll/);
	expect(
		await page.locator(".song-page").evaluate((el) => getComputedStyle(el).backgroundColor),
	).toBe("rgb(247, 246, 242)");
	expect(
		await page
			.locator(".song-view__content .lyrics")
			.first()
			.evaluate((el) => getComputedStyle(el).color),
	).toBe("rgb(41, 43, 49)");
	await screenshots();
	await page.screenshot({ path: "reports/workspace/light-song.png" });
	await page.goto("./settings");
	await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("light");
	await page.screenshot({ path: "reports/workspace/light-settings.png" });
	await page.reload();
	await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("light");
});

test("sidebar drag adds, reorders repeated occurrences and removes only the chosen entry", async ({
	page,
}) => {
	const { song, list } = await seed(page);
	await page.goto(`./setlist/${list}`);
	const rows = page.locator("#sidebar-setlist .library-sidebar__song-row");
	await page
		.locator("#sidebar-songs .library-sidebar__links a")
		.first()
		.dragTo(page.locator("#sidebar-setlist"));
	await expect(rows).toHaveCount(3);
	await rows.nth(0).getByRole("link").click();
	await page.getByRole("button", { name: "+1", exact: true }).click();
	await expect(rows.nth(0)).toContainText("+1 st");
	await rows
		.nth(0)
		.getByRole("link")
		.dragTo(rows.nth(2), { targetPosition: { x: 50, y: 60 } });
	await expect(rows.nth(2)).toContainText("+1 st");
	await expect(page).toHaveURL(/occurrence=2$/);
	await rows.nth(0).getByRole("button", { name: "Remove setlist song 1", exact: true }).click();
	await expect(rows).toHaveCount(2);
	await expect(page).toHaveURL(/occurrence=1$/);
	await expect(rows.nth(1)).toContainText("+1 st");
	await rows.nth(1).getByRole("button", { name: "Remove setlist song 2", exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/song/${song}$`));
	await expect(rows).toHaveCount(1);
	await rows.nth(0).getByRole("button", { name: "Remove setlist song 1", exact: true }).click();
	await expect(rows).toHaveCount(0);
	await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(1);
	await page
		.locator("#sidebar-songs .library-sidebar__links a")
		.first()
		.dragTo(page.locator("#sidebar-setlist"));
	await expect(rows).toHaveCount(1);
	await page.reload();
	await expect(rows).toHaveCount(1);
	await page.evaluate(async () => {
		const { addSong } = await import(new URL("../src/db.ts", location.href).href);
		await addSong({ title: "Other fixture", artist: "Test", tags: [], content: "[C]Synthetic" });
	});
	await page
		.locator("#sidebar-songs")
		.getByRole("link", { name: "Other fixture Test" })
		.dragTo(rows.nth(0), { targetPosition: { x: 50, y: 1 } });
	await expect(rows).toHaveCount(2);
	await expect(rows.nth(0)).toContainText("Other fixture");
	await expect(rows.nth(1)).toContainText("Lantern");
	await screenshots();
	await page.screenshot({ path: "reports/workspace/sidebar-drag-remove.png" });
});

test("simple editor previews section colors, spaced instrumental chords and saves headings", async ({
	page,
}) => {
	await seed(page);
	await page.goto("./song/new");
	await page.getByLabel("Title", { exact: true }).fill("Section fixture");
	const text =
		"Intro\n\nC G D/F# Em\n\nChorus\nC          G\nA lantern shines\nVerse 1\nAm        E\nSynthetic line\nInterlude\nC Em C D Em\n\nOutro\nG C\n";
	await page.locator("#simple-content").fill(text);
	const preview = page.locator(".song-page__preview-content");
	await expect(preview.locator(".label")).toHaveText([
		"Intro",
		"Chorus",
		"Verse 1",
		"Interlude",
		"Outro",
	]);
	const chorus = await preview
		.locator(".section-chorus")
		.evaluate((el) => getComputedStyle(el).color);
	expect(
		await preview.locator(".section-verse").evaluate((el) => getComputedStyle(el).color),
	).not.toBe(chorus);
	const chords = preview.locator(".chord");
	const right = await chords.nth(0).evaluate((el) => {
		const range = document.createRange();
		range.selectNodeContents(el);
		return range.getBoundingClientRect().right;
	});
	const left = await chords.nth(1).evaluate((el) => el.getBoundingClientRect().left);
	expect(left).toBeGreaterThan(right);
	await screenshots();
	await page.screenshot({ path: "reports/workspace/simple-editor-sections.png" });
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(page.locator(".song-view__content .label")).toHaveText([
		"Intro",
		"Chorus",
		"Verse 1",
		"Interlude",
		"Outro",
	]);
	await page.reload();
	await expect(page.locator(".song-view__content .section-chorus")).toHaveText("Chorus");
	await page.getByRole("button", { name: "Edit", exact: true }).click();
	await expect(page.locator("#simple-content")).toContainText("C G D/F# Em");
});
