# Song defaults and performance

The song editor's **Standard transposition** is the starting number of semitones
(-24 to +24, default 0). It does not rewrite the source chords. Normal and single
song performance views start from it; temporary reading adjustments do not change
that default. Existing imported capo metadata remains supported.

Adding a song through **Add to Set**, a sidebar drop, or the Sets song picker
copies its current standard transposition into the new occurrence. Each occurrence
can then be transposed independently, including repeats within the same set.
Changing the song's default later does not update those occurrences. Older set
entries with no saved settings continue to use zero transposition.

**Remove from Set** removes one occurrence, preferring the occurrence currently
being read when it belongs to the selected set. It leaves the song in the library.
The sidebar has drop targets for adding/removing, drag reordering, and **Alt+Up/Down**
when an occurrence link is focused. **Alt+Delete** removes that entry. Drop after the last entry to append.

**Alternative title** edits the existing ChordPro subtitle field. Sidebar search,
global search (**Ctrl+K / Cmd+K**), and the Sets song picker include this field.

Reading metadata uses `G | T-4 | 120bpm | 6/8`; zero transposition and unavailable
BPM are omitted. A missing time signature defaults to 4/4. The silent visual tempo
starts automatically in performance mode, including when moving to a new
occurrence. Click the dots to pause/resume; hover shows BPM and beat division.
The first beat uses a different color. This browser visual cue is not an audio
metronome or a precision timing source.

The performance pencil opens the existing editor. Save or Cancel returns to the
same performance occurrence. Unsaved changes still require explicit discard.
Pure black is the default theme; previously chosen violet or light remains saved.
