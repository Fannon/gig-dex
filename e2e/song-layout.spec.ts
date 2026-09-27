import { expect, type Page, test } from "@playwright/test";
import { syntheticSongs } from "../scripts/song-layout-fixtures.mjs";

async function openSong(page: Page, content: string, title = "Layout test") {
	await page.goto("./song/new");
	await page.locator('input[placeholder="Song title"]').fill(title);
	await page.getByRole("button", { name: "Advanced (ChordPro)" }).click();
	await page.locator("#advanced-content").fill(content);
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(page.locator(".song-view")).toHaveAttribute("data-layout", /fit|scroll/);
}

async function expectScreenFit(page: Page) {
	await expect(page.locator(".song-view")).toHaveAttribute("data-layout", "fit");
	await expect
		.poll(() =>
			page.evaluate(() => {
				const content = document.querySelector<HTMLElement>(".song-view__content");
				if (!content) return false;
				const bounds = content.getBoundingClientRect();
				const rows = Array.from(content.querySelectorAll<HTMLElement>("table.row"));
				return (
					rows.length > 0 &&
					rows.every((row) => {
						const rects = Array.from(row.getClientRects());
						return (
							rects.length === 1 &&
							rects.every(
								(r) =>
									r.left >= bounds.left - 1 &&
									r.right <= bounds.right + 1 &&
									r.top >= bounds.top - 1 &&
									r.bottom <= bounds.bottom + 1,
							)
						);
					}) &&
					document.documentElement.scrollHeight <= innerHeight + 1 &&
					document.documentElement.scrollWidth <= innerWidth + 1
				);
			}),
		)
		.toBe(true);
}

for (const viewport of [
	{ name: "desktop", width: 1440, height: 900 },
	{ name: "tablet", width: 768, height: 1024 },
	{ name: "phone", width: 390, height: 844 },
	{ name: "landscape", width: 844, height: 390 },
]) {
	test(`short song fits ${viewport.name} with intact chord/lyric pairs`, async ({ page }, info) => {
		await page.setViewportSize(viewport);
		await openSong(page, syntheticSongs[0].content);
		await expectScreenFit(page);
		const groups = await page.locator(".song-view__control-group").evaluateAll((groups) =>
			groups.map((g) => {
				const bounds = g.getBoundingClientRect();
				return Array.from(g.children).every(
					(child) => child.getBoundingClientRect().right <= bounds.right + 1,
				);
			}),
		);
		expect(groups.every(Boolean)).toBe(true);
		await info.attach("song-layout", { body: await page.screenshot(), contentType: "image/png" });
	});
}

test("chooses multiple columns, preserves section labels and refits after controls and resizing", async ({
	page,
}, info) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await openSong(page, `{key: C}\n${syntheticSongs[1].content}`);
	await expectScreenFit(page);
	expect(
		await page
			.locator(".song-view__content")
			.evaluate((el) => Number(getComputedStyle(el).columnCount)),
	).toBeGreaterThan(1);
	const labelsAttached = await page.locator("table.row:has(.label)").evaluateAll((labels) =>
		labels.every((label) => {
			const next = label.nextElementSibling;
			return (
				next && Math.abs(label.getBoundingClientRect().left - next.getBoundingClientRect().left) < 1
			);
		}),
	);
	expect(labelsAttached).toBe(true);
	await page.getByRole("button", { name: "+1", exact: true }).click();
	await page.getByRole("button", { name: "I-V", exact: true }).click();
	await expectScreenFit(page);
	await page.getByText("Chords", { exact: true }).click();
	await expect(page.locator(".song-view__content .chord").first()).toBeHidden();
	await expectScreenFit(page);
	await page.setViewportSize({ width: 1024, height: 768 });
	await expectScreenFit(page);
	await page.getByRole("button", { name: "A+", exact: true }).click();
	await expect(page.getByRole("button", { name: "Auto", exact: true })).toHaveAttribute(
		"aria-pressed",
		"false",
	);
	await page.getByRole("button", { name: "Auto", exact: true }).click();
	await expectScreenFit(page);
	await info.attach("song-layout", { body: await page.screenshot(), contentType: "image/png" });
});

test("splits an oversized section between complete lines", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await openSong(page, syntheticSongs[2].content);
	await expectScreenFit(page);
	const lines = await page.locator(".song-view__content tr:has(.lyrics)").allTextContents();
	expect(lines).toEqual(
		Array.from({ length: 32 }, (_, i) => `Line ${i + 1}, the rhythm carries on`),
	);
	expect(
		await page
			.locator(".song-view__content")
			.evaluate((el) => Number(getComputedStyle(el).columnCount)),
	).toBeGreaterThan(1);
});

test("makes every line reachable when a song cannot fit or manual text is too large", async ({
	page,
}, info) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openSong(page, syntheticSongs[4].content);
	await expect(page.locator(".song-view")).toHaveAttribute("data-layout", "scroll");
	const wrapper = page.locator(".song-view__wrapper");
	await expect(wrapper).toHaveCSS("overflow", "auto");
	await wrapper.evaluate((el) => {
		el.scrollTop = el.scrollHeight;
		el.scrollLeft = el.scrollWidth;
	});
	await expect(page.locator(".song-view__content table.row").last()).toBeInViewport();
	await info.attach("scroll-fallback", { body: await page.screenshot(), contentType: "image/png" });
});

test("cancel restores saved content, and clearing simple lyrics does not restore old lyrics", async ({
	page,
}) => {
	await openSong(page, "[C]Original lyrics", "Saved title");
	await page.reload();
	await page.getByRole("button", { name: "Edit", exact: true }).click();
	await page.locator('input[placeholder="Song title"]').fill("Unsaved title");
	await page.locator("textarea").fill("Changed lyrics");
	await page.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(page.locator(".song-page__title")).toHaveText("Saved title");
	await expect(page.locator(".song-view__content")).toContainText("Original lyrics");
	await page.getByRole("button", { name: "Edit", exact: true }).click();
	await page.locator("textarea").fill("");
	page.once("dialog", async (dialog) => {
		expect(dialog.message()).toContain("title and content");
		await dialog.accept();
	});
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(page.locator("textarea")).toBeVisible();
});

test("preserves extended metadata across editor mode switches and saving", async ({ page }) => {
	await openSong(
		page,
		"{composer: Test Composer}\n{copyright: Test Copyright}\n[C]Original lyrics",
	);
	await page.reload();
	await page.getByRole("button", { name: "Edit", exact: true }).click();
	await page.getByRole("button", { name: "Advanced (ChordPro)" }).click();
	await expect(page.locator("textarea")).toHaveValue(/\{composer: Test Composer\}/);
	await expect(page.locator("textarea")).toHaveValue(/\{copyright: Test Copyright\}/);
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await page.reload();
	await page.getByRole("button", { name: "Edit", exact: true }).click();
	await page.getByRole("button", { name: "Advanced (ChordPro)" }).click();
	await expect(page.locator("textarea")).toHaveValue(/\{copyright: Test Copyright\}/);
});
