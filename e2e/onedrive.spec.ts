import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

test("Microsoft popup uses PKCE and rejects mismatched OAuth state", async ({ page, context }) => {
  let challenge = "";
  let verifier = "";
  let wrongState = false;
  let exchanges = 0;
  await context.route("https://login.microsoftonline.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/authorize")) {
      challenge = url.searchParams.get("code_challenge") ?? "";
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
      redirect.searchParams.set("code", "mock-code");
      redirect.searchParams.set("state", wrongState ? "wrong" : (url.searchParams.get("state") ?? ""));
      await route.fulfill({
        contentType: "text/html",
        body: `<script>location.replace(${JSON.stringify(redirect.href)})</script>`,
      });
    } else {
      exchanges++;
      const params = new URLSearchParams(route.request().postData() ?? "");
      verifier = params.get("code_verifier") ?? "";
      expect(params.get("grant_type")).toBe("authorization_code");
      await route.fulfill({
        json: { access_token: "fake-access", refresh_token: "fake-refresh", expires_in: 3600 },
      });
    }
  });
  await context.route("https://graph.microsoft.com/**", (route) => route.fulfill({ json: { id: "account-folder" } }));
  await page.goto("./");
  await page.evaluate(async (base) => {
    const { OneDriveProvider } = await import(`${base}src/sync/oneDriveProvider.ts`);
    const button = document.createElement("button");
    button.textContent = "Test Microsoft sign-in";
    button.id = "oauth-fixture";
    button.onclick = () => {
      const provider = new OneDriveProvider({ clientId: "test-client", tenant: "common" });
      void provider
        .authenticate()
        .then(() => {
          button.dataset.result = "connected";
        })
        .catch((error) => {
          button.dataset.result = error.message;
        });
    };
    document.body.append(button);
  }, new URL(page.url()).pathname);
  await page.getByRole("button", { name: "Test Microsoft sign-in" }).click();
  await expect(page.locator("#oauth-fixture")).toHaveAttribute("data-result", "connected");
  expect(createHash("sha256").update(verifier).digest("base64url")).toBe(challenge);
  await page.evaluate(() => sessionStorage.removeItem("onedrive_tokens"));
  wrongState = true;
  await page.getByRole("button", { name: "Test Microsoft sign-in" }).click();
  await expect(page.locator("#oauth-fixture")).toHaveAttribute("data-result", /state did not match/);
  expect(exchanges).toBe(1);
});

