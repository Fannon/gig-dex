# Direct Dropbox sync

Gig-Dex can sync directly with a Dropbox account from desktop or mobile browsers. This needs a Dropbox app you register yourself; the app key is public, and Gig-Dex never needs the app secret. The connection uses Dropbox's app folder, so it can access only files in `Apps/<your app name>`. Gig-Dex stores revisions there and uses its usual merge and conflict review when two devices change the same song or setlist.

## Set up your Dropbox app

1. Open the [Dropbox App Console](https://www.dropbox.com/developers/apps) and choose **Create app**.
2. Choose **Scoped access** and **App folder** access. Give it a name. App folder access is important: full Dropbox access is unnecessary.
3. In the app's **Permissions** tab, enable `files.metadata.read`, `files.content.read`, `files.content.write`, and `account_info.read`. Submit the permission changes.
4. In **Settings**, add an exact **OAuth 2 Redirect URI** for each Gig-Dex URL you use:
   - Hosted app: `https://fannon.github.io/gig-dex/dropbox-callback.html`
   - Local development: `http://localhost:5173/dropbox-callback.html` (adjust the port if Vite uses another one)
   - A custom deployment: `<origin><base-path>dropbox-callback.html`
5. Copy the **App key** from Settings. Do not copy the app secret into Gig-Dex.
6. Open **Gig-Dex → Settings → Sync → Advanced setup: cloud Client IDs**, paste the key into **Dropbox app key**, and save. Then select **Connect Dropbox** and approve the requested permissions. Repeat the app key entry and connection on each browser or device.

Dropbox may restrict an app in development mode to its registered users. Add other accounts as development users in the App Console, or follow Dropbox's production approval process before sharing it more widely.

## Using sync

After connecting, Gig-Dex syncs completed song and setlist edits, imports, and library cleanup automatically while the app is open. Several changes made together are sent in one run. On another device, select **Sync now** before editing to pull those changes. Gig-Dex keeps local data available offline, but direct Dropbox sync needs a network connection. If sync fails, the reason appears under Dropbox in Settings; fix it and press **Sync now**. If a conflict appears, review it in Settings, resolve it, and sync again. **Stop syncing** removes the browser's session credentials; it leaves songs and Dropbox files intact. The app key stays in this browser until you clear the override.

Dropbox access and refresh tokens live in this browser's session storage. You may need to reconnect after the browser session ends. Gig-Dex does not include tokens or the app key in library backups. Use **History cleanup** only after reviewing the preview; it removes old revisions with Dropbox's conditional revision check and retains current history. For an option without Dropbox app registration on desktop Chrome or Edge, use [local folder sync](local-folder-sync.md) with a folder inside your Dropbox desktop folder.

The [Dropbox OAuth guide](https://developers.dropbox.com/oauth-guide) describes the PKCE authorization flow; the [HTTP API reference](https://www.dropbox.com/developers/documentation/http/documentation) covers the file operations and scopes.
