import { createHash } from "node:crypto";
import { type BrowserContext, expect, test } from "@playwright/test";

for (const theme of ["black", "light"]) {
  test(`navbar shows syncing, failure, recovery and disconnect in ${theme}`, async ({ page, context }) => {
    await context.addInitScript((theme) => {
      localStorage.setItem("reading-theme", theme);
      localStorage.setItem("byoid:dropbox_app_key", "testappkey123");
      sessionStorage.setItem(
        "dropbox_tokens",
        JSON.stringify({
          access_token: "mock-access",
          expiresAt: Date.now() + 3600000,
          account_id: "dbid:navbar",
          appKey: "testappkey123",
        }),
      );
    }, theme);
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let fail = false;
    await context.route("https://api.dropboxapi.com/2/files/list_folder", async (route) => {
      await gate;
      await route.fulfill(
        fail
          ? { status: 503, json: { error_summary: "temporarily_unavailable" } }
          : { json: { entries: [], has_more: false } },
      );
    });
    await page.goto("./settings?section=sync");
    const link = page.locator(".workspace-sync-link");
    await expect(link).toHaveAttribute("data-syncing", "true");
    await expect(link).toHaveCSS("background-color", theme === "light" ? "rgb(103, 82, 169)" : "rgb(100, 82, 194)");
    await expect(link.locator("svg")).toHaveCSS("animation-duration", "6s");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(link.locator("svg")).toHaveCSS("animation-name", "none");
    release();
    await expect(link).toHaveAttribute("data-syncing", "false");
    await expect(link).toHaveAttribute("data-configured", "true");
    const host = page.getByRole("region", { name: "Dropbox sync", exact: true });
    fail = true;
    await host.getByRole("button", { name: "Sync now", exact: true }).click();
    await expect(link).toHaveAttribute("data-needs-attention", "true");
    await expect(link).toHaveCSS("color", theme === "light" ? "rgb(150, 50, 54)" : "rgb(255, 180, 180)");
    await expect(link).toHaveAccessibleName("Sync needs attention — open sync settings");
    fail = false;
    await host.getByRole("button", { name: "Sync now", exact: true }).click();
    await expect(link).toHaveAttribute("data-syncing", "false");
    await expect(link).toHaveAttribute("data-needs-attention", "false");
    await host.getByRole("button", { name: "Stop syncing", exact: true }).click();
    await expect(link).toHaveAttribute("data-configured", "false");
    await expect(link).toHaveCSS("color", theme === "light" ? "rgb(102, 97, 111)" : "rgb(165, 165, 178)");
    await expect(link).toHaveAccessibleName("Sync settings — no sync connected");
  });
}

