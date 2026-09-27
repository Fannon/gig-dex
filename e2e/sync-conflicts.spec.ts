import { expect, test } from "@playwright/test";

test("review preserved sync versions and keep both as independent songs", async ({ page }) => {
	await page.goto("./");
	await page.evaluate(async () => {
		const base = new URL(".", location.href).pathname;
		const { addSong, getSong } = await import(`${base}src/db.ts`);
		const { saveConflict } = await import(`${base}src/sync/syncStore.ts`);
		const id = await addSong({
			title: "Harbor",
			artist: "Artist",
			content: "[C]Local rehearsal words",
			tags: ["gig"],
		});
		const local = await getSong(id);
		await saveConflict({
			id: `song:${id}`,
			recordId: id,
			type: "song",
			local,
			remote: [
				{
					revision: "remote-1",
					record: { ...local, tempo: 120, tags: ["remote"], content: "[G]Remote rehearsal words" },
				},
			],
			createdAt: new Date().toISOString(),
		});
	});
	await page.goto("./settings");
	await expect(page.getByRole("heading", { name: "Sync conflicts" })).toBeVisible();
	await page.getByText(/Compare with remote version 1/).click();
	await expect(page.locator(".diff-removed")).toContainText("Local rehearsal words");
	await expect(page.locator(".diff-added")).toContainText("Remote rehearsal words");
	await expect(page.locator(".conflict-review__table")).toContainText("tempo");
	await expect(page.locator(".conflict-review__table")).toContainText("120");
	await page.screenshot({ path: "reports/sync/conflict-comparison.png", fullPage: true });
	await page.getByText("This device: Harbor", { exact: true }).click();
	await expect(page.getByText("[C]Local rehearsal words", { exact: true })).toBeVisible();
	await page.getByText("Remote version 1: Harbor", { exact: true }).click();
	await expect(page.getByText("[G]Remote rehearsal words", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Keep both as separate copies" }).click();
	await expect(page.getByText(/Resolution saved/)).toBeVisible();
	await page.goto("./");
	await expect(page.locator(".song-card__title")).toHaveCount(2);
	await expect(page.getByText("Harbor (remote copy)", { exact: true })).toBeVisible();
	await expect(page.getByText("Harbor", { exact: true })).toBeVisible();
});
