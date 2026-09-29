# Search and reading preferences

Open the centered search dialog with **Ctrl+K** (Windows/Linux) or **Cmd+K** (Mac).
Search includes song titles, alternative titles, artists and tags, as well as set
names, dates, descriptions and tags. Matching text is highlighted safely as React
text nodes, including literal punctuation such as `[North]`. Song results show
**In N Sets**, counting distinct sets rather than repeated occurrences. Counts are
cached with the set library rather than recalculated on every search keystroke.

A token starting with `#` matches an entire tag, case-insensitively: `#test` finds
the `test` tag, not the `testing` tag or songs with “test” only in their title.
Combine tags and words, for example `#test acoustic`. Multiple terms must all
match. This also works in the sidebar, Sets search, and the Add songs picker.

**Settings → Appearance → Minimum font** controls the smallest automatic song
fitting size on this device. It retains the existing saved preference, defaults
to 12px, and supports 12/14/16/18/20px. Songs scroll if they cannot fit at that
size. Open song views refit when the preference changes in another tab.
Minimum font and column-count diagnostics no longer occupy the song controls.

The same **Song reading** section now contains **Notation** (standard chord names,
Nashville numbers, or Roman numerals), **Columns** (automatic or a maximum count),
and **Wrap lines**. These device preferences persist across songs and apply to
setlist previews and performance mode too. Numeric notation requires a song key.
The column limit applies to automatic screen fitting; scrolling and paginated
views use one column. Open views react to preference changes in another tab.

The song toolbar keeps transposition, temporary font size, auto-fit, and chord
visibility. On phones, its group names remain accessible without taking a
separate visible label, and buttons have larger tap targets. General reading
preferences no longer add rows above the lyrics.

The Sets detail header places the date alongside its song count, and Add songs
shares the action group and its button height. On narrow screens, actions wrap.
