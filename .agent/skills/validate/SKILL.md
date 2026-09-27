---
name: validate
description: Verify Gig-Dex changes with lint, TypeScript, unit tests, and full browser checks; use the screenshot workflow for song display changes.
license: MIT
---

# Validate Gig-Dex

Run commands from the repository root. Dependencies are locked with `bun.lock`:
if tooling is missing, use `bun install --frozen-lockfile` rather than generating
an npm lockfile. The npm scripts work with the installed Bun dependencies.

After each meaningful implementation change, run:

```bash
npm run validate
```

This checks Biome, TypeScript, and Vitest. Fix failures before proceeding. For
formatting or lint fixes, target changed files where practical rather than
rewriting unrelated work:

```bash
npx biome check --write path/to/changed-file.ts
npm run validate
```

Before declaring completion or committing critical-path fixes, run:

```bash
npm run verify
```

This adds the production/PWA build and Playwright E2E tests. Playwright starts
Vite itself; install its browser if needed with `npx playwright install chromium`.
Report environment blockers and distinguish checks that passed from checks that
could not run. Do not claim a browser check passed based only on unit tests.
Use relative URLs such as `./settings` in browser tests so they respect the
configured base URL. For routing or deployment changes, also verify with
`VITE_BASE_PATH=/gig-dex/ npm run verify`, matching the CI configuration. Set `PLAYWRIGHT_PORT=5176` to run a separate
test server while preserving the user’s live-reload instance.

## Song display visual checks

For layout, font, column, or responsive-control changes, capture and inspect
screenshots in addition to passing the automated bounds assertions:

```bash
npm run screenshots
# Personal collection, sampled across file sizes:
npm run screenshots -- --input tmp/import --output reports/song-layout-private
# Audit every local song at all five viewport sizes without producing all images:
npm run screenshots -- --input tmp/import --limit 0 --audit-only --output reports/song-layout-audit
```

Open the generated `index.html`, inspect representative PNGs, and read
`metrics.json`. Check lyric/chord alignment, readable controls, section order,
clipping, and access to the last line in scroll fallbacks. A scroll fallback is
valid when the entire song cannot fit at the minimum font size; a hidden line is
not. The script exits nonzero for clipping, page overflow, or browser errors.

The utility starts its own Vite server on port 5174, or accepts `--url` for an
existing **development** server. Its browser context has isolated IndexedDB.
Avoid changing application sources during an audit. If interrupted, `--start N`
continues from the Nth selected song into a separate output directory. Combine
batch measurements only when previously checked rendering behavior is unchanged;
confirm every selected song/viewport occurs once before claiming full coverage.
Invalid ChordPro is reported separately and shown as escaped raw text for repair.
Only synthetic lyrics belong in committed fixtures. Personal songs and all
screenshots/reports stay under ignored `tmp/` or `reports/`; never stage those
artifacts or copy their lyrics into source files or review reports.

## Loading, offline behavior, and performance

After changing lazy routes or bundling, verify the production build itself:

```bash
npm run build
npm run preview -- --port 5177
# In another terminal:
PLAYWRIGHT_URL=http://localhost:5177/ npm run test:e2e -- e2e/production.spec.ts
```

This checks deferred chord loading and offline reopening through the service
worker. Stop this preview before another build changes `dist/`; keep the user's
live-reload instance running when requested. The production test is skipped in
the regular development suite, so report its result separately.

Compare screenshot metrics on matching inputs/viewports before claiming fitting
improvements. Report fitting passes as well as duration, and confirm font sizes,
column counts and fallback behavior remain equivalent. Inspect wide-line phone
reading and the final line of a scrolled song. Unbroken words may still need
horizontal scrolling; wrapping must preserve all lyric text and chord positions.

## Performance navigation and sync

Performance browser checks must cover repeated setlist occurrences, independent
reading positions, reloading the selected occurrence, reaching the last page,
and fullscreen entry/exit. Inspect phone and desktop screenshots under
`reports/performance/`. Test dirty song/setlist navigation, rejected cancellation,
Escape and browser Back, as well as successful saving without discard prompts.
The visual tempo is silent: verify its start/stop behavior and beat progression;
do not claim audio-metronome precision from a browser timer check.

Cloud changes require mocked HTTP tests and the browser OAuth popup loop.
OneDrive checks assert S256 PKCE, reject mismatched state and off-origin paging,
and ensure download requests contain no bearer token. Mock public client IDs only
inside isolated browser contexts, preserving the user's server configuration.
Test provider/account scope separation, deletion/conflict durability, and changes
to a remote version after acknowledgement or review. Retention checks must prove
that previews do not mutate, stale plans/concurrency failures stop cleanup, heads
and branches survive, and interruption cannot expose older history as current.
Report mocked coverage separately from live account/consent verification.
