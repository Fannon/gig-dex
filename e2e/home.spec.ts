import { expect, test } from "@playwright/test";

test.describe("Home Page", () => {
	test("should display the Gig-Dex header and empty state", async ({ page }) => {
		await page.goto("./");

		// Check header
		await expect(page.locator(".home-page__title")).toContainText("Gig-Dex");

		// Check search input
		await expect(page.locator("#sidebar-songs input")).toBeVisible();

		// Check navigation tabs
		await expect(
			page
				.getByRole("navigation", { name: "Main navigation" })
				.getByRole("link", { name: "Songs", exact: true }),
		).toBeVisible();
		await expect(page.getByRole("link", { name: /^Sets$/i })).toBeVisible();
		await expect(page.getByRole("link", { name: /Settings/i })).toBeVisible();

		// Check empty state
		await expect(page.locator(".home-page__empty")).toBeVisible();
		await expect(page.locator(".home-page__empty").getByText("No songs yet")).toBeVisible();
	});

	test("should add a demo song", async ({ page }) => {
		await page.goto("./");

		// Click add demo song button
		await page.getByRole("button", { name: "Add Demo Song" }).click();

		// Verify song card appears
		await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toBeVisible();
		await expect(page.locator("#sidebar-songs .library-sidebar__links strong")).toContainText(
			"Amazing Grace",
		);
		await expect(page.locator("#sidebar-songs .library-sidebar__links small")).toContainText(
			"Traditional",
		);
	});

	test("should search songs", async ({ page }) => {
		await page.goto("./");

		// Add demo song first
		await page.getByRole("button", { name: "Add Demo Song" }).click();
		await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toBeVisible();

		// Search for the song
		await page.locator("#sidebar-songs input").fill("Amazing");
		await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toBeVisible();

		// Search for non-existent song
		await page.locator("#sidebar-songs input").fill("NonExistent");
		await expect(page.locator("#sidebar-songs .library-sidebar__links a")).not.toBeVisible();
	});

	test("should navigate to new song page via FAB", async ({ page }) => {
		await page.goto("./");

		await page.locator(".home-page__fab").click();
		await expect(page).toHaveURL(/.*\/song\/new/);
	});
});
