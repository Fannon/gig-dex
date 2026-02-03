import { expect, test } from "@playwright/test";

test.describe("Settings Page", () => {
	test("should navigate to settings page", async ({ page }) => {
		await page.goto("/");

		await page.getByRole("link", { name: /Settings/i }).click();
		await expect(page).toHaveURL("/settings");
		await expect(page.locator(".settings-page__header h1")).toContainText("Settings");
	});

	test("should display data management options", async ({ page }) => {
		await page.goto("/settings");

		// Use more specific locators
		await expect(
			page.locator(".settings-page__option-text h3").filter({ hasText: "Export Songs" }),
		).toBeVisible();
		await expect(
			page.locator(".settings-page__option-text h3").filter({ hasText: "Import Songs" }),
		).toBeVisible();
	});

	test("should display cloud sync section", async ({ page }) => {
		await page.goto("/settings");

		// Check for Cloud Sync section header
		await expect(
			page.locator(".settings-page__section h2").filter({ hasText: "Cloud Sync" }),
		).toBeVisible();

		// Check for either "Google Drive Sync" (when not configured) or "Connect Google Drive" (when configured)
		await expect(
			page.locator(".settings-page__option-text h3").filter({ hasText: /Google Drive/i }),
		).toBeVisible();
	});

	test("should display about section", async ({ page }) => {
		await page.goto("/settings");

		await expect(page.locator(".settings-page__about-brand p")).toContainText("Version 0.1.0");
		await expect(page.getByRole("link", { name: /Learn ChordPro/i })).toBeVisible();
	});

	test("should navigate back to home", async ({ page }) => {
		await page.goto("/settings");

		await page.locator(".settings-page__back").click();
		await expect(page).toHaveURL("/");
	});
});
