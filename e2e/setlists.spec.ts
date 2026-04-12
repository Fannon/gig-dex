import { expect, test } from "@playwright/test";

test.describe("Setlists Page", () => {
	test("should navigate to setlists page", async ({ page }) => {
		await page.goto("/");

		await page.getByRole("link", { name: /Setlists/i }).click();
		await expect(page).toHaveURL("/setlists");
		// Use first() to avoid strict mode violation with multiple matching headings
		await expect(page.locator(".setlists-page__header h1")).toContainText("Setlists");
	});

	test("should show empty state", async ({ page }) => {
		await page.goto("/setlists");

		await expect(page.getByText("No setlists yet")).toBeVisible();
		await expect(page.getByRole("button", { name: "Create Setlist" })).toBeVisible();
	});

	test("should create a new setlist", async ({ page }) => {
		await page.goto("/setlists");

		// Open create modal
		await page.locator(".setlists-page__add").click();

		// Fill setlist name
		await page.locator(".setlists-page__modal input").fill("My Gig Setlist");

		// Create setlist - use the modal button specifically
		await page.locator(".setlists-page__modal-btn--primary").click();

		// Verify setlist appears
		await expect(page.locator(".setlists-page__item")).toBeVisible();
		await expect(page.locator(".setlists-page__item h3")).toContainText("My Gig Setlist");
	});

	test("should navigate to setlist detail", async ({ page }) => {
		await page.goto("/setlists");

		// Create setlist
		await page.locator(".setlists-page__add").click();
		await page.locator(".setlists-page__modal input").fill("Test Setlist");
		await page.locator(".setlists-page__modal-btn--primary").click();

		// Wait for item to appear then click
		await expect(page.locator(".setlists-page__item")).toBeVisible();
		await page.locator(".setlists-page__item").click();

		// Verify detail page
		await expect(page).toHaveURL(/\/setlist\/[^/]+$/);
		await expect(page.locator(".setlist-detail__header h1")).toContainText("Test Setlist");
	});

	test("should delete a setlist", async ({ page }) => {
		await page.goto("/setlists");

		// Create setlist
		await page.locator(".setlists-page__add").click();
		await page.locator(".setlists-page__modal input").fill("Setlist to Delete");
		await page.locator(".setlists-page__modal-btn--primary").click();

		// Wait for setlist to appear
		await expect(page.locator(".setlists-page__item")).toBeVisible();

		// Handle dialog
		page.on("dialog", (dialog) => dialog.accept());

		// Delete setlist
		await page.locator(".setlists-page__item-delete").click();

		// Verify setlist is deleted
		await expect(page.getByText("No setlists yet")).toBeVisible();
	});
});

test.describe("Setlist Detail Page", () => {
	test.beforeEach(async ({ page }) => {
		// Setup: Create a song and a setlist
		await page.goto("/");
		await page.getByRole("button", { name: "Add Demo Song" }).click();
		await expect(page.locator(".song-card")).toBeVisible();

		await page.getByRole("link", { name: /Setlists/i }).click();
		await page.locator(".setlists-page__add").click();
		await page.locator(".setlists-page__modal input").fill("Test Gig");
		await page.locator(".setlists-page__modal-btn--primary").click();
		await expect(page.locator(".setlists-page__item")).toBeVisible();
		await page.locator(".setlists-page__item").click();
	});

	test("should show empty setlist state", async ({ page }) => {
		await expect(page.getByText("No songs in this setlist")).toBeVisible();
	});

	test("should add song to setlist", async ({ page }) => {
		// Open add modal
		await page.locator(".setlist-detail__add").click();

		// Click on song to add
		await page.locator(".setlist-detail__modal-songs button").first().click();

		// Verify song added
		await expect(page.locator(".setlist-detail__song")).toBeVisible();
		await expect(page.locator(".setlist-detail__song-title")).toContainText("Amazing Grace");
	});

	test("should remove song from setlist", async ({ page }) => {
		// Add song first
		await page.locator(".setlist-detail__add").click();
		await page.locator(".setlist-detail__modal-songs button").first().click();
		await expect(page.locator(".setlist-detail__song")).toBeVisible();

		// Remove song
		await page.locator(".setlist-detail__song-remove").click();

		// Verify song removed
		await expect(page.getByText("No songs in this setlist")).toBeVisible();
	});
});
