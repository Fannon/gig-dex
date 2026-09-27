# Gig-Dex 🎸

**Gig-Dex** is a digital songbook and set list manager designed for musicians who need their repertoire at their fingertips, available everywhere as an offline-first web application. 

> [!WARNING]
> This project is in a **DRAFT** state. It is a side-project developed primarily through "vibe-coding"—expect rapid changes, experimental features, and code that prioritizes momentum over perfection.

## 🚀 Current Features

- **ChordPro Support**: Full support for the ChordPro format, keeping lyrics and chords perfectly aligned.
- **Dynamic Transposition**: Instantly transpose songs to any key to suit your vocal range or instrument.
- **Offline First**: Uses IndexedDB (via `idb`) for robust offline performance—your songs are available even when the stage Wi-Fi isn't.
- **Auto-Scaling Display**: Smart font-size scaling that ensures songs fill the available screen space without messy overlaps.
- **Set-list Management**: Create, edit, and organize set-lists for your upcoming gigs.
- **Search**: Quick filtering by song title, artist, or custom tags.

## 📅 Roadmap (Potential Features)

- **GDrive Sync**: Sync songs to Google Drive. Maybe other Drive Services, too.
- **Fuzzy Search & Scoring**: Upgrading the search engine to use advanced fuzzy matching and scoring for faster results.
- **Gig Mode**: A refined setlist UI featuring a persistent sidebar for reordering and quick-navigation (arrow keys/buttons) between songs.
- **In-View Search**: A dedicated search bar within the song view for instant repertoire jumping.
- **Import/Export**: Tools to backup your data or import large libraries.

