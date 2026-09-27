import { mkdir } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

async function create(page: Page, name: string, tags = "") {
	await page.getByRole("button", { name: "New setlist", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "New Setlist", exact: true });
	await dialog.getByLabel("Name", { exact: true }).fill(name);
	await dialog.getByLabel("Tags", { exact: true }).fill(tags);
	await dialog.getByRole("button", { name: "Create", exact: true }).click();
	await expect(dialog).not.toBeVisible();
	await expect(
		page
			.getByRole("region", { name: "Setlist content" })
			.getByRole("heading", { name, exact: true }),
	).toBeVisible();
}

async function seed(page: Page) {
	await page.goto("./");
	await page.evaluate(async () => {
		const base = new URL(".", location.href).pathname;
		const { addSong, addSetlist } = await import(`${base}src/db.ts`);
		const first = await addSong({
			title: "Harbor Lights",
			artist: "The Evening Band",
			tags: ["acoustic"],
			content: `{title: Harbor Lights}\n{key: C}\n{start_of_verse: Verse 1}\n[C]Follow the lantern [G]down to the bay\n[Am]Carry the rhythm [F]home today\n{end_of_verse}\n${Array.from({ length: 30 }, (_, i) => `[C]Original rehearsal line ${i + 1}`).join("\n")}\n[G]Final harbor line`,
		});
		const second = await addSong({
			title: "Morning Train",
			artist: "Alex River",
			tags: ["folk"],
			content: "{key: G}\n[G]Meet me by the [C]morning train",
		});
		await addSetlist({
			name: "Acoustic Friday",
			description: "Two sets at the harbor café",
			tags: ["acoustic", "café"],
			songIds: [first, second, first],
		});
		await addSetlist({
			name: "Summer Wedding",
			description: "Garden ceremony",
			tags: ["wedding"],
			songIds: [second],
		});
		await addSetlist({ name: "Late Night", tags: ["electric"], songIds: [] });
	});
	await page.goto("./setlists");
	await page.getByLabel("Sort", { exact: true }).selectOption("name");
	await page.locator(".setlists-page__item").filter({ hasText: "Acoustic Friday" }).click();
}

test("browse and create a tagged setlist, persist details, and delete it", async ({ page }) => {
	await page.goto("./");
	await page.getByRole("link", { name: /^Sets$/i }).click();
	await expect(page.getByText("No setlists yet")).toBeVisible();
	await create(page, "My Gig", "rock, local, rock");
	await expect(page).toHaveURL(/\/setlist\/[^/]+$/);
	await page.getByRole("button", { name: "Edit details" }).click();
	await page.getByRole("dialog").getByLabel("Description").fill("Saturday night");
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByRole("dialog", { name: "Edit setlist" })).not.toBeVisible();
	await page.reload();
	await expect(page.getByRole("region", { name: "Setlist content" })).toContainText(
		"Saturday night",
	);
	await expect(page.locator(".setlists-page__item .setlists-page__tags span")).toHaveText([
		"rock",
		"local",
	]);
	page.on("dialog", (dialog) => dialog.accept());
	await page.getByRole("button", { name: "Delete setlist" }).click();
	await expect(page.getByText("No setlists yet")).toBeVisible();
});

test("search names, descriptions and tags, filter tags, sort both directions and by song count", async ({
	page,
}) => {
	await seed(page);
	const items = page.locator(".setlists-page__item h3");
	await expect(items).toHaveText(["Acoustic Friday", "Late Night", "Summer Wedding"]);
	await page.getByLabel("Sort", { exact: true }).selectOption("name-desc");
	await expect(items).toHaveText(["Summer Wedding", "Late Night", "Acoustic Friday"]);
	await page.getByLabel("Sort", { exact: true }).selectOption("songs");
	await expect(items).toHaveText(["Acoustic Friday", "Summer Wedding", "Late Night"]);
	await page.getByLabel("Search setlists").fill("ACOUSTIC café");
	await expect(items).toHaveText(["Acoustic Friday"]);
	await page.getByLabel("Search setlists").fill("ceremony");
	await expect(items).toHaveText(["Summer Wedding"]);
	await page.getByLabel("Search setlists").fill("");
	await page.getByLabel("Tags", { exact: true }).selectOption("electric");
	await expect(items).toHaveText(["Late Night"]);
	await page.getByLabel("Search setlists").fill("missing");
	await expect(page.getByText(/No matching setlists/)).toBeVisible();
});

