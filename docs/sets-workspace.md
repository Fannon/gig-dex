# Sets workspace

New sets prefill their date with today’s local calendar date.

The Sets header uses the same compact spacing, sizing and button styling as the
song header. In the preview, **Open song** shares the SONG PREVIEW heading row and
opens that particular set occurrence, retaining its transposition.

Drag a song from the upper sidebar into the set content to add it. Drag a set
entry to reorder it; the before/after marker shows where it will land. Reordering
moves the entry's saved transposition with it and keeps the preview on that entry,
even when the same song occurs multiple times. **Drop here to append** provides an
explicit target after the final entry, including empty sets.

**Drop here to remove** exists in the Sets content and the current-set sidebar.
It only accepts an occurrence from that same set. It never deletes the library
song; dropping a library song on it does nothing. Add, move and remove buttons in
Sets remain available, and sidebar links support Alt+Up/Down for reordering and Alt+Delete for removal.
Native browser drag-and-drop is mainly a desktop interaction; use the buttons
on touch devices.

In normal song mode, **In N Sets** counts distinct sets containing the song,
rather than repeated occurrences. Clicking it opens Sets with the complete song
ID in the search. A complete UUID search token filters membership by exact ID;
partial IDs do not match membership. Other tokens still search set names, tags,
dates and descriptions, so an ID can be combined with a tag. The active query stays in the URL when switching sets and survives reload and
browser Back. Creating or duplicating a set clears filters to expose the new entry. Regular text searches do not search song contents.
