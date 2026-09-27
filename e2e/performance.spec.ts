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
	await page.getByRole("button", { name: "Performance options", exact: true }).click();
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
	await page.keyboard.press("ArrowRight");
	await expect(page.locator(".performance-page__caption")).toContainText("2/2");
	await expect.poll(() => wrapper.evaluate((node) => node.scrollTop)).toBe(0);
	await page.keyboard.press("ArrowLeft");
	await expect.poll(() => wrapper.evaluate((node) => node.scrollTop)).toBeCloseTo(position, 0);
	await page.keyboard.press("ArrowRight");
	await page.reload();
	await expect(page.locator(".performance-page__caption")).toContainText("2/2");
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
	await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toContainText(
		"Unsaved title",
	);
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

test("compact performance header, meter dots, keyboard and swipe navigation", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("./");
	const list = await page.evaluate(async () => {
		const { addSong, addSetlist } = await import(
			`${new URL(".", location.href).pathname}src/db.ts`
		);
		const first = await addSong({
			title: "First synthetic song",
			artist: "",
			tempo: 120,
			time: "6/8",
			key: "C",
			tags: [],
			content: "{key: C}\n[C]First synthetic line",
		});
		const second = await addSong({
			title: "Second synthetic song",
			artist: "",
			tempo: 120,
			key: "F",
			tags: [],
			content: "{key: F}\n[F]Second synthetic line",
		});
		return addSetlist({ name: "Synthetic Meter Gig", songIds: [first, second] });
	});
	await page.goto(`./perform/setlist/${list}`);
	await expect(page.getByRole("heading", { name: "First synthetic song" })).toBeVisible();
	await expect(page.locator(".tempo-indicator__dots > span")).toHaveCount(6);
	expect(
		await page
			.locator(".performance-page > header")
			.evaluate((el) => el.getBoundingClientRect().height),
	).toBeLessThanOrEqual(72);
	await expect(page.getByRole("button", { name: /Next song|Previous song/ })).toHaveCount(0);
	await page.getByRole("button", { name: "Performance options", exact: true }).click();
	await page.getByLabel("Beat division").selectOption("8/8");
	await page.getByRole("button", { name: "Close performance options" }).click();
	await expect(page.locator(".tempo-indicator__dots > span")).toHaveCount(8);
	await page.getByRole("button", { name: "Start visual tempo at 120 BPM" }).click();
	await expect(page.locator('.tempo-indicator__dots [data-first="true"]')).toHaveClass("active");
	const firstColor = await page
		.locator('.tempo-indicator__dots [data-first="true"]')
		.evaluate((el) => getComputedStyle(el).backgroundColor);
	await expect(page.locator('.tempo-indicator__dots [data-beat="2"]')).toHaveClass("active");
	const otherColor = await page
		.locator('.tempo-indicator__dots [data-beat="2"]')
		.evaluate((el) => getComputedStyle(el).backgroundColor);
	expect(firstColor).not.toBe(otherColor);
	await page.screenshot({ path: "reports/performance/eight-dots-phone.png" });
	await page.keyboard.press("ArrowDown");
	await expect(page.getByRole("heading", { name: "Second synthetic song" })).toBeVisible();
	await page.keyboard.press("ArrowUp");
	await expect(page.getByRole("heading", { name: "First synthetic song" })).toBeVisible();
	const swipe = async (dx: number, dy: number) =>
		page.locator(".song-view__wrapper").evaluate(
			(target, { dx, dy }) => {
				const start = new Touch({ identifier: 1, target, clientX: 250, clientY: 300 });
				const end = new Touch({ identifier: 1, target, clientX: 250 + dx, clientY: 300 + dy });
				target.dispatchEvent(
					new TouchEvent("touchstart", {
						bubbles: true,
						touches: [start],
						changedTouches: [start],
					}),
				);
				target.dispatchEvent(
					new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [end] }),
				);
			},
			{ dx, dy },
		);
	await swipe(-20, -140);
	await expect(page.getByRole("heading", { name: "First synthetic song" })).toBeVisible();
	await swipe(-140, 10);
	await expect(page.getByRole("heading", { name: "Second synthetic song" })).toBeVisible();
	await swipe(140, 0);
	await expect(page.getByRole("heading", { name: "First synthetic song" })).toBeVisible();
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole("button", { name: "Performance options", exact: true }).click();
	await page.getByLabel("Beat division").selectOption("6/8");
	await page.getByRole("button", { name: "Close performance options" }).click();
	await expect(page.locator(".tempo-indicator__dots > span")).toHaveCount(6);
	await page.screenshot({ path: "reports/performance/six-dots-desktop.png" });
});
