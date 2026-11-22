# Search and reading preferences

Open the centered search dialog with the navbar's **Search** button (magnifying glass on narrow screens), **Ctrl+K** (Windows/Linux), or **Cmd+K** (Mac).
Search includes song titles, alternative titles, artists and tags, as well as setlist
names, dates, descriptions and tags. Matching text is highlighted safely as React
text nodes, including literal punctuation such as `[North]`. Song results show
**In N setlists**, counting distinct setlists rather than repeated entries. Counts are
cached with the setlist library rather than recalculated on every search keystroke.
A song's **Alternative title** (the ChordPro `subtitle`, editable in the song editor)
is searchable everywhere a title is.

A token starting with `#` matches an entire tag, case-insensitively: `#test` finds
the `test` tag, not the `testing` tag or songs with “test” only in their title.
Combine tags and words, for example `#test acoustic`. Multiple terms must all
match. This also works in the sidebar, the Setlists search, and the Add songs picker.

Song overview cards show a row of tag buttons when there is room beneath the
title and artist. Click a tag to replace the overview search with its exact tag
filter. Cards keep the same height; tags that do not fit stay out of the way.
Tags containing spaces use quoted filters, for example `#"Sunday morning"`.
Clicking a tag in a song's header opens the overview with that tag filter. The
overview search is stored in its URL, so the filtered view survives reloading.

**Settings → Appearance → Minimum font** and **Maximum font** set the range for
automatic song fitting on this device: Gig-Dex picks the largest size in that
range that fits the screen. The minimum defaults to 12px (12–32px); songs scroll
if they cannot fit at that size. The maximum defaults to 36px (24–72px); raise it
so short songs fill a tablet from a distance, or lower it to keep text calm. The
maximum cannot be set below the minimum. The **A−/A+** buttons in Display options
go from 10px to 72px. Open song views refit when either preference changes,
including in another tab.
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

**Settings → Appearance → Theme** offers Pure black (the default), Dark violet and Light.
