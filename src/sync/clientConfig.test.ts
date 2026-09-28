import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clientConfigKeys, effectiveClientConfig, readClientSettings, saveClientSettings } from "./clientConfig";
import { DropboxProvider } from "./dropboxProvider";
import { GoogleDriveProvider } from "./gDriveProvider";
import { OneDriveProvider } from "./oneDriveProvider";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "build.apps.googleusercontent.com");
  vi.stubEnv("VITE_MICROSOFT_CLIENT_ID", "00000000-0000-4000-8000-000000000001");
  vi.stubEnv("VITE_MICROSOFT_TENANT", "organizations");
  vi.stubEnv("VITE_DROPBOX_APP_KEY", "buildappkey123");
});
afterEach(() => vi.unstubAllEnvs());
it("uses build fallbacks, saves trimmed runtime overrides, and restores build configuration on clear", () => {
  expect(effectiveClientConfig().tenant).toBe("organizations");
  saveClientSettings({
    google: "  own.apps.googleusercontent.com ",
    microsoft: "00000000-0000-4000-8000-000000000002",
    tenant: "",
    dropbox: " ownappkey123 ",
  });
  expect(effectiveClientConfig()).toEqual({
    google: "own.apps.googleusercontent.com",
    microsoft: "00000000-0000-4000-8000-000000000002",
    tenant: "common",
    dropbox: "ownappkey123",
  });
  expect(readClientSettings().google).toBe("own.apps.googleusercontent.com");
  saveClientSettings({ google: "", microsoft: "", tenant: "", dropbox: "" });
  expect(effectiveClientConfig().google).toBe("build.apps.googleusercontent.com");
  expect(localStorage.getItem(clientConfigKeys.microsoft)).toBeNull();
  expect(effectiveClientConfig().dropbox).toBe("buildappkey123");
});
it("rejects invalid client IDs/tenants before writing any settings", () => {
  const initial = { google: "own.apps.googleusercontent.com", microsoft: "", tenant: "common", dropbox: "" };
  saveClientSettings(initial);
  for (const invalid of [
    { ...initial, google: "https://google.com" },
    { ...initial, microsoft: "a client secret" },
    { ...initial, tenant: "https://other-host.test/tenant" },
    { ...initial, dropbox: "not a key" },
  ]) {
    expect(() => saveClientSettings(invalid)).toThrow();
    expect(readClientSettings()).toEqual(initial);
  }
});
it("providers enable immediately with runtime IDs and invalidate credentials when their app changes", () => {
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");
  vi.stubEnv("VITE_MICROSOFT_CLIENT_ID", "");
  vi.stubEnv("VITE_DROPBOX_APP_KEY", "");
  const google = new GoogleDriveProvider();
  const microsoft = new OneDriveProvider();
  const dropbox = new DropboxProvider();
  expect(google.isEnabled()).toBe(false);
  expect(microsoft.isEnabled()).toBe(false);
  expect(dropbox.isEnabled()).toBe(false);
  google.setClientId("own.apps.googleusercontent.com");
  microsoft.setConfig({ clientId: "00000000-0000-4000-8000-000000000002", tenant: "common" });
  dropbox.setAppKey("ownappkey123");
  expect(google.isEnabled()).toBe(true);
  expect(microsoft.isEnabled()).toBe(true);
  expect(dropbox.isEnabled()).toBe(true);
  localStorage.setItem("gdrive_access_token", "old-app-token");
  sessionStorage.setItem(
    "onedrive_tokens",
    JSON.stringify({ access_token: "old-token", expiresAt: Date.now() + 60000 }),
  );
  sessionStorage.setItem(
    "dropbox_tokens",
    JSON.stringify({ access_token: "old-token", expiresAt: Date.now() + 60000, appKey: "ownappkey123" }),
  );
  const connectedGoogle = new GoogleDriveProvider();
  const connectedMicrosoft = new OneDriveProvider();
  const connectedDropbox = new DropboxProvider("ownappkey123");
  expect(connectedGoogle.isAuthenticated()).toBe(true);
  expect(connectedMicrosoft.isAuthenticated()).toBe(true);
  expect(connectedDropbox.isAuthenticated()).toBe(true);
  connectedGoogle.setClientId("changed.apps.googleusercontent.com");
  connectedMicrosoft.setConfig({
    clientId: "00000000-0000-4000-8000-000000000003",
    tenant: "common",
  });
  connectedDropbox.setAppKey("changedappkey123");
  expect(connectedGoogle.isAuthenticated()).toBe(false);
  expect(connectedMicrosoft.isAuthenticated()).toBe(false);
  expect(connectedDropbox.isAuthenticated()).toBe(false);
  expect(localStorage.getItem("gdrive_access_token")).toBeNull();
  expect(sessionStorage.getItem("onedrive_tokens")).toBeNull();
  expect(sessionStorage.getItem("dropbox_tokens")).toBeNull();
});
