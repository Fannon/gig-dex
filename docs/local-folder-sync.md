# Local folder sync and your own cloud Client IDs

In Settings → Sync, **Sync from a folder on this computer** selects a dedicated Gig-Dex
folder. Choose a folder inside your OneDrive, Google Drive, Dropbox or Nextcloud
desktop folder to let that application's desktop client transport revisions.
Local-folder sync itself works offline and needs no OAuth registration. Wait for
the desktop client to finish transferring files before syncing another device.

Folder picking requires a browser exposing `showDirectoryPicker`, normally Chrome
or Edge on desktop, over HTTPS or localhost. Unsupported browsers show alternatives;
mobile users can use Google Drive/OneDrive or export/import backups. An installed
Chromium PWA uses the same folder connection as its browser origin. Permissions
may need to be granted again after reopening. [Chrome's File System Access guide](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
explains handle persistence and permission renewal.

After a completed song or setlist edit, import, or library cleanup, Gig-Dex starts
folder sync automatically while the app is open and permission remains granted.
**Sync now** also pulls changes from other devices and merges songs, sets and
deletion markers through conflict review. It requests read/write permission again
when needed. **Choose a different folder** merges with the selected folder;
**Stop syncing** forgets the connection and leaves
the library and disk files intact. Moved or unavailable folders produce an error
with instructions to select a replacement. Unrelated files are ignored, and a
folder with many unrelated JSON files shows a recommendation to use a dedicated
folder. A malformed recognized revision stops sync until the file transfer or
repair finishes; it is never silently treated as a missing remote record.
Ordinary Gig-Dex backup files in the folder are ignored. To import one, select
it in Settings → Library → Restore backup, choose Merge, and press **Import**.
The connected folder then syncs the imported records automatically.

The directory handle and a random folder identity live in IndexedDB's
`syncHandles` store. That identity survives app restarts and selecting the same
connected folder again. Changing folders or reconnecting after disconnect creates
a new scope for acknowledgements/conflicts. Folder names do not determine scope.
Handles, Client IDs and OAuth tokens are excluded from library backups.

Each revision is a plaintext `gigdex-song-<revision>.json` or
`gigdex-setlist-<revision>.json`, containing the same record and `_sync` envelope as the
cloud providers. Song IDs/titles never enter filenames. Independent edits append
unique revisions, preserve branches, and join after conflict review; they never
overwrite an existing revision with different content. File writes publish on
closing the writable stream. Read errors, incomplete cloud downloads and content
changes detected after listing stop sync so it can be retried.

History cleanup uses the existing preview/retention rules. Local archival creates
verified copies inside `.gigdex-trash/`, named with their content hashes, and hides
only matching source versions from future sync listings. **The original files are
retained: no permanent delete or overwrite of a differing archive is performed.**
This deliberately does not reclaim disk space. A source changed concurrently stays
visible; older archive copies remain recoverable. Filesystem APIs do not provide
the conditional remote deletion used by the cloud providers, so copy-and-delete
would weaken the cleanup guarantee.

## Runtime cloud configuration

Under **Settings → Sync → Add sync provider**, expand **Configure Google Drive**,
**Configure OneDrive**, or **Configure Dropbox** beside that provider. Enter the
relevant OAuth Client ID or Dropbox app key. OneDrive also accepts a Microsoft
tenant (`common` by default for a saved Microsoft ID). Save to enable the host
immediately, without rebuilding. These are public client identifiers, not client
secrets. Changed app registrations require reconnecting their hosts.

Register the app's origin and redirect URLs in your own OAuth applications. Google
uses the Settings page URL as its redirect; Microsoft uses
`<origin><base-path>onedrive-callback.html` and requires a SPA redirect with personal
and/or organizational accounts permitted by your registration. The existing OAuth
flows and permissions are unchanged. Dropbox uses
`<origin><base-path>dropbox-callback.html`; see the [Dropbox setup guide](dropbox-sync.md).

Saved overrides live in this browser's localStorage and take precedence over the
build's `VITE_GOOGLE_CLIENT_ID`, `VITE_MICROSOFT_CLIENT_ID`,
`VITE_MICROSOFT_TENANT`, and `VITE_DROPBOX_APP_KEY`. Clearing an override restores the build-time fallback.
Settings displays the effective source. These settings are per browser/device.

Verification covers mocked directory handles, actual IndexedDB migrations,
two-device branch/join and delete-versus-edit conflicts, stale cleanup and retained
archive copies. Browser checks use real OPFS handles behind a stubbed picker to
test persistence, denial/retry, folder changes and disconnect. Real desktop picker
permissions and desktop cloud-client transport still need a manual two-profile
check with your chosen folder.
