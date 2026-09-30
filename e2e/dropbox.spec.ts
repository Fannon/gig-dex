import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

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
  await context.route("https://api.dropboxapi.com/2/users/get_current_account", (route) =>
    route.fulfill({ json: { account_id: "dbid:user" } }),
  );
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
  await page.getByText("Configure Dropbox", { exact: true }).click();
  await page.getByLabel("Dropbox app key").fill("testappkey123");
  await page.getByRole("button", { name: "Save Dropbox settings" }).click();
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
