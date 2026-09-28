# Gig-Dex 🎸

**Your digital songbook and setlist manager for the stage, the rehearsal room, and the couch.**

Gig-Dex keeps all your songs, chords, and setlists in one place, readable on phone, tablet, or laptop, even when the venue Wi-Fi gives up.

👉 **Try it:** https://fannon.github.io/gig-dex/

> [!NOTE]
> Gig-Dex is a hobby side-project, built mostly by "vibe-coding". It works well for daily use, but expect rapid changes and the occasional rough edge.

---

## For musicians

### What can I do with it?

- **Collect your repertoire:** keep lyrics + chords together, neatly aligned.
- **Play in any key:** transpose any song instantly and add a capo without rewriting anything.
- **Build setlists:** put songs in gig order, including repeats, notes, and per-song key/capo settings.
- **Perform distraction-free:** big, auto-fitting text, page-by-page or scrolling reading, simple Previous / Next navigation, optional visual beat pulse.
- **Find songs fast:** search by title, artist, tag, or setlist with `Ctrl+K` (`Cmd+K` on Mac).
- **Works offline:** once loaded, your library is on your device. No account, no subscription, no cloud required.

It understands the popular [ChordPro](https://www.chordpro.org/) format (`[Am]Hello [G]world`), so you can paste or import songs from many other tools. The simple editor also accepts the typical guitar-chords style with chord lines above the lyrics (like [Ultimate-Guitar chord sheets](https://tabs.ultimate-guitar.com/)) and converts it automatically. Editing happens in monospace so chords stay aligned. An explicit one-click import for that format is planned.

<table>
  <tr valign="top">
    <td><a href="docs/screenshots/tutorial-song.png"><img src="docs/screenshots/tutorial-song.png" alt="Tutorial Song with chords aligned over the lyrics" width="100%"></a></td>
    <td><a href="docs/screenshots/edit-song.png"><img src="docs/screenshots/edit-song.png" alt="Tutorial Song in the simple editor with live preview" width="100%"></a></td>
    <td><a href="docs/screenshots/demo-setlist.png"><img src="docs/screenshots/demo-setlist.png" alt="Demo Night setlist with ordered songs and song preview" width="100%"></a></td>
  </tr>
  <tr valign="middle" align="center">
    <td><em>The Tutorial Song. Tap "Add Demo Songs" to get it.</em></td>
    <td><em>Simple editor with live preview</em></td>
    <td><em>Demo Night setlist with song preview</em></td>
  </tr>
</table>

### Get started in 3 steps (no account needed)

1. **Open the app** in your browser (link above).
2. **Add songs:** go to *Settings → Import* and drop in a few `.pro` / `.chopro` / `.txt` ChordPro files, or create a new song and paste text.
3. **Make a setlist:** go to *Sets → New setlist*, tap **+** on songs to add them, then hit **Perform setlist**.

That's it. Everything is saved automatically on that device.

### Your songs are safe: backup & sync

Your library lives **on your device** (in your browser). That means it's private and offline-capable. You should still back it up or sync it if you use multiple devices.

**1. Backup file: simple and available to everyone**

*Settings → Backup → Export* downloads a single `.json` file with all your songs and setlists. Email it to yourself, put it on a USB stick, keep it somewhere safe. *Settings → Restore backup* brings it back, on any device.

Use this before gigs, before updates, before cleaning up. It just works.

**2. Local folder sync: recommended for automatic sync**

If you already use OneDrive, Google Drive, Dropbox, or Nextcloud on your computer, this is the easiest automatic option:

In *Settings → Sync → Sync from a folder on this computer*, pick a dedicated folder **inside** your existing sync folder (e.g. inside your OneDrive folder).

Gig-Dex writes small files there, and *your existing desktop sync app* carries them to your other computers. No extra login in Gig-Dex, no registration, works offline.

Limitations to know:

- Picking a folder only works in Chrome or Edge on desktop (browser limitation).
- On your phone/tablet, use the backup file above to transfer songs because mobile browsers can't pick sync folders.

Details: [docs/local-folder-sync.md](docs/local-folder-sync.md)

**3. Direct Google Drive / OneDrive / Dropbox sync: advanced only (bring your own app registration)**

Gig-Dex *can* talk directly to Google Drive, OneDrive, and Dropbox, but there is no shared, ready-to-click cloud integration:

> You have to register your **own** cloud app and paste its public Client ID or Dropbox app key into Gig-Dex under *Settings → Sync → Advanced setup: cloud Client IDs*.

That's doable if you're tech-savvy, but registering OAuth apps, redirect URLs, and consent screens is fiddly. **Most musicians should use option 1 or 2 above.**

For Dropbox, follow the [Dropbox setup guide](docs/dropbox-sync.md). For Google Drive or OneDrive, start with [docs/local-folder-sync.md](docs/local-folder-sync.md) ("Runtime cloud configuration").

### Install it like an app (Android / desktop)

Open the live URL in Chrome, then **⋮ → Add to home screen → Install**. It then opens fullscreen, stays available offline, and can keep the screen awake during a gig (see *Performance options*).

Before an important gig, open your setlist once while online, then try airplane mode and close/reopen the app. You'll see exactly what the stage will see.

---

## For developers

Gig-Dex is a React + Vite + TypeScript PWA. Storage is IndexedDB (via `idb`), sync is file-based revision exchange (local folder, Google Drive, OneDrive, Dropbox).

### Quickstart

This project uses `npm` (also works with `bun` / `yarn`):

```bash
npm install
npm run dev        # start dev server
npm run validate   # lint + typecheck + unit tests; run after every change
npm run verify     # validate + build + E2E tests; run before declaring "done"
```

More commands:

- `npm run test` / `npm run test:e2e`: Vitest / Playwright
- `npm run lint:fix` / `npm run format`: Biome
- `npm run screenshots -- --input tmp/import --output reports/song-layout`: song layout audit (see script help)
- `node scripts/readme-screenshots.mjs`: regenerate the synthetic README screenshots

### Docs

- Sync design (local folder + bring-your-own Client IDs): [docs/local-folder-sync.md](docs/local-folder-sync.md)
- Dropbox app setup: [docs/dropbox-sync.md](docs/dropbox-sync.md)
- Setlists workspace: [docs/sets-workspace.md](docs/sets-workspace.md)
- Offline / PWA / Android: [docs/pwa-offline-2026-09-27.md](docs/pwa-offline-2026-09-27.md)
- Performance mode, song defaults: [docs/song-defaults-and-performance.md](docs/song-defaults-and-performance.md), [docs/performance-and-onedrive-2026-09-27.md](docs/performance-and-onedrive-2026-09-27.md)
- Search & reading settings: [docs/search-and-reading-settings.md](docs/search-and-reading-settings.md)

OneDrive / Google OAuth setup for local development lives in those docs. End users don't need it.

---

*Made with ☕ and "vibes".*
