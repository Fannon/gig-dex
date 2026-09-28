import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { syntheticSongs } from "./song-layout-fixtures.mjs";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string", default: "reports/song-layout" },
    limit: { type: "string", default: "6" },
    start: { type: "string", default: "1" },
    url: { type: "string" },
    "audit-only": { type: "boolean", default: false },
  },
});
const limit = Number(values.limit);
const start = Number(values.start);
if (!Number.isInteger(limit) || limit < 0) throw new Error("--limit must be a nonnegative integer");
if (!Number.isInteger(start) || start < 1) throw new Error("--start must be a positive song number");
// Keep lyrics and screenshots out of source control, including when using private imports.
const output = path.resolve(values.output);
const allowed = ["reports", "tmp"].some((dir) => {
  const relative = path.relative(path.resolve(dir), output);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
});
if (!allowed) throw new Error("Use an output directory inside ignored reports/ or tmp/");
await mkdir(output, { recursive: true });

let songs = syntheticSongs;
if (values.input) {
  const names = (await readdir(values.input)).filter((name) => /\.(chordpro|cho|pro)$/i.test(name)).sort();
  songs = await Promise.all(
    names.map(async (name) => ({
      title: name.replace(/\.[^.]+$/, ""),
      content: await readFile(path.join(values.input, name), "utf8"),
      source: path.join(values.input, name),
    })),
  );
  songs.sort((a, b) => a.content.length - b.content.length);
  if (limit && songs.length > limit) {
    songs = Array.from(
      { length: limit },
      (_, i) => songs[Math.round((i * (songs.length - 1)) / Math.max(1, limit - 1))],
    );
  }
}
if (!songs.length) throw new Error("No ChordPro songs found");
const totalSongs = songs.length;
songs = songs.slice(start - 1);
if (!songs.length) throw new Error("--start is beyond the selected songs");

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "phone", width: 390, height: 844 },
  { name: "phone-landscape", width: 844, height: 390 },
];
const base = process.env.VITE_BASE_PATH || "/";
const url = values.url || `http://127.0.0.1:5174${base}`;
let server;
let browser;
const results = [];
const errors = [];
try {
  if (!values.url) {
    server = spawn(
      process.execPath,
      ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5174", "--strictPort"],
      { stdio: "pipe" },
    );
    let serverError = "";
    server.stderr.on("data", (data) => {
      serverError += data;
    });
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
  }
  browser = await chromium.launch();
  const context = await browser.newContext(); // Isolated IndexedDB: never touches a user's browser.
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  const ids = await page.evaluate(
    async ({ songs, base }) => {
      const { addSong } = await import(`${base}src/db.ts`);
      const ids = [];
      for (const song of songs)
        ids.push(
          await addSong({
            title: song.title,
            content: song.content,
            artist: "Layout review",
            tags: [],
          }),
        );
      return ids;
    },
    { songs, base: new URL(url).pathname },
  );
  for (const [index, id] of ids.entries()) {
    await page.goto(new URL(`song/${id}`, url.endsWith("/") ? url : `${url}/`).href);
    await page.locator(".song-view__content").waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      // Desktop preferences persist across resizes; hide the phone drawer so
      // the screenshot reviews the song rather than an overlaid sidebar.
      const toggle = page.getByRole("button", { name: "Toggle sidebar", exact: true });
      if (await toggle.count()) {
        const expanded = (await toggle.getAttribute("aria-expanded")) === "true";
        if (expanded !== viewport.width > 800) await toggle.click();
      }
      if ((await page.locator(".song-view").getAttribute("data-layout")) === null) {
        await page.waitForTimeout(250); // Legacy renderer used a 150ms debounce.
      }
      // Also supports the old renderer for before/after captures.
      await page.waitForFunction(() => {
        const view = document.querySelector(".song-view");
        return !view?.hasAttribute("data-layout") || view.getAttribute("data-layout") !== "measuring";
      });
      await page.evaluate(async () => {
        let previous = "";
        let stableFrames = 0;
        for (let attempt = 0; attempt < 120; attempt++) {
          await new Promise(requestAnimationFrame);
          const content = document.querySelector(".song-view__content");
          const wrapper = document.querySelector(".song-view__wrapper");
          const style = getComputedStyle(content);
          const state = [
            style.fontSize,
            style.columnCount,
            content.clientHeight,
            wrapper.clientWidth,
            wrapper.clientHeight,
            document.querySelector(".song-view").getAttribute("data-layout"),
          ].join(":");
          stableFrames = state === previous ? stableFrames + 1 : 0;
          if (stableFrames >= 4) return;
          previous = state;
        }
        throw new Error("Song layout did not settle after resizing");
      });
      const metrics = await page.evaluate(() => {
        const wrapper = document.querySelector(".song-view__wrapper");
        const content = document.querySelector(".song-view__content");
        const bounds = wrapper.getBoundingClientRect();
        const rows = [...content.querySelectorAll("table, .reading-line, .chord-word")];
        const outside = rows.filter((row) =>
          [...row.getClientRects()].some(
            (r) =>
              r.left < bounds.left - 1 ||
              r.right > bounds.right + 1 ||
              r.top < bounds.top - 1 ||
              r.bottom > Math.min(bounds.bottom, innerHeight) + 1,
          ),
        );
        return {
          fitMs: Number(content.dataset.fitMs ?? 0),
          fitCandidates: Number(content.dataset.fitCandidates ?? 0),
          fitRuns: Number(content.dataset.fitRuns ?? 0),
          invalid: !!content.querySelector(".song-view__raw"),
          fontSize: parseFloat(getComputedStyle(content).fontSize),
          columns: getComputedStyle(content).columnCount,
          layout: document.querySelector(".song-view").getAttribute("data-layout") || "legacy",
          rows: rows.length,
          outside: outside.length,
          pageOverflow:
            document.documentElement.scrollWidth > innerWidth + 1 ||
            document.documentElement.scrollHeight > innerHeight + 1,
        };
      });
      const screenshot = `${String(index + start).padStart(3, "0")}-${viewport.name}.png`;
      if (!values["audit-only"]) await page.screenshot({ path: path.join(output, screenshot), fullPage: false });
      results.push({
        song: index + start,
        source: songs[index].source ?? null,
        viewport: viewport.name,
        ...metrics,
        screenshot: values["audit-only"] ? null : screenshot,
      });
    }
    console.log(`Reviewed song ${index + start}/${totalSongs}`);
    await writeFile(path.join(output, "metrics.json"), JSON.stringify({ results, errors }, null, 2));
  }
  await writeFile(path.join(output, "metrics.json"), JSON.stringify({ results, errors }, null, 2));
  const cards = results
    .filter((r) => r.screenshot)
    .map(
      (r) =>
        `<article><h2>Song ${r.song} · ${r.viewport}</h2><p>${r.fontSize}px · ${r.columns} columns · ${r.layout} · ${r.outside} rows outside view</p><a href="${r.screenshot}"><img loading="lazy" src="${r.screenshot}" alt="Song ${r.song} at ${r.viewport}"></a></article>`,
    )
    .join("\n");
  await writeFile(
    path.join(output, "index.html"),
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Song layout review</title><style>body{font-family:system-ui;background:#101023;color:white;padding:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}img{width:100%}h2{font-size:18px}</style><h1>Song layout review</h1><main>${cards}</main></html>`,
  );
  const failures = results.filter((r) => r.pageOverflow || (r.outside > 0 && r.layout !== "scroll"));
  console.log(
    `${results.length} layouts, ${failures.length} clipped layouts, ${results.filter((r) => r.layout === "scroll").length} scroll fallbacks, ${new Set(results.filter((r) => r.invalid).map((r) => r.song)).size} invalid songs shown as raw text, ${errors.length} browser errors. Report: ${output}/index.html`,
  );
  if (failures.length || errors.length) process.exitCode = 1;
} finally {
  // Keep partial measurements if a browser/server interruption stops a long audit.
  await writeFile(path.join(output, "metrics.json"), JSON.stringify({ results, errors }, null, 2));
  await browser?.close();
  server?.kill();
}
