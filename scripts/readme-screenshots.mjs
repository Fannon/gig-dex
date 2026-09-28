import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

// Generates the committed README screenshots in docs/screenshots/.
// Unlike scripts/song-screenshots.mjs (ignored reports/ output for layout
// review), these files are checked into git and embedded in README.md.
// Uses the same "Add Demo Songs" flow a new user sees: Tutorial Song,
// Amazing Grace and the "Demo Night" setlist.
const output = path.resolve("docs/screenshots");
await mkdir(output, { recursive: true });

const base = process.env.VITE_BASE_PATH || "/";
const url = `http://127.0.0.1:5174${base}`;
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5174", "--strictPort"],
  { stdio: "pipe" },
);
let serverError = "";
server.stderr.on("data", (data) => {
  serverError += data;
});

let browser;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Vite failed: ${serverError}`);
    if (
      await fetch(url)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    if (attempt === 99) throw new Error("Vite did not start within 20 seconds");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const settleSong = () =>
    page.waitForFunction(() => {
      const content = document.querySelector(".song-view__content");
      if (!content) return false;
      const view = document.querySelector(".song-view");
      return !view?.hasAttribute("data-layout") || view.getAttribute("data-layout") !== "measuring";
    });

  // Seed through the real UI, like a new user would.
  await page.goto(url);
  await page.getByRole("button", { name: "Add Demo Song" }).click();
  await page.locator(".song-page__title").waitFor();
  const ids = await page.evaluate(async (basePath) => {
    const { getAllSongs, getAllSetlists } = await import(`${basePath}src/db.ts`);
    const songs = await getAllSongs();
    const setlists = await getAllSetlists();
    return {
      tutorialId: songs.find((song) => song.title === "Tutorial Song")?.id,
      setlistId: setlists.find((list) => list.name === "Demo Night")?.id,
    };
  }, new URL(url).pathname);
  if (!ids.tutorialId || !ids.setlistId) throw new Error("Demo songs were not seeded");
  const songUrl = new URL(`song/${ids.tutorialId}`, url.endsWith("/") ? url : `${url}/`).href;
  const setlistUrl = new URL(`setlist/${ids.setlistId}`, url.endsWith("/") ? url : `${url}/`).href;

  // 1. Tutorial Song view (desktop).
  await page.goto(songUrl);
  await settleSong();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, "tutorial-song.png"), fullPage: false });
  console.log("Saved tutorial-song.png");

  // 2. Demo Night setlist workspace (desktop, sidebar collapsed).
  await page.goto(setlistUrl);
  await page.locator(".setlists-page__content").waitFor();
  const toggle = page.getByRole("button", { name: "Toggle sidebar", exact: true });
  if ((await toggle.getAttribute("aria-expanded")) === "true") await toggle.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(output, "demo-setlist.png"), fullPage: false });
  console.log("Saved demo-setlist.png");

  // 3. Tutorial Song in the simple editor (desktop).
  await page.goto(songUrl);
  await settleSong();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator("#simple-content").waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(output, "edit-song.png"), fullPage: false });
  console.log("Saved edit-song.png");
} finally {
  await browser?.close();
  server.kill();
}
