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
      page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Songs", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /^Sets$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();

    // Check empty state
    await expect(page.locator(".home-page__empty")).toBeVisible();
    await expect(page.locator(".home-page__empty").getByText("No songs yet")).toBeVisible();
  });

  test("should add demo songs and a setlist", async ({ page }) => {
    await page.goto("./");

    // Click add demo song button
    await page.getByRole("button", { name: "Add Demo Song" }).click();
    await expect(page).toHaveURL(/\/song\/[^/]+$/);

    await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(2);
    await expect(page.locator("#sidebar-songs").getByRole("link", { name: /Amazing Grace Traditional/ })).toBeVisible();
    await expect(
      page.locator("#sidebar-songs").getByRole("link", { name: /Tutorial Song Gig-Dex Demo/ }),
    ).toBeVisible();
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Sets" }).click();
    await expect(page.getByRole("button", { name: /Demo Night/ })).toBeVisible();
  });

  test("should search songs", async ({ page }) => {
    await page.goto("./");

    // Add demo song first
    await page.getByRole("button", { name: "Add Demo Song" }).click();
    await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(2);
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Songs" }).click();
    await expect(page.getByRole("heading", { name: "Songs" })).toBeVisible();
    await expect(page.locator(".home-page__songs a")).toHaveCount(2);

    // Search for the song
    await page.getByRole("searchbox", { name: "Search your songs" }).fill("Amazing");
    await expect(page.locator(".home-page__songs a")).toHaveCount(1);
    await expect(page.locator(".home-page__songs a")).toContainText("Amazing Grace");

    // Search for non-existent song
    await page.getByRole("searchbox", { name: "Search your songs" }).fill("NonExistent");
    await expect(page.getByText("No songs match your search.")).toBeVisible();
  });

  test("opens a searchable library on a narrow screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./");
    await page.getByRole("button", { name: "Add Demo Song" }).click();
    await expect(page).toHaveURL(/\/song\/[^/]+$/);
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Songs" }).click();
    await expect(page.getByRole("heading", { name: "Songs" })).toBeVisible();
    await expect(page.locator(".home-page__songs a")).toHaveCount(2);
    await page.getByRole("searchbox", { name: "Search your songs" }).fill("#tutorial");
    await expect(page.locator(".home-page__songs a")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("demo Instrumental uses the chord color", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "Add Demo Song" }).click();
    await expect(page).toHaveURL(/\/song\/[^/]+$/);
    await page
      .locator("#sidebar-songs")
      .getByRole("link", { name: /Tutorial Song Gig-Dex Demo/ })
      .click();
    const label = page.locator(".song-view__content .section-instrumental");
    await expect(label).toBeVisible();
    await expect(page.locator(".song-view")).toHaveAttribute("data-layout", /fit|scroll/);
    const chords = await label.evaluate((element) => {
      const content = element.closest(".song-view__content");
      const nodes = Array.from(content?.querySelectorAll(".label, .chord") ?? []);
      const chords: { text: string; color: string }[] = [];
      for (const node of nodes.slice(nodes.indexOf(element) + 1)) {
        if (node.classList.contains("label")) break;
        const text = node.textContent?.trim();
        if (text) chords.push({ text, color: getComputedStyle(node).color });
      }
      return chords;
    });
    expect(chords.map((chord) => chord.text)).toEqual(["C", "G", "Am", "F", "C", "G", "C"]);
    expect(chords.every((chord) => chord.color === "rgb(245, 158, 11)")).toBe(true);
    await label.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "reports/tutorial-instrumental.png" });
  });

  test("should navigate to new song page via FAB", async ({ page }) => {
    await page.goto("./");

    await page.locator(".home-page__fab").click();
    await expect(page).toHaveURL(/.*\/song\/new/);
  });
});
