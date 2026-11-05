# Setlists

## The Setlists page

**Setlists** has three panels on desktop and landscape tablets: your setlists, the songs of the selected setlist, and a song preview. Smaller screens switch between them with the **Setlists / Songs / Preview** tabs.

- **New setlist** asks for a name, a date (prefilled with today, `YYYY-MM-DD`), tags and a description. **Edit details** changes them later; **Duplicate** copies the whole setlist, including repeats and keys.
- Search matches names, dates, descriptions and tags, not song contents. Sort by recent changes, gig date, name or song count, or filter by tag. The search stays in the URL, so it survives reloads and browser Back. Creating or duplicating a setlist clears the filters so the new one is visible.
- **Add songs** opens a searchable picker. A song can appear several times; the button then reads **Add again**. Adding a song never changes your library.
- Reorder with ↑/↓ or by dragging; remove one entry with ×. **Drop here to append** and **Drop here to remove** are explicit drag targets. Dragging is mainly a desktop interaction; use the buttons on touch screens.
- Entries whose song was deleted from the library stay visible as *Missing song* instead of silently shifting the order.
- In the preview, **Open song** opens that particular entry with its key.

## Keys per entry

Every setlist entry has its own transposition, so the same song can be played in different keys in different setlists, or twice in one setlist. Transpose in the preview, or open the entry and use **−1 / +1**; the change is saved for that entry only.

A song's **Standard transposition** (in the song editor, −24 to +24 semitones) is the starting point. It is copied into each new setlist entry when the song is added. Changing it later does not change existing entries. It never rewrites the song's chords. Entries in older setlists without saved settings use no transposition.

Entry labels read like `G | T-4 | 120bpm | 6/8`: key after transposition, transposition, tempo and time signature (4/4 when none is set).

## The current setlist in the sidebar

The lower part of the sidebar shows the **current setlist**: the one you opened last. From any song page:

- **+ Setlist** adds the song to the current setlist, or creates a setlist dated today when none is selected.
- **− Setlist** removes one occurrence, preferring the entry you are reading.

You can also drag songs from the upper sidebar into the current setlist, drag entries to reorder them, or focus an entry and press **Alt+Up / Alt+Down** to move it and **Alt+Delete** to remove it.

On a song page, **In N setlists** counts the distinct setlists containing the song. Select it to see them: the Setlists search then contains the song's complete ID, which matches setlists containing that song (partial IDs do not). You can combine it with other words or tags.

## Perform a setlist

**Perform setlist** opens the stage view for the whole setlist. See [Performance mode](performance-mode.md).