test("OneDrive sync and reviewed cleanup preserve current records and reject stale previews", async ({
  page,
  context,
}) => {
  // Supply a public fixture client ID in this isolated context without configuring the user's server.
  await context.route("**/src/sync/oneDriveProvider.ts*", async (route) => {
    const original = await route.fetch();
    await route.fulfill({
      response: original,
      body: (await original.text()).replaceAll("import.meta.env.VITE_MICROSOFT_CLIENT_ID", '"browser-fixture-client"'),
    });
  });
  const date = "2025-01-01T00:00:00Z";
  const files = new Map<
    string,
    {
      id: string;
      name: string;
      eTag: string;
      createdDateTime: string;
      file: object;
      content: Record<string, unknown>;
    }
  >();
  for (let i = 0; i < 9; i++) {
    const revision = `00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`;
    const parent = `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
    files.set(`file${i}`, {
      id: `file${i}`,
      name: `gigdex-song-${revision}.json`,
      eTag: `etag${i}`,
      createdDateTime: date,
      file: {},
      content: {
        id: "synced-song",
        title: "OneDrive fixture",
        artist: "Test",
        content: "[C]Original cloud words",
        tags: [],
        createdAt: date,
        lastModified: date,
        _sync: { revision, parents: i ? [parent] : [] },
      },
    });
  }
  let deleted = 0;
  await context.addInitScript(() =>
    sessionStorage.setItem(
      "onedrive_tokens",
      JSON.stringify({ access_token: "mock-token", expiresAt: Date.now() + 3600000 }),
    ),
  );
  await context.route("https://graph.microsoft.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/approot")) {
      await route.fulfill({ json: { id: "folder" } });
      return;
    }
    if (url.pathname.endsWith("/children")) {
      await route.fulfill({
        json: { value: [...files.values()].map(({ content: _, ...item }) => item) },
      });
      return;
    }
    if (route.request().method() === "PUT") {
      const content = route.request().postDataJSON();
      const id = `upload${files.size}`;
      const name = url.pathname.match(/gigdex-song-[^/]+\.json/)?.[0];
      expect(name).toBeTruthy();
      files.set(id, {
        id,
        name: name ?? "",
        eTag: `etag-${id}`,
        createdDateTime: new Date().toISOString(),
        file: {},
        content,
      });
      await route.fulfill({ json: { id } });
      return;
    }
    const id = url.pathname.split("/").at(-1) ?? "";
    const file = files.get(id);
    if (route.request().method() === "DELETE") {
      expect(route.request().headers()["if-match"]).toBe(file?.eTag);
      files.delete(id);
      deleted++;
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      json: { id, "@microsoft.graph.downloadUrl": `https://download.example.test/${id}` },
    });
  });
  await context.route("https://download.example.test/**", (route) => {
    expect(route.request().headers().authorization).toBeUndefined();
    return route.fulfill({
      json: files.get(new URL(route.request().url()).pathname.slice(1))?.content,
    });
  });
  await page.goto("./");
  await page.evaluate(async (base) => {
    const { oneDriveProvider } = await import(`${base}src/sync/index.ts`);
    oneDriveProvider.isEnabled = () => true;
  }, new URL(page.url()).pathname);
  await page.getByRole("link", { name: /Settings/i }).click();
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  const host = page.getByRole("region", { name: "OneDrive sync", exact: true });
  await host.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(host.getByRole("button", { name: "Sync now", exact: true })).toBeEnabled();
  await expect(host.getByRole("alert")).toHaveCount(0);
  await expect(host.getByText(/Last synced/)).toBeVisible();
  await host.getByText("History cleanup", { exact: true }).click();
  await host.getByRole("button", { name: "Review OneDrive history cleanup" }).click();
  await expect(host.getByText("3 old revisions eligible")).toBeVisible();
  const head = files.get("file8");
  if (head) head.eTag = "updated";
  page.once("dialog", (dialog) => dialog.accept());
  await host.getByRole("button", { name: "Move reviewed revisions to trash" }).click();
  await expect(host.getByRole("alert")).toContainText("changed since");
  expect(deleted).toBe(0);
  await host.getByRole("button", { name: "Review OneDrive history cleanup" }).click();
  await expect(host.getByText("3 old revisions eligible")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await host.getByRole("button", { name: "Move reviewed revisions to trash" }).click();
  await expect(host.getByText("3 old revisions moved to trash.")).toBeVisible();
  expect(files.has("file8")).toBe(true);
  expect(files.size).toBe(6);
  await host.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(host.getByRole("button", { name: "Sync now", exact: true })).toBeEnabled();
  await expect(host.getByRole("alert")).toHaveCount(0);
  await expect(host.getByText(/Last synced/)).toBeVisible();
  await page.screenshot({ path: "reports/sync/onedrive-cleanup.png", fullPage: true });
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Songs", exact: true })
    .click();
  await expect(page.locator("#sidebar-songs .library-sidebar__links strong")).toHaveText("OneDrive fixture");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await context.setOffline(true);
  await page.getByLabel("Title", { exact: true }).fill("Edited while offline");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".song-page__title")).toHaveText("Edited while offline");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Songs", exact: true })
    .click();
  await expect(page.locator("#sidebar-songs .library-sidebar__links strong")).toHaveText("Edited while offline");
  await context.setOffline(false);
  await page.getByRole("link", { name: /Settings/i }).click();
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  await host.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(host.getByRole("button", { name: "Sync now", exact: true })).toBeEnabled();
  await expect(host.getByRole("alert")).toHaveCount(0);
  expect([...files.values()].some((file) => file.content.title === "Edited while offline")).toBe(true);
});
