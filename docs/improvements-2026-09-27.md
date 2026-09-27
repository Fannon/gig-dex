# Setlist overhaul and follow-up improvements — 2026-09-27

This follow-up implements the setlist redesign and the four priorities identified
in the [initial review](review-2026-09-27.md).

## Setlist workspace

Desktop and landscape tablets show three panels: a searchable/sortable setlist
library with tags, the selected setlist's ordered songs, and a scrollable song
preview. Names, descriptions and tags are searchable. Sorting supports recently
updated, name in both directions, and song count; tags also have a dedicated
filter. Names, tags and descriptions are editable.

Duplication preserves the full setlist and repeated song order with a fresh ID.
Adding songs is searchable by title/artist/tag and supports repeated occurrences.
Move and remove controls act on individual occurrences. Missing songs remain
visible rather than silently shifting indexes. Setlist URLs remain bookmarkable,
and browser Back returns between selections. Smaller screens use panel tabs.

Synthetic screenshots are in ignored `reports/setlists/`; browser checks verify
persistence, independent copies, filtering, sorting, reordering and preview scroll.

## Backup and import

Settings exports versioned complete-library JSON, including songs, setlists,
extended metadata, deletion records and unresolved sync conflicts. Restore
validates records and song references before a single transaction. Default merge
keeps differing versions with fresh identities and remaps imported setlists.
Replacement requires a count-specific confirmation, preserves creation dates and
marks intentional replacements as modified. Removed records produce sync deletion
markers. Merge does not revive previously deleted identities.

Multi-file ChordPro import preserves original source/directives, extracts metadata
and tags, skips identical source text, and reports per-file results. Empty files
fail; malformed chords remain recoverable as raw text for repair. Unit checks
include actual IndexedDB rollback and JSON-roundtrip duplicate detection; browser
checks exercise file selection, downloads, validation and replacement confirmation.

## Sync deletion and conflict handling

Deletion markers survive restarts and propagate across devices, removing repeated
setlist references when necessary. Per-device acknowledged snapshots detect
competing edits without trusting device clock ordering. Settings preserves and
shows local/remote versions, including deletion versus editing, and supports
explicit version choice or keeping separate copies. Changes made during sync or
since conflict detection cannot be silently overwritten.

Drive uploads append immutable revisions with ancestry rather than replacing a
file. Concurrent branches remain recoverable; resolved branches are joined.
Large joins use intermediate revisions within
[Drive's custom-property limits](https://developers.google.com/workspace/drive/api/guides/properties).
Old records are readable; first-sync differences without a common baseline are
reviewed as conflicts. All devices should upgrade together because older clients
still use the previous algorithm. Revision history grows and needs a future
retention policy. OAuth/Drive HTTP is mocked in tests; a configured live account
has not been exercised. Two-device scenarios use real IndexedDB snapshots.

## Phone reading and rendering

Scroll views wrap at word boundaries by default, keeping chord fragments aligned
and chords within one word together. All lyric text, whitespace and chord order
are preserved. Wrap lines can be disabled. An automatic minimum font of 12–20px
is remembered locally; manual size changes remain available. Setlist previews use
this readable layout. Unbroken words, chord-only lines and literal tab blocks can
still require horizontal scrolling. The PWA now allows landscape orientation.

Checks also revealed that the underlying HTML formatter interpolates user text.
Source angle brackets and ampersands are now escaped, structural output is
restricted, and user style/event attributes are removed before entering the live
DOM. Titles, labels, comments and lyrics remain literal text. Original ChordPro
is preserved in storage.

## Loading and fitting performance

The main production JS decreased from about 971kB to 244kB; the deferred chord
engine is about 277kB. Named parser/HTML imports plus targeted removal of unused
jsPDF initialization eliminate PDF-related chunks and the large-chunk warning.
Pages and previews load on demand. Before adding PDF export, revisit that build
setting. All route chunks remain precached for offline use.

Fitting caches equivalent geometry/inputs, reuses row nodes, and rejects impossible
intrinsic widths/heights before forcing column fragmentation. Content, controls,
container geometry and font loading invalidate the cache. Literal tab tables are
included in bounds checks.

On the same five valid synthetic songs at five viewports, actual fitting passes
fell from 87 to 33. Mean last-pass duration fell from about 217ms to 125ms; the
maximum fell from about 1,196ms to 502ms. Font sizes, column counts and fallback
choices were identical. These are host measurements, not tablet benchmarks.
Local before/after galleries and metrics are in
`reports/song-reading-before-performance/` and
`reports/song-reading-after-performance/`.

## Verification and remaining work

Lint, TypeScript, 91 unit tests, production build and 38 development browser tests
pass at both `/` and `/gig-dex/`. The separate production browser check passes on deferred
loading and offline song reopening through the service worker. Its test is
intentionally skipped in development. The validate skill documents both checks
and how to preserve the user's running development server.

The final private-collection audit checks all 286 songs at five viewports:
1,430 layouts, zero clipped layouts and zero browser errors. There are 450
readable scroll fallbacks, and one malformed song remains available as raw text
for repair. A separate six-song screenshot sample covers 30 layouts, with zero
clipping/errors; desktop and phone views were visually inspected.

Private inputs, images and measurements remain ignored and uncommitted.

Useful next work: real-device/readability profiling and Firefox/WebKit coverage;
live OAuth/Drive validation and revision retention; richer conflict comparisons
and coordinated song/setlist merging; pagination/fullscreen gig navigation; and
unsaved-edit protection. The current work implements the requested priorities,
while these broader extensions remain open.
