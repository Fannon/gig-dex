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
The command fails for clipping, page overflow, or browser errors. Scroll
fallbacks are reported separately. Inspect PNGs as well as the measurements.

`npm run validate` checks lint, TypeScript, and unit tests. `npm run verify`
also builds the application and runs browser tests, which attach synthetic-song
screenshots to the Playwright report.

---

*Made with ☕ and "vibes".*
