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

The Sets detail header places the date alongside its song count, and Add songs
shares the action group and its button height. On narrow screens, actions wrap.
