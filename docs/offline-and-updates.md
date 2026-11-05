# Offline use, installation and updates

Gig-Dex is a progressive web app. After its files have been downloaded once, it opens and works without a connection; your songs and setlists are stored on the device. Only cloud sync needs the internet.

## Install the app

In Chrome or Edge, use the browser's **Install app** or **Add to home screen** action (**Settings → Offline → Install Gig-Dex** explains the steps, including for Android tablets). The installed app opens in its own window, starts offline, and can keep the screen awake during a gig. An installed app shares its library with the browser it was installed from.

## Keep your library on this device

**Settings → Offline** shows whether the app files are ready offline, how many songs and setlists are stored, storage use, and connectivity. **Protect local storage** asks the browser not to clear Gig-Dex's data when space runs low. Protection lowers the risk, but clearing site data in the browser still removes the library, so keep [backups](backup-and-import.md) too.

## Updates

New versions download in the background. A small **App update ready** indicator in the navbar means a new version is waiting; open it and select **Update and restart**. Updates never interrupt you:

- They wait while you perform, edit with unsaved changes, sync, clean up history, or import, restore or export a library. The menu says what must finish and offers **Restart when ready**, which you can cancel.
- With several Gig-Dex tabs open, the restart is coordinated across them where the browser supports it; otherwise Gig-Dex asks you to close the other tabs.
- Saved songs, setlists and reading preferences stay on the device.

## Repair

If a page fails to load, Gig-Dex shows a recovery view with a link back to your library. **Settings → Offline → Repair app files** re-downloads the app itself. It checks that the server is reachable first and only removes Gig-Dex's own cached app files: songs, setlists, preferences and other sites' caches are untouched. It cannot repair a damaged library or bring back deleted browser storage.

## Known limits

Device power policies can refuse or release the screen wake lock. Before relying on a new device at a gig, test an airplane-mode cold start, a device restart, orientation changes and switching apps during performance.
