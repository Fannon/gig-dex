# PWA reliability — 2026-09-27

Gig-Dex now provides explicit update activation, performance screen wake lock,
offline/library readiness, persistent-storage controls, installation guidance,
and app-file recovery. Settings → Offline & installation contains the controls;
performance mode contains Keep screen awake.

Updates wait for user activation and are blocked during performance, dirty
editing, sync/cleanup, and library imports/restores/exports. Web Locks coordinate
busy tabs where supported. Other browsers ask users to close other tabs. A changed
controller never automatically reloads a reader. Older app versions may retain
previous automatic-update behavior until reopened.

Wake lock is opt-in and remembered. The app reports denial/release, supports retry,
reacquires when visible, releases late acquisitions safely and releases on exit.
Device power policy can still refuse or release it.

Settings separates downloaded app readiness, local songs/setlists and missing
references, device connectivity, storage usage/protection, and backup exports.
Library counts refresh after data operations and sync. Cloud status remains in
Cloud Sync; Wi-Fi connectivity does not imply a reachable cloud host. Backup
export timestamps record a download request, not proof that a file was saved.

Status notices occupy their own space rather than covering controls. Performance
mode suppresses them. Route download errors provide recovery controls. App-file
repair checks the host before mutation and removes only this scope's service
worker/Workbox precache; IndexedDB, preferences and unrelated caches survive.
It does not repair corrupt library data or recover deleted browser storage.

## Verification

- Full `/gig-dex/` verification: lint, TypeScript, 126 unit tests, production build,
  and 46 passing development browser checks. Three production-only checks are
  intentionally skipped in that development suite.
- All three separate production checks pass: deferred chord loading/offline
  reopening; guarded upgrades across tabs with remembered reading position, cold
  offline relaunch, offline edits and scoped repair; failed downloads preserving
  the old app followed by a successful retry.
- Root-URL PWA settings, installation handler, wake-lock controls and route recovery:
  three browser checks pass.
- Offline song edits followed by mocked OneDrive sync preserve the edited version.
- Phone settings/installation, tablet performance and production settings
  screenshots were inspected under ignored `reports/pwa/`.
- Production checks now run in CI, and the validate skill documents them.

The upgrade utility serves two production deployment snapshots with changed HTML
and actual Workbox precache revisions. It does not independently compile two
versions with different JavaScript chunks or database schemas. Installation,
storage permission and wake-lock browser APIs are mocked where device policy
would make assertions nondeterministic; service-worker checks use real workers.

## Remaining checks

Test installed Chrome on a physical Android tablet: airplane-mode cold launch
and device restart, orientation changes, screen-awake behavior after switching
apps, battery-saving policy, and updates outside performance mode. Broader upgrade
coverage should include changing chunk URLs and database schema migrations between
compiled versions. Clearing app/site data still removes the library; persistent
storage complements exported backups rather than replacing them.
