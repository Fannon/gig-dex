# Architecture notes

Background for contributors: why things are built the way they are. User-facing behavior is described in the other guides in this folder.

## Stack and layout

React + Vite + TypeScript, routed with React Router's data router (needed for unsaved-change blockers). Pages live in `src/pages`, shared UI in `src/components`, pure logic in `src/utils`, and sync in `src/sync`. Everything except the home page is loaded on demand.

## Storage

The library is stored in IndexedDB (`GigDexDB`, via `idb`; see `src/db.ts`):

| Store | Contents |
| --- | --- |
| `songs`, `setlists` | Library records with UUIDs and ISO `createdAt` / `lastModified` |
| `tombstones` | Deletion records, so deletions can sync to offline devices |
| `syncBases`, `syncConflicts` | Last exchanged version per provider and record, and unresolved conflicts |
| `revisionCache` | Verified remote revisions, to avoid re-downloading unchanged files |
| `syncHandles` | Local-folder directory handles and their stable folder identity |

ChordPro `content` is the source of truth for lyrics and chords. Primary metadata (title, artist, key, tempo, time, tags) is also stored as fields for fast lists and search; extended directives such as composer or album are preserved in the text. Setlists store ordered `songIds` with a parallel `songSettings` array (per-entry transposition), so repeated songs are independent entries.

Schema upgrades run inside the IndexedDB upgrade transaction. The v1→v2 migration (numeric IDs to UUIDs) reads everything first and rolls back to the intact v1 data if conversion fails. Per-device preferences (theme, notation, minimum font, columns, performance mode, reading positions) live in `localStorage`.

## Rendering songs

`src/utils/chordEngine.ts` wraps [ChordSheetJS](https://github.com/martijnversluis/ChordSheetJS):

- **Safety:** the HTML formatter interpolates user text, so source `&`, `<` and `>` are escaped before parsing, only the formatter's structural elements and `class` attributes survive, and everything else becomes text. Malformed ChordPro is shown as escaped raw text with a hint to repair it.
- **Sections:** labels are colored by category (verse, chorus, bridge, …). Comments that look like section labels, which older imports produced, are promoted to labels.
- **Notation:** German spelling and Nashville/Roman numerals are applied at render time; stored chords never change.
- **Simple editor:** converts between ChordPro and chords-over-words text without normalizing chord spellings. Section labels (`Verse 1`, `Chorus`, or any bracketed `[Label]`) become verse, chorus or bridge sections by name, and unlabeled sections get a default label. Other directives stay in the simple text verbatim. Lyric lines that merely start with a section word are protected from ChordSheetJS's section heuristics. `simpleEditorChanges` round-trips a song and compares chords, lyrics, labels and directives; songs it cannot keep (annotations, some chord symbols) open in Advanced with an explanation, and untouched simple text never rewrites the stored ChordPro.

## Fitting songs to the screen

`SongView` measures the real rendered chord/lyric tables. `findSongLayout` searches font sizes from 36px down to the minimum (12–20px, user setting), trying 1…N columns at each size, and takes the largest size that fits, preferring fewer columns. The search is descending because column fragmentation is not monotonic. Every row is checked for horizontal and vertical overflow, including overflow into implicit extra columns. Geometry and inputs are cached; resizing, font loading, notation, transposition and chord visibility trigger a refit. If nothing fits, the song scrolls in one column at 18px or the minimum font, with optional word-boundary wrapping that keeps chords above their syllables.

`npm run screenshots` renders songs at five viewports and reports clipping and fallbacks; see `.agent/skills/validate/SKILL.md`. Only synthetic lyrics belong in the repository.

## Bundle and offline

The chord engine (ChordSheetJS) is the largest dependency and loads only when a song is shown or the demo songs are added. `production.spec.ts` checks this. ChordSheetJS imports jsPDF eagerly; `vite.config.ts` drops jsPDF's side effects because Gig-Dex never uses PDF output. Revisit that before adding PDF export. All route chunks are precached by the service worker (`vite-plugin-pwa`, `registerType: "prompt"`).

`src/pwa/lifecycle.ts` controls updates: a waiting service worker activates only on request, and never while performance, unsaved edits, sync, cleanup or library imports/exports are registered as blockers. Web Locks coordinate tabs where available.

## Sync

Sync exchanges immutable, content-addressed revision files with parent links, as described in [Sync folder format](sync-format.md). Each provider (`src/sync/*Provider.ts`) implements listing, reading and writing files; `SyncManager` does the merge. Per-provider baselines detect concurrent edits without trusting clocks; competing heads become conflicts for the user to resolve. History cleanup (`revisionHistory.ts`, `revisionCleanup.ts`) plans removals from a reviewed preview and rechecks it before acting.

## Testing

- **Unit (Vitest + jsdom + fake-indexeddb):** pure logic, the database including migrations and rollback, sync with in-memory providers, and two-device scenarios using real IndexedDB snapshots. Cloud HTTP is mocked.
- **E2E (Playwright, Chromium):** specs seed data through `e2e/fixtures.ts`, so they do not depend on the in-app demo songs; only the demo tests in `home.spec.ts` use them. Local-folder specs use real OPFS handles behind a stubbed picker.
- **Production specs** (`production.spec.ts`, `pwa-production.spec.ts`) run against a built preview, including a two-deployment upgrade fixture (`scripts/pwa-upgrade-server.mjs`). They are skipped in the dev suite and run separately in CI.

Not yet covered: Firefox and WebKit, real devices (installed Android tablet, wake lock under power saving), live OAuth consent for each provider, and upgrades across compiled versions with different database schemas.
