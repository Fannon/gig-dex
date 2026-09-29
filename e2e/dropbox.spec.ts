import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

test("Dropbox popup uses PKCE, connects through settings, and rejects mismatched state", async ({ page, context }) => {
  let challenge = "";
  let verifier = "";
  let wrongState = false;
  let exchanges = 0;
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
    route.fulfill({ json: { entries: [], has_more: false } }),
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
  await host.getByRole("button", { name: "Stop syncing" }).click();
  wrongState = true;
  await host.getByRole("button", { name: /Connect Dropbox/ }).click();
  await expect(host.getByRole("alert")).toContainText("Dropbox sign-in state did not match");
  expect(exchanges).toBe(1);
});