## 🛠️ Tech Stack

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite
- **Storage**: IndexedDB (Browser-native)
- **Linting**: [Biome](https://biomejs.dev/)
- **Testing**: Vitest (Unit) & Playwright (E2E)
- **Deployment**: GitHub Pages

## 💻 Getting Started

This project uses `bun` but should work fine with `npm` or `yarn`.

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Run verification (lint + test + build + e2e)
bun run verify
```

## Song layout review

The song view measures the rendered chord/lyric pairs and compares one to six
columns at font sizes from 12–36px. It chooses the largest fitting size, favoring
fewer columns on ties. Sections stay together when possible; oversized sections
split between complete lines. Changes to the viewport, chords, notation, and
transposition trigger a new fit. Manual font controls keep your chosen size and
reconsider the columns. Songs that cannot fit remain accessible by scrolling.

```bash
# Synthetic songs at desktop, tablet, phone, and landscape sizes:
npm run screenshots
# Sample private ChordPro files (never added to the repository):
npm run screenshots -- --input tmp/import --output reports/song-layout-private
# Check every song without generating hundreds of screenshots:
npm run screenshots -- --input tmp/import --limit 0 --audit-only --output reports/song-layout-audit
```

The utility launches Vite on port 5174 and an isolated Playwright Chromium
context. Install Chromium once with `npx playwright install chromium`.
Use `--url http://localhost:5173/` to reuse a running Vite development server.
`VITE_BASE_PATH` is supported. `--limit` defaults to six files sampled across
file sizes; zero checks all files. Outputs are restricted to ignored `reports/`
or `tmp/` directories and include an HTML gallery, PNGs, and `metrics.json`.
`--start N` starts at the Nth selected song (one-based), allowing interrupted
audits to continue into a separate output directory. The metrics identify
invalid ChordPro songs that use the safe raw-text recovery view.
The command fails for clipping, page overflow, or browser errors. Scroll
fallbacks are reported separately. Inspect PNGs as well as the measurements.

`npm run validate` checks lint, TypeScript, and unit tests. `npm run verify`
also builds the application and runs browser tests, which attach synthetic-song
screenshots to the Playwright report.

---

*Made with ☕ and "vibes".*

### Setlist workspace

Setlists use three panels: a library with name/description/tag search, tag filtering
and sorting; an editable ordered song list; and a scrollable song preview. Edit
setlist names, tags and descriptions, or duplicate a setlist to preserve its song
order (including repeats) as a starting point. Add songs from the searchable
library and move or remove individual occurrences. Smaller screens switch
between panels using Setlists / Songs / Preview tabs.

Browser checks capture synthetic workspace screenshots at desktop, tablet and
phone sizes in ignored `reports/setlists/`. Run `npm run test:e2e -- e2e/setlists.spec.ts`.
To test a deployment base path while leaving your live server running, use
`VITE_BASE_PATH=/gig-dex/ PLAYWRIGHT_PORT=5176 npm run verify`.

### Backup and import

Settings exports a versioned JSON backup containing the entire library, including
setlists, song order, tags and extended metadata. Restore validates every record
and song reference before writing both stores in one transaction. Its default
merge mode skips identical records and keeps different versions with new IDs,
remapping imported setlists to their imported songs. Replace mode requires
confirmation and marks restored records as newly modified.

Import multiple ChordPro files from Settings. Source text and extended metadata
are preserved, identical source text is skipped, and the results identify each
file's status. Malformed chord markup is retained as raw text for editing; empty
files are rejected. Private song inputs and generated screenshots remain ignored.

### Sync deletions and conflicts

Sync now records deletions durably and exchanges them across devices. Competing
edits, including deletion versus editing, are retained for review in Settings.
Expand each version and keep this device's version, a remote version, or separate
copies. Resolution is saved locally; sync again to share the choice. Local edits
made during sync or after conflict detection are protected from being overwritten.
Backups also contain deletion records and unresolved conflict snapshots.

Drive uploads append immutable revisions with parent links. Concurrent uploads
remain separate branches, and sync joins reviewed branches instead of overwriting
one by upload time. Revision history is retained in the Drive folder and will grow;
retention/compaction is a future feature. All devices should use the updated app;
legacy clients still use the old timestamp-based algorithm. API behavior is tested
with mocked HTTP and two simulated devices using real IndexedDB. Live OAuth/Drive
verification remains necessary with a configured account.

Revision joins respect [Drive's custom property limits](https://developers.google.com/workspace/drive/api/guides/properties);
large joins use intermediate revisions. Normal local editing and previewing do
not connect to Drive.

### Reading long songs

Songs that cannot fit at the automatic minimum font use a readable scroll view.
Wrap lines is enabled there by default: words stay intact, and chords stay above
their corresponding lyric fragments, including changes inside words. Disable it
for the original unbroken lines. Set Minimum font to 12–20px; that preference is
remembered locally. Setlist previews also use this reading layout.

Lyrics, labels and comments are rendered as literal text; user-authored HTML and
inline style attributes cannot enter the live song DOM. Display font and color
come from the app's controls and stylesheet. Source ChordPro remains unchanged.
Screenshot metrics include fitting time, candidate count and fitting pass count
for performance comparisons on the same songs and viewports.

### Loading and fitting performance

Pages load on demand. The song library's demo text is separate from the chord
engine; empty setlist and settings pages do not load it. Parser/HTML imports are
named, and the build omits unused jsPDF initialization. PDF APIs are not supported
by this build configuration; revisit that setting before introducing PDF export.
The main JS is about 244kB and the deferred chord engine about 277kB, with no PDF
chunks or large-chunk warning. PWA precaching retains all routes for offline use.

Fitting caches unchanged geometry and inputs, reuses table nodes, and rejects
impossible widths/heights before forcing column fragmentation. Font loading,
content, chord controls, minimum size and real container changes invalidate the
cache. Literal tab tables are included in bounds checks. Synthetic screenshot
metrics compare the same songs/viewports; timings depend on the host.

For production loading/offline verification, build and start `npm run preview --
--port 5177`, then run `PLAYWRIGHT_URL=http://localhost:5177/ npm run test:e2e --
e2e/production.spec.ts`. Stop the preview before rebuilding for another base path.

## Performance mode

Use **Perform** on a song or **Perform setlist** in the setlist content panel.
Fullscreen uses the browser API and remains optional. Large Previous/Next song
buttons follow setlist order, including repeated occurrences and missing songs.
The selected occurrence and each occurrence's reading position are remembered
locally; changed song content resets its position. Reading supports automatic
screen fitting, scrolling, or page stepping with overlapping complete visual
lines so no text is skipped. Song controls can be shown when needed.

**Tempo (BPM)** is already stored with each song and imported from `{tempo: 120}`.
Click the four-dot BPM indicator to start/stop a silent visual pulse. It follows
a monotonic clock, updates once per beat, and resets between song occurrences.
It is a visual rehearsal cue, not an audio metronome or background timing source.
Dirty song/setlist drafts prompt before navigation or cancellation, and browser
reload/closing uses the browser's unsaved-changes warning. Successful saves do
not prompt.

## OneDrive configuration

Register a Microsoft Entra application named Gig-Dex, choosing the intended
account types (personal and/or work/school). Add a **Single-page application**
redirect URI pointing to `onedrive-callback.html` at the deployed app base:

- Local: `http://localhost:5173/onedrive-callback.html`
- GitHub Pages: `https://fannon.github.io/gig-dex/onedrive-callback.html`

Grant delegated Microsoft Graph `Files.ReadWrite.AppFolder` permission. Put the
public application ID in ignored `.env.local`:

```dotenv
VITE_MICROSOFT_CLIENT_ID=your-application-client-id
VITE_MICROSOFT_TENANT=common
```

No client secret is used. `common` allows the account types enabled in the
registration; a specific tenant ID can restrict organizational sign-in. Restart
Vite after changing environment variables. For GitHub Pages, set the corresponding
repository variables; the workflow passes them to the production build. Existing
Google configuration can use the `VITE_GOOGLE_CLIENT_ID` repository variable too.

Connect OneDrive in Settings. Tokens stay in the tab's session storage; refreshed
sessions do not require another popup while valid. Files live in the app folder.
Google Drive and OneDrive keep separate per-folder acknowledgements/conflicts.
OneDrive caches revision metadata by eTag in IndexedDB, avoiding repeated history
downloads; current heads are downloaded and validated during sync. The cache is
expendable and excluded from backups. First sync must read the remote history.

Implementation follows Microsoft's [PKCE authorization flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow),
[app-folder API](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder),
and [browser download requirements](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0).
Popup/Graph behavior is covered with mocked browser requests; live account and
organizational consent testing still require a configured registration.

## Conflict comparison and revision cleanup

Settings compares metadata and highlights added/removed song lines before
resolution. Large comparisons bound their computation and still preserve both
complete versions. Concurrent and manually changed remote content remains subject
to review, including changes after a resolution was chosen.

After syncing/resolving conflicts, use **Review history cleanup** for a connected
host. Preview identifies obsolete uploads older than 30 days while retaining
current heads, competing branches, five older revisions and necessary ancestry.
Confirmation moves only reviewed obsolete files to the host's trash/recycle bin.
The plan expires after ten minutes; remote changes require a fresh preview.
Conditional requests stop if a revision changed. Cleanup and sync are serialized;
interrupted cleanup reports progress and leaves current heads intact. Legacy
history without creation/concurrency information is retained. Google cleanup
also requires an ETag response; if unavailable, it stops instead of removing files.
Local deletion markers and acknowledged snapshots are retained for offline devices.

[Google trash behavior](https://developers.google.com/workspace/drive/api/guides/delete)
and [OneDrive conditional deletion](https://learn.microsoft.com/en-us/graph/api/driveitem-delete?view=graph-rest-1.0)
determine recovery and concurrency behavior. Cloud trash follows host retention;
exporting a library backup remains useful before cleanup.
