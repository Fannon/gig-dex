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

- **Framework**: React 18 + TypeScript
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

# Run verification (lint + test + build)
bun run verify
```

---

*Made with ☕ and "vibes".*
