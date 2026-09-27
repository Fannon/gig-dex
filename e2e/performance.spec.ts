import { expect, test } from "@playwright/test";

test("perform a repeated setlist, paginate, remember position and pulse tempo", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("./");
	const { song, list } = await page.evaluate(async (base) => {
		const db = await import(`${base}src/db.ts`);
		const song = await db.addSong({
			title: "Performance fixture",
			artist: "Test",
			tempo: 120,
			content: `{title: Performance fixture}\n${Array.from({ length: 90 }, (_, i) => `[C]Original line ${i + 1} for reading`).join("\n")}`,
			tags: [],
		});
		const list = await db.addSetlist({ name: "Repeated gig", songIds: [song, song], tags: [] });
		return { song, list };
	}, new URL(page.url()).pathname);
	await page.goto(`./perform/setlist/${list}`);
	await expect(page.getByRole("heading", { name: "Performance fixture" })).toBeVisible();
	await page.getByLabel("Reading mode").selectOption("pages");
	await expect(page.getByRole("button", { name: "Next page" })).toBeEnabled();
	await page.getByRole("button", { name: "Next page" }).click();
	await expect(page.getByText(/Page 2 \/ /)).toBeVisible();
	const wrapper = page.locator(".song-view__wrapper");
	await expect.poll(() => wrapper.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
	const position = await wrapper.evaluate((node) => node.scrollTop);
	await page.getByRole("button", { name: "Start visual tempo at 120 BPM" }).click();
	await expect(page.locator(".tempo-indicator__dots .active")).toHaveCount(1);
	await expect
		.poll(() => page.locator(".tempo-indicator__dots .active").getAttribute("data-beat"))
		.not.toBe("1");
	await page.getByRole("button", { name: "Next song →", exact: true }).click();
	await expect(page.getByText("Repeated gig · 2/2")).toBeVisible();
	await expect.poll(() => wrapper.evaluate((node) => node.scrollTop)).toBe(0);
	await page.getByRole("button", { name: "← Previous song", exact: true }).click();
	await expect.poll(() => wrapper.evaluate((node) => node.scrollTop)).toBeCloseTo(position, 0);
	await page.getByRole("button", { name: "Next song →", exact: true }).click();
	await page.reload();
	await expect(page.getByText("Repeated gig · 2/2")).toBeVisible();
	await page.screenshot({ path: "reports/performance/phone.png" });
	while (await page.getByRole("button", { name: "Next page", exact: true }).isEnabled())
		await page.getByRole("button", { name: "Next page", exact: true }).click();
	await expect(page.locator(".reading-line").last()).toBeInViewport();
	await page.screenshot({ path: "reports/performance/phone-last-page.png" });
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
	await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
	await page.getByRole("button", { name: "Exit fullscreen" }).click();
	await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
	await page.screenshot({ path: "reports/performance/desktop.png" });
	await page.goto(`./song/${song}`);
	await expect(page.getByRole("link", { name: "Perform", exact: true })).toBeVisible();
});

test("unsaved song edits survive rejected navigation, cancellation and browser Back", async ({
	page,
}) => {
	await page.goto("./");
	await page.getByRole("button", { name: "Add Demo Song" }).click();
	await page.locator(".song-card").click();
	await page.getByRole("button", { name: "Edit", exact: true }).click();
	await page.getByLabel("Title", { exact: true }).fill("Unsaved title");
	page.on("dialog", (dialog) => dialog.dismiss());
	await page.getByRole("link", { name: "Go back" }).click();
	await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Unsaved title");
	await page.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Unsaved title");
	await page.evaluate(() => history.back());
	await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Unsaved title");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(page.locator(".song-page__title")).toHaveText("Unsaved title");
	await page.getByRole("link", { name: "Go back" }).click();
	await expect(page.locator(".song-card")).toContainText("Unsaved title");
});

test("setlist drafts survive rejected Escape and cancel, and save without discard prompts", async ({
	page,
}) => {
	await page.goto("./setlists");
	await page.getByRole("button", { name: "New setlist", exact: true }).click();
	const modal = page.getByRole("dialog", { name: "New Setlist", exact: true });
	await modal.getByLabel("Name", { exact: true }).fill("Unsaved setlist");
	page.once("dialog", (dialog) => dialog.dismiss());
	await page.keyboard.press("Escape");
	await expect(modal).toBeVisible();
	await expect(modal.getByLabel("Name", { exact: true })).toHaveValue("Unsaved setlist");
	await modal.getByRole("button", { name: "Create", exact: true }).click();
	await expect(modal).not.toBeVisible();
	await expect(page.locator(".setlists-page__content h2")).toContainText("Unsaved setlist");
});
