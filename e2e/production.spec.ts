import { expect, test } from "@playwright/test";

test("production chunks load on demand and cached songs work offline", async ({
	page,
	context,
}) => {
	test.skip(!process.env.PLAYWRIGHT_URL, "Requires the production preview server.");
	const scripts: string[] = [];
	page.on("request", (request) => {
		if (request.resourceType() === "script") scripts.push(request.url());
	});
	await page.goto("./");
	await expect(page.getByRole("heading", { name: "No songs yet", exact: true })).toBeVisible();
	expect(scripts.some((url) => /chordEngine|jspdf|html2canvas/.test(url))).toBe(false);
	await page.getByRole("button", { name: "Add Demo Song" }).click();
	await expect(page.locator(".song-view")).toHaveAttribute("data-layout", /fit|scroll/);
	await expect(page.locator(".song-view__content")).toContainText("Amazing");
	expect(scripts.some((url) => /chordEngine/.test(url))).toBe(true);
	await page.goto("./settings");
	await expect(page.getByRole("button", { name: /Export library/ })).toBeVisible();
	await page.evaluate(() => navigator.serviceWorker.ready);
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
	await context.setOffline(true);
	await page.goto("./");
	await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(1);
	await expect(page.locator(".song-view__content")).toContainText("Amazing");
	await page.getByRole("link", { name: "Perform", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Amazing Grace", exact: true })).toBeVisible();
	await expect(page.locator(".song-view__content")).toContainText("Amazing");
	await context.setOffline(false);
});