test("duplicate preserves tags, description and repeated song order while changes stay independent", async ({
	page,
}) => {
	await seed(page);
	await page.getByRole("button", { name: "Duplicate", exact: true }).click();
	await expect(page.locator(".setlists-page__content h2")).toHaveText("Acoustic Friday (copy)");
	await expect(page.locator(".setlists-page__song strong")).toHaveText([
		"Harbor Lights",
		"Morning Train",
		"Harbor Lights",
	]);
	await expect(page.locator(".setlists-page__detail-header")).toContainText(
		"Two sets at the harbor café",
	);
	await expect(page.locator(".setlists-page__detail-header .setlists-page__tags span")).toHaveText([
		"acoustic",
		"café",
	]);
	await page.getByRole("button", { name: "Remove song 1", exact: true }).click();
	await expect(page.locator(".setlists-page__song strong")).toHaveText([
		"Morning Train",
		"Harbor Lights",
	]);
	await page.getByRole("button", { name: "Move song 2 up", exact: true }).click();
	await expect(page.locator(".setlists-page__song strong")).toHaveText([
		"Harbor Lights",
		"Morning Train",
	]);
	await page
		.locator(".setlists-page__item")
		.filter({ has: page.getByRole("heading", { name: "Acoustic Friday", exact: true }) })
		.click();
	await expect(page.locator(".setlists-page__song strong")).toHaveText([
		"Harbor Lights",
		"Morning Train",
		"Harbor Lights",
	]);
	await page.goBack();
	await expect(page.locator(".setlists-page__content h2")).toHaveText("Acoustic Friday (copy)");
	await page.reload();
	await expect(page.locator(".setlists-page__song strong")).toHaveText([
		"Harbor Lights",
		"Morning Train",
	]);
});

test("search and add songs including repeated occurrences, dismiss modals with Escape", async ({
	page,
}) => {
	await seed(page);
	await page.getByRole("button", { name: "Add songs", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Add songs", exact: true });
	await dialog.getByLabel("Search songs").fill("folk");
	await expect(dialog.locator("li")).toHaveCount(1);
	await dialog.getByRole("button", { name: "Add Morning Train", exact: true }).click();
	await expect(page.locator(".setlists-page__song")).toHaveCount(4);
	await page.keyboard.press("Escape");
	await expect(dialog).not.toBeVisible();
	await page.getByRole("button", { name: "Remove song 4", exact: true }).click();
	await expect(page.locator(".setlists-page__song strong")).toHaveText([
		"Harbor Lights",
		"Morning Train",
		"Harbor Lights",
	]);
});

for (const viewport of [
	{ name: "desktop", width: 1440, height: 900 },
	{ name: "tablet", width: 1024, height: 768 },
	{ name: "phone", width: 390, height: 844 },
]) {
	test(`three-panel workspace and scrollable preview on ${viewport.name}`, async ({
		page,
	}, info) => {
		await page.setViewportSize(viewport);
		await seed(page);
		if (viewport.width <= 950)
			await page.getByRole("button", { name: "Harbor Lights", exact: false }).first().click();
		await expect(page.locator(".song-view")).toHaveAttribute("data-layout", "scroll");
		await expect(page.locator(".song-view__value").nth(1)).toHaveText("18px");
		await expect(page.getByRole("button", { name: "Auto", exact: true })).toHaveCount(0);
		const wrapper = page.getByRole("region", { name: "Song lyrics and chords", exact: true });
		await wrapper.evaluate((element) => {
			element.scrollTop = element.scrollHeight;
		});
		await expect(page.locator(".reading-line").last()).toContainText("Final harbor line");
		await expect(page.locator(".reading-line").last()).toBeInViewport();
		await wrapper.evaluate((element) => {
			element.scrollTop = 0;
		});
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						document.documentElement.scrollWidth <= innerWidth &&
						document.documentElement.scrollHeight <= innerHeight + 1,
				),
			)
			.toBe(true);
		if (viewport.width > 950) {
			const boxes = await Promise.all(
				["Setlist library", "Setlist content", "Song preview"].map((name) =>
					page.getByRole("region", { name, exact: true }).boundingBox(),
				),
			);
			expect(boxes[0]?.x).toBeLessThan(boxes[1]?.x ?? 0);
			expect(boxes[1]?.x).toBeLessThan(boxes[2]?.x ?? 0);
		} else {
			await page
				.getByRole("navigation", { name: "Setlist panels" })
				.getByRole("button", { name: "Sets", exact: true })
				.click();
			await expect(page.getByRole("region", { name: "Setlist library" })).toBeVisible();
			await page.locator(".setlists-page__item").first().click();
			await expect(page.getByRole("region", { name: "Setlist content" })).toBeVisible();
			await page.getByRole("button", { name: "Harbor Lights", exact: false }).first().click();
		}
		await mkdir("reports/setlists", { recursive: true });
		await page.screenshot({ path: `reports/setlists/${viewport.name}.png` });
		await info.attach("setlist-workspace", {
			body: await page.screenshot(),
			contentType: "image/png",
		});
	});
}
