// Serve two deployment snapshots of a production build, changing index.html and
// its real Workbox precache revision. Useful for exercising waiting/activation.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function createUpgradeServer({ directory = "dist", base = "/", port = 0 } = {}) {
	const root = path.resolve(directory);
	const html = await readFile(path.join(root, "index.html"), "utf8");
	const sw = await readFile(path.join(root, "sw.js"), "utf8");
	let version = "A";
	let failDownload = false;
	const mime = {
		".js": "text/javascript",
		".css": "text/css",
		".html": "text/html",
		".png": "image/png",
		".svg": "image/svg+xml",
		".woff2": "font/woff2",
		".webmanifest": "application/manifest+json",
	};
	const server = createServer(async (request, response) => {
		try {
			const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
			if (!pathname.startsWith(base)) {
				response.writeHead(404).end();
				return;
			}
			let relative = pathname.slice(base.length);
			if (relative.split("/").includes("..")) {
				response.writeHead(403).end();
				return;
			}
			if (!relative || !path.extname(relative)) relative = "index.html";
			const index = html.replace(
				"</head>",
				`<meta name="gigdex-test-deployment" content="${version}"></head>`,
			);
			let content;
			if (relative === "index.html") {
				if (failDownload) {
					response.writeHead(503).end();
					return;
				}
				content = index;
			} else if (relative === "sw.js") {
				const revision = createHash("md5").update(index).digest("hex");
				content = sw.replace(
					/url:"index.html",revision:"[^"]+"/,
					`url:"index.html",revision:"${revision}"`,
				);
				if (content === sw) throw new Error("Could not find the index.html precache revision");
			} else content = await readFile(path.join(root, relative));
			response
				.writeHead(200, {
					"Content-Type": mime[path.extname(relative)] || "application/octet-stream",
					"Cache-Control": "no-store",
				})
				.end(content);
		} catch {
			response.writeHead(404).end();
		}
	});
	await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
	return {
		url: `http://127.0.0.1:${server.address().port}${base}`,
		upgrade: (options = {}) => {
			failDownload = !!options.failDownload;
			version = "B";
		},
		close: () =>
			new Promise((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			),
	};
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const server = await createUpgradeServer({
		port: Number(process.env.PORT || 5178),
		base: process.env.VITE_BASE_PATH || "/",
	});
	console.log(`PWA upgrade fixture: ${server.url} — press Enter to deploy B`);
	process.stdin.on("data", () => {
		server.upgrade();
		console.log("Deployment B is active; check for updates in Gig-Dex.");
	});
}
