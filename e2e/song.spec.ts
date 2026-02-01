import { test, expect } from '@playwright/test';

test.describe('Song Page', () => {
  test('should navigate to song detail and display content', async ({ page }) => {
    await page.goto('/');

    // Add demo song
    await page.getByRole('button', { name: 'Add Demo Song' }).click();
    await expect(page.locator('.song-card')).toBeVisible();

    // Click on song card
    await page.locator('.song-card').click();

    // Verify song page loaded
    await expect(page.locator('.song-view__title')).toContainText('Amazing Grace');
    await expect(page.locator('.song-view__artist')).toContainText('Traditional');
    await expect(page.locator('.song-view__key')).toContainText('Key: G');
  });

  test('should transpose song', async ({ page }) => {
    await page.goto('/');

    // Add and navigate to demo song
    await page.getByRole('button', { name: 'Add Demo Song' }).click();
    await page.locator('.song-card').click();

    // Get initial key display
    const keyDisplay = page.locator('.song-view__key');
    await expect(keyDisplay).toContainText('Key: G');

    // Transpose up
    await page.getByRole('button', { name: '+1' }).click();
    await expect(keyDisplay).toContainText('+1');

    // Transpose down
    await page.getByRole('button', { name: '-1' }).click();
    await page.getByRole('button', { name: '-1' }).click();
    await expect(keyDisplay).toContainText('-1');
  });

  test('should adjust font size', async ({ page }) => {
    await page.goto('/');

    // Add and navigate to demo song
    await page.getByRole('button', { name: 'Add Demo Song' }).click();
    await page.locator('.song-card').click();

    // Get current font size value
    const fontSizeValue = page.locator('.song-view__control-group').filter({ hasText: 'Font Size' }).locator('.song-view__value');
    await expect(fontSizeValue).toContainText('16px');

    // Increase font size
    await page.getByRole('button', { name: 'A+' }).click();
    await expect(fontSizeValue).toContainText('18px');

    // Decrease font size
    await page.getByRole('button', { name: 'A-' }).click();
    await expect(fontSizeValue).toContainText('16px');
  });

  test('should toggle chords visibility', async ({ page }) => {
    await page.goto('/');

    // Add and navigate to demo song
    await page.getByRole('button', { name: 'Add Demo Song' }).click();
    await page.locator('.song-card').click();

    // Chords should be visible initially
    const content = page.locator('.song-view__content');
    await expect(content).not.toHaveClass(/song-view__content--hide-chords/);

    // Toggle chords off by clicking the label (the input is hidden but the label is clickable)
    await page.locator('.song-view__toggle').click();
    await expect(content).toHaveClass(/song-view__content--hide-chords/);

    // Toggle chords back on
    await page.locator('.song-view__toggle').click();
    await expect(content).not.toHaveClass(/song-view__content--hide-chords/);
  });

  test('should create a new song', async ({ page }) => {
    await page.goto('/song/new');

    // Fill in song details
    await page.locator('input[placeholder="Song title"]').fill('Test Song');
    await page.locator('input[placeholder="Artist name"]').fill('Test Artist');
    await page.locator('input[placeholder="G, Am, etc."]').fill('C');
    await page.locator('textarea').fill(`{title: Test Song}
{artist: Test Artist}
{key: C}

[C]This is a [G]test [Am]song`);

    // Save the song
    await page.getByRole('button', { name: 'Save' }).click();

    // Wait for navigation
    await page.waitForURL(/\/song\/\d+/);

    // Verify song is displayed
    await expect(page.locator('.song-view__title')).toContainText('Test Song');
  });

  test('should edit existing song', async ({ page }) => {
    await page.goto('/');

    // Add demo song
    await page.getByRole('button', { name: 'Add Demo Song' }).click();
    await page.locator('.song-card').click();

    // Click edit button
    await page.getByRole('button', { name: 'Edit' }).click();

    // Verify edit mode
    await expect(page.locator('input[placeholder="Song title"]')).toBeVisible();

    // Update title
    await page.locator('input[placeholder="Song title"]').fill('Amazing Grace (Updated)');

    // Save changes
    await page.getByRole('button', { name: 'Save' }).click();

    // Verify update
    await expect(page.locator('.song-view__title')).toContainText('Amazing Grace (Updated)');
  });

  test('should navigate back to home', async ({ page }) => {
    await page.goto('/');

    // Add and navigate to demo song
    await page.getByRole('button', { name: 'Add Demo Song' }).click();
    await page.locator('.song-card').click();

    // Click back button
    await page.locator('.song-page__back').click();

    // Verify back on home page
    await expect(page).toHaveURL('/');
    await expect(page.locator('.home-page__title')).toBeVisible();
  });
});
