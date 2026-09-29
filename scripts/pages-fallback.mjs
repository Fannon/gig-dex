import { copyFile } from "node:fs/promises";

// GitHub Pages serves 404.html for direct requests to React Router paths.
// Use the same app shell so a bookmarked song, setlist, or settings URL loads.
await copyFile(new URL("../dist/index.html", import.meta.url), new URL("../dist/404.html", import.meta.url));
