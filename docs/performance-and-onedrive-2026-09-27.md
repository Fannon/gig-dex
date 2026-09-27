# Performance navigation and OneDrive — 2026-09-27

## Implemented

- Performance routes for individual songs and setlists, including repeated and
  missing song occurrences. Enter from Perform / Perform setlist.
- Browser fullscreen, large Previous/Next song buttons, and optional song controls.
- Fit-screen, scrolling, and page-stepping modes. Pages overlap at visual line
  starts and preserve access to the end; the underlying reader remains scrollable.
- Local selected-occurrence and per-occurrence reading positions, invalidated
  when source content changes. Reading mode is remembered too.
- Existing Tempo/BPM metadata drives a silent four-dot indicator. Start/stop is
  explicit, timing uses a monotonic clock, work happens once per beat, and changing
  occurrence resets the cue. No audio or background timing guarantee is implied.
- Dirty song/setlist protection across cancellation, Escape, navigation, Back,
  and browser reload/closing. Successful saves proceed without a discard prompt.
- OneDrive authorization code + PKCE sign-in, refresh tokens in tab session
  storage, app-folder access, paged listings, browser-safe downloads, and immutable
  revision uploads. IndexedDB caches metadata by eTag and prunes vanished entries;
  current heads are still downloaded/validated. Schema v4 preserves older data.
- Per-folder/provider sync baselines and conflicts. Remote content edited in place
  or after review cannot be silently overwritten. Backups preserve scoped conflicts.
- Metadata comparison tables and line additions/removals in conflict review.
  Large comparisons bound their computation while preserving complete versions.
- Previewed history cleanup for Google Drive and OneDrive, serialized with sync.
  It retains current heads/deletion heads, competing branches, recent uploads,
  five older revisions and necessary links. Only obsolete, known revisions older
  than 30 days qualify. Plans expire in ten minutes and are rechecked before use.
  Conditional requests move files to host trash; partial failures report progress.
  Parent-before-child cleanup prevents old retained versions becoming new heads.

## Setup and limitations

OneDrive needs a Microsoft Entra application ID and registered SPA callback URI.
[README configuration](../README.md#onedrive-configuration) includes local/Pages
URLs, app-folder permissions, tenant settings and repository build variables.
No client secret is required. With no ID configured, Settings shows OneDrive as
unconfigured. Live personal/organizational account consent has not been exercised.
Microsoft OAuth/Graph browser requests are mocked in verification.

Legacy unscoped Google acknowledgements remain stored; the first scoped sync
reestablishes its baseline and reviews differing versions conservatively. Legacy
history without trustworthy upload/concurrency information is retained. Google
cleanup stops if the API provides no ETag. Local deletion markers and sync bases
are retained for offline devices. Cloud trash expiry follows the host's policy.

The first OneDrive sync must read history; very large cold starts and API quota
backoff still need real-account profiling. Conflict comparison assists explicit
version selection; it does not perform coordinated song/setlist merging.
Pagination is continuous-reader page stepping with overlap, rather than separate
stored pages. Fullscreen availability depends on browser support. Reading state
is local and is not included in cloud sync or exported library backups.

The required data router for navigation blockers increases the main production
JS from 244kB to approximately 297kB (96kB gzip); the 277kB chord engine remains
deferred. New routes stay precached for offline use. The main bundle remains much
smaller than the original 971kB build.

## Verification

Lint, TypeScript, 118 unit tests and production build pass. The development browser
suite has 43 passing checks and intentionally skips the production-only offline
check. Full verification passes at `/gig-dex/`; the root suite and targeted performance
checks also pass. The separate production check covers
lazy loading, offline song reopening and opening performance mode offline.

Screenshots of phone/desktop performance mode, the last song page, conflict
comparison and mocked OneDrive cleanup are under ignored `reports/performance/`
and `reports/sync/`. A six-song private collection sample covers five screen sizes
(30 layouts, zero clipping and zero browser errors). Desktop, phone and final-page
views were visually inspected. Generated lyrics/images remain ignored and uncommitted.
