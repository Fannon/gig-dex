# Sync and multiple devices

Your library lives in this browser's storage on this device. Sync copies changes between devices; a [backup file](backup-and-import.md) keeps a copy you control. Use at least one of them.

## Choose a method

| Method | Works on | Setup | Guide |
| --- | --- | --- | --- |
| Backup file | Everywhere | None | [Backup and import](backup-and-import.md) |
| Dropbox | Desktop and mobile browsers | Register your own Dropbox app once (about 5 minutes) | [Dropbox sync](dropbox-sync.md) |
| Local folder | Chrome or Edge on desktop | Pick a folder inside your OneDrive, Google Drive, Dropbox or Nextcloud desktop folder | [Local folder sync](local-folder-sync.md) |
| Google Drive / OneDrive (direct) | Desktop and mobile browsers | Register your own OAuth app and paste its public Client ID | [Runtime cloud configuration](local-folder-sync.md#runtime-cloud-configuration) |

Most musicians should use Dropbox or a local folder. Using one provider per library avoids extra conflict paths (see [Multiple configured providers](sync-format.md#multiple-configured-providers)).

## When Gig-Dex syncs

Connected Dropbox, OneDrive and local folders check for remote changes when Gig-Dex opens, and sync after you save a song or setlist or finish an import. Several changes made together go out in one run. Press **Sync now** in **Settings → Sync** to pull changes that another device made while Gig-Dex stayed open. Direct Google Drive always needs **Sync now**, because its sign-in can open a popup.

Failed syncs retry after your next saved edit, when you return to the app, or when the browser comes back online. Songs and setlists stay available offline either way.

## Status and activity

The navbar sync icon rotates slowly on a colored background while sync runs, turns red when sync needs attention, and stays grey when no provider is connected. Select it to open sync settings. With reduced motion enabled, the icon stays still and only changes color.

**Settings → Sync → Active syncs** lists connected providers first. Each provider's **Recent activity** shows the current stage, start time and elapsed time, and for finished runs how many songs and setlists were added, updated or removed, counted separately as **Sent** and **Received**. Unchanged records are not counted; a failed run still shows the changes that completed.

## Conflicts and deletions

Sync never decides by device clock. Each device remembers which version it last exchanged with each provider. If two devices change the same song or setlist, or one edits what another deleted, Gig-Dex keeps both versions and shows a conflict in **Settings → Sync**. Compare the metadata and changed lines, then keep one version or keep both as separate songs. Changes made during a sync or after a conflict was detected are never silently overwritten.

Deleted songs and setlists leave a small deletion record that travels to other devices, so an offline device learns about the deletion later. Update all your devices together after a sync-related release.

## Several tabs

Open tabs refresh their library lists when another tab saves or syncs. Unsaved song drafts and an active performance stay in place. Sync runs wait for each other across tabs; cleanup and connection changes stop and ask you to retry if another tab is busy.

## History cleanup

Sync folders are a revision log and grow over time. **History cleanup** under each provider first shows a preview. It keeps every current version, every unresolved branch and the five newest older revisions of each song or setlist. Only older revisions that are more than 30 days old are removed. A preview expires after ten minutes and is checked again before anything changes. Cloud providers move removed files to their trash; local folders copy them into `.gigdex-trash/` and keep the originals (see [Local folder sync](local-folder-sync.md)).

## Direct Google Drive and OneDrive

There is no shared, ready-made cloud integration. Register your **own** OAuth app and paste its public Client ID under **Settings → Sync → Add sync provider → Configure Google Drive** or **Configure OneDrive**. No client secret is needed. See [Runtime cloud configuration](local-folder-sync.md#runtime-cloud-configuration) for redirect URLs.

- **OneDrive** needs a Microsoft Entra application with a single-page-application (SPA) redirect to `<origin><base-path>onedrive-callback.html`. Gig-Dex uses the authorization code flow with PKCE and only accesses its app folder. The sign-in lasts for the browser tab session.
- **Google Drive** uses the Settings page as its redirect URL and stores files in a `Gig-Dex` folder.

Both flows are tested against mocked APIs; real-account consent screens vary with your registration and account type.

## Troubleshooting

Open the provider's **Recent activity** for the error reason. For details, open the browser console and filter for `[Gig-Dex sync]`. Errors include the provider, operation, HTTP status, API reason and request ID when available. Request bodies and authorization headers are never logged, and tokens and signed download URLs are redacted.

Provider-specific advice is in the [Dropbox](dropbox-sync.md#troubleshooting-failures) and [local folder](local-folder-sync.md) guides. The on-disk format is described in [Sync folder format](sync-format.md).
