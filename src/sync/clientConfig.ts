export const CLIENT_CONFIG_EVENT = "gigdex-sync-config-change";
export const clientConfigKeys = {
  google: "byoid:google_client_id",
  microsoft: "byoid:microsoft_client_id",
  tenant: "byoid:microsoft_tenant",
};
export interface ClientSettings {
  google: string;
  microsoft: string;
  tenant: string;
}
export function readClientSettings(): ClientSettings {
  const read = (key: string) => {
    try {
      return localStorage.getItem(key)?.trim() ?? "";
    } catch {
      return "";
    }
  };
  return {
    google: read(clientConfigKeys.google),
    microsoft: read(clientConfigKeys.microsoft),
    tenant: read(clientConfigKeys.tenant),
  };
}
export function effectiveClientConfig() {
  const saved = readClientSettings();
  return {
    google: saved.google || import.meta.env.VITE_GOOGLE_CLIENT_ID || "",
    microsoft: saved.microsoft || import.meta.env.VITE_MICROSOFT_CLIENT_ID || "",
    tenant: saved.microsoft ? saved.tenant || "common" : import.meta.env.VITE_MICROSOFT_TENANT || "common",
  };
}
export function saveClientSettings(settings: ClientSettings) {
  const clean = Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [key, value.trim()]),
  ) as unknown as ClientSettings;
  if (clean.google && !/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(clean.google))
    throw new Error("Enter a Google OAuth Client ID ending in .apps.googleusercontent.com.");
  if (clean.microsoft && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(clean.microsoft))
    throw new Error("Enter the Microsoft Application (client) ID, in UUID format.");
  if (clean.tenant && !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(clean.tenant))
    throw new Error("Enter a Microsoft tenant ID or domain, or use common.");
  const previous = Object.values(clientConfigKeys).map((key) => [key, localStorage.getItem(key)]);
  try {
    for (const key of Object.keys(clientConfigKeys) as (keyof ClientSettings)[]) {
      if (clean[key]) localStorage.setItem(clientConfigKeys[key], clean[key]);
      else localStorage.removeItem(clientConfigKeys[key]);
    }
  } catch (error) {
    for (const [key, value] of previous) {
      if (key) {
        if (value === null) localStorage.removeItem(key);
        else if (value !== undefined) localStorage.setItem(key, value);
      }
    }
    throw error;
  }
}
