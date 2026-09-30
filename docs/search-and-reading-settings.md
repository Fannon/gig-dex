# Search and reading preferences

Open the centered search dialog with the navbar's **Search** button (magnifying glass on narrow screens), **Ctrl+K** (Windows/Linux), or **Cmd+K** (Mac).
Search includes song titles, alternative titles, artists and tags, as well as set
names, dates, descriptions and tags. Matching text is highlighted safely as React
text nodes, including literal punctuation such as `[North]`. Song results show
**In N Sets**, counting distinct sets rather than repeated occurrences. Counts are
cached with the set library rather than recalculated on every search keystroke.

A token starting with `#` matches an entire tag, case-insensitively: `#test` finds
the `test` tag, not the `testing` tag or songs with “test” only in their title.
Combine tags and words, for example `#test acoustic`. Multiple terms must all
match. This also works in the sidebar, Sets search, and the Add songs picker.

Song overview cards show a row of tag buttons when there is room beneath the
title and artist. Click a tag to replace the overview search with its exact tag
filter. Cards keep the same height; tags that do not fit stay out of the way.
Tags containing spaces use quoted filters, for example `#"Sunday morning"`.
Clicking a tag in a song's header opens the overview with that tag filter. The
overview search is stored in its URL, so the filtered view survives reloading.

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

The song header keeps compact transpose buttons alongside the song actions.
Select the sliders icon (**Display options**) to open temporary font size,
auto-fit and chord visibility controls. Close the panel with the icon, its close
button or Escape; the current display choices stay in effect while reading that
song. The panel starts closed when you open another song. General reading
preferences live in Settings.

Key and tempo have separate badges. The tempo badge includes the beat dots and
starts or stops the visual beat pulse when selected. Its tooltip includes the
time signature; songs without tempo retain a written time signature.

The Sets detail header places the date alongside its song count, and Add songs
shares the action group and its button height. On narrow screens, actions wrap.