test("Dropbox popup uses PKCE, connects through settings, and rejects mismatched state", async ({ page, context }) => {
  let challenge = "";
  let verifier = "";
  let wrongState = false;
  let exchanges = 0;
  let listingFailure = false;
  const logs: unknown[][] = [];
  page.on("console", async (message) => {
    if (message.type() === "error" && message.text().startsWith("[Gig-Dex sync]")) {
      logs.push(await Promise.all(message.args().map((argument) => argument.jsonValue())));
    }
  });
  await context.route("https://www.dropbox.com/oauth2/authorize**", async (route) => {
    const url = new URL(route.request().url());
    challenge = url.searchParams.get("code_challenge") ?? "";
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("token_access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toContain("files.content.write");
    const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
    redirect.searchParams.set("code", "mock-code");
    redirect.searchParams.set("state", wrongState ? "wrong" : (url.searchParams.get("state") ?? ""));
    await route.fulfill({
      contentType: "text/html",
      body: `<script>location.replace(${JSON.stringify(redirect.href)})</script>`,
    });
  });
  await context.route("https://api.dropboxapi.com/oauth2/token", async (route) => {
    exchanges++;
    const params = new URLSearchParams(route.request().postData() ?? "");
    verifier = params.get("code_verifier") ?? "";
    expect(params.get("grant_type")).toBe("authorization_code");
    await route.fulfill({
      json: { access_token: "fake-access", refresh_token: "fake-refresh", expires_in: 3600, account_id: "dbid:user" },
    });
  });
  await context.route("https://api.dropboxapi.com/2/users/get_current_account", (route) => {
    expect(route.request().postData()).toBe("null");
    return route.fulfill({ json: { account_id: "dbid:user" } });
  });
  await context.route("https://api.dropboxapi.com/2/files/list_folder", (route) =>
    route.fulfill(
      listingFailure
        ? {
            status: 400,
            headers: {
              "x-dropbox-request-id": "mock-request-id",
              "access-control-expose-headers": "x-dropbox-request-id",
            },
            json: {
              error_summary: "missing_scope",
              error: { ".tag": "missing_scope", required_scope: "files.metadata.read" },
            },
          }
        : { json: { entries: [], has_more: false } },
    ),
  );
  await page.goto("./settings?section=sync");
  await page.getByRole("button", { name: "Set up Dropbox", exact: true }).click();
  await expect(page.getByLabel("Dropbox redirect URL")).toHaveValue(
    new URL("dropbox-callback.html", new URL(".", page.url())).href,
  );
  await expect(page.getByRole("button", { name: "Connect Dropbox", exact: true })).toBeDisabled();
  await page.getByLabel("Dropbox app key").fill("testappkey123");
  await page.getByRole("button", { name: "Save app key", exact: true }).click();
  const host = page.getByRole("region", { name: "Dropbox sync", exact: true });
  await expect(host.getByRole("button", { name: /Connect Dropbox/ })).toBeVisible();
  await host.getByRole("button", { name: /Connect Dropbox/ }).click();
  await expect(host.getByRole("heading", { name: /Dropbox Connected/ })).toBeVisible();
  expect(createHash("sha256").update(verifier).digest("base64url")).toBe(challenge);
  expect(await host.locator(":scope > details > summary").allTextContents()).toEqual([
    "Recent activity",
    "Configure Dropbox",
    "History cleanup",
  ]);
  await host.getByText("Configure Dropbox", { exact: true }).click();
  await expect(
    host.locator(".settings-page__client-settings").getByRole("link", { name: "Dropbox setup guide" }),
  ).toBeVisible();
  listingFailure = true;
  await host.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(host.getByRole("alert")).toContainText("Dropbox files/list_folder failed (400): missing_scope");
  await host.getByText("Recent activity", { exact: true }).click();
  await expect(host.getByRole("region", { name: "Dropbox sync activity" })).toContainText("missing_scope");
  await expect.poll(() => logs.some((entry) => JSON.stringify(entry).includes("mock-request-id"))).toBe(true);
  expect(JSON.stringify(logs)).toContain("files.metadata.read");
  expect(JSON.stringify(logs)).not.toMatch(/fake-access|fake-refresh/);
  await host.getByRole("button", { name: "Stop syncing" }).click();
  wrongState = true;
  await host.getByRole("button", { name: /Connect Dropbox/ }).click();
  await expect(host.getByRole("alert")).toContainText("Dropbox sign-in state did not match");
  expect(exchanges).toBe(1);
});

test("Dropbox exchanges songs, repeated setlists and deletions between devices and recovers failed syncs", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  type File = {
    ".tag": "file";
    id: string;
    name: string;
    path_lower: string;
    rev: string;
    content: string;
  };
  const files = new Map<string, File>();
  let failListing = false;
  let loseUploadResponse = false;
  let lostResponses = 0;
  const configure = async (device: BrowserContext) => {
    await device.addInitScript(() => {
      localStorage.setItem("byoid:dropbox_app_key", "testappkey123");
      sessionStorage.setItem(
        "dropbox_tokens",
        JSON.stringify({
          access_token: "mock-device-access",
          refresh_token: "mock-device-refresh",
          expiresAt: Date.now() + 3600000,
          account_id: "dbid:shared",
          appKey: "testappkey123",
        }),
      );
    });
    await device.route("https://api.dropboxapi.com/2/files/list_folder", (route) =>
      route.fulfill(
        failListing
          ? { status: 503, json: { error_summary: "temporarily_unavailable" } }
          : {
              json: {
                entries: [...files.values()].map(({ content: _content, ...metadata }) => metadata),
                has_more: false,
              },
            },
      ),
    );
    await device.route("https://content.dropboxapi.com/2/files/**", async (route) => {
      const request = route.request();
      expect(request.headers().authorization).toBe("Bearer mock-device-access");
      const args = JSON.parse(request.headers()["dropbox-api-arg"] ?? "null");
      if (request.url().endsWith("/upload")) {
        expect(args).toMatchObject({ mode: "add", autorename: false, strict_conflict: true });
        if (files.has(args.path)) {
          await route.fulfill({ status: 409, json: { error_summary: "path/conflict" } });
          return;
        }
        const content = request.postData() ?? "";
        const file: File = {
          ".tag": "file",
          id: `id:${files.size + 1}`,
          name: args.path.slice(1),
          path_lower: args.path,
          rev: `rev:${files.size + 1}`,
          content,
        };
        files.set(args.path, file);
        if (loseUploadResponse) {
          loseUploadResponse = false;
          lostResponses++;
          await route.abort("connectionreset");
        } else await route.fulfill({ json: { ...file, content: undefined } });
      } else if (request.url().endsWith("/download")) {
        const file = [...files.values()].find((file) => file.id === args.path || file.path_lower === args.path);
        if (!file) {
          await route.fulfill({ status: 409, json: { error_summary: "path/not_found" } });
          return;
        }
        await route.fulfill({
          body: file.content,
          contentType: "application/octet-stream",
          headers: {
            "Dropbox-API-Result": JSON.stringify({ rev: file.rev }),
            "access-control-expose-headers": "Dropbox-API-Result",
          },
        });
      } else throw new Error(`Unexpected Dropbox request: ${request.url()}`);
    });
  };
  await configure(context);
  await page.goto("./");
  const base = new URL(page.url()).pathname;
  const ids = await page.evaluate(async (base) => {
    const db = await import(`${base}src/db.ts`);
    const song = await db.addSong({
      title: "Harbor – Köln",
      artist: "Review band",
      content: "{key: C}\n[C]Synthetic shared line",
      tags: ["acoustic"],
    });
    const list = await db.addSetlist({
      name: "Shared gig",
      songIds: [song, song],
      songSettings: [{ transpose: 2 }, { transpose: -1, capo: 3 }],
    });
    return { song, list };
  }, base);
  await expect.poll(() => files.size).toBe(2);
  const secondContext = await browser.newContext({ baseURL });
  try {
    await configure(secondContext);
    const second = await secondContext.newPage();
    await second.goto("./settings?section=sync");
    const host = second.getByRole("region", { name: "Dropbox sync", exact: true });
    await expect(host.getByRole("button", { name: "Sync now", exact: true })).toBeEnabled();
    await expect(second.locator("#sidebar-songs .library-sidebar__links strong")).toHaveText("Harbor – Köln");
    const received = await second.evaluate(
      async ({ base, ids }) => {
        const db = await import(`${base}src/db.ts`);
        return { song: await db.getSong(ids.song), list: await db.getSetlist(ids.list) };
      },
      { base, ids },
    );
    expect(received.song.tags).toEqual(["acoustic"]);
    expect(received.list).toMatchObject({
      songIds: [ids.song, ids.song],
      songSettings: [{ transpose: 2 }, { transpose: -1, capo: 3 }],
    });

    // A failed automatic run must resume on return to the app, with no reconnect.
    failListing = true;
    await second.evaluate(
      async ({ base, id }) => {
        const db = await import(`${base}src/db.ts`);
        await db.updateSong(id, { title: "Harbor revised" });
      },
      { base, id: ids.song },
    );
    await expect(host.getByRole("alert")).toContainText("temporarily_unavailable");
    failListing = false;
    loseUploadResponse = true;
    await second.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(host.getByRole("alert")).toHaveCount(0);
    await expect(host.getByRole("button", { name: "Sync now", exact: true })).toBeEnabled();
    expect(lostResponses).toBe(1);
    expect(files.size).toBe(3);
    await page.goto("./settings?section=sync");
    const firstHost = page.getByRole("region", { name: "Dropbox sync", exact: true });
    await expect(page.locator("#sidebar-songs .library-sidebar__links strong")).toHaveText("Harbor revised");
    await firstHost.getByRole("button", { name: "Sync now", exact: true }).click();
    await expect(firstHost.getByRole("button", { name: "Sync now", exact: true })).toBeEnabled();
    expect(files.size).toBe(3);
    await expect(page.getByRole("heading", { name: "Sync conflicts" })).toHaveCount(0);

    await second.evaluate(
      async ({ base, id }) => {
        const db = await import(`${base}src/db.ts`);
        await db.deleteSong(id);
      },
      { base, id: ids.song },
    );
    await expect.poll(() => files.size).toBe(5);
    await firstHost.getByRole("button", { name: "Sync now", exact: true }).click();
    await expect(firstHost.getByRole("button", { name: "Sync now", exact: true })).toBeEnabled();
    await expect(page.locator("#sidebar-songs .library-sidebar__links a")).toHaveCount(0);
    const remaining = await page.evaluate(
      async ({ base, id }) => {
        const db = await import(`${base}src/db.ts`);
        return { songs: await db.getAllSongs(), list: await db.getSetlist(id) };
      },
      { base, id: ids.list },
    );
    expect(remaining.songs).toEqual([]);
    expect(remaining.list).toMatchObject({ songIds: [], songSettings: [] });
    await expect(firstHost.getByRole("alert")).toHaveCount(0);
  } finally {
    await secondContext.close();
  }
});
