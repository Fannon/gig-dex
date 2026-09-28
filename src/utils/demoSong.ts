/**
 * Example ChordPro song for demo purposes
 */
export const DEMO_SONG = `{title: Amazing Grace}
{artist: Traditional}
{key: G}
{tempo: 72}

{start_of_verse: Verse 1}
[G]Amazing [G7]grace, how [C]sweet the [G]sound
That [G]saved a [Em]wretch like [D]me
[G]I once [G7]was lost, but [C]now am [G]found
Was [G]blind but [D]now I [G]see
{end_of_verse}

{start_of_verse: Verse 2}
[G]'Twas grace [G7]that taught my [C]heart to [G]fear
And [G]grace my [Em]fears re[D]lieved
[G]How pre[G7]cious did that [C]grace ap[G]pear
The [G]hour I [D]first be[G]lieved
{end_of_verse}

{start_of_verse: Verse 3}
[G]Through many [G7]dangers, [C]toils and [G]snares
I [G]have al[Em]ready [D]come
[G]'Tis grace [G7]hath brought me [C]safe thus [G]far
And [G]grace will [D]lead me [G]home
{end_of_verse}`;

/**
 * Tutorial Song: the manual you can sing. Each section teaches one
 * Gig-Dex feature. Demonstrates verse, chorus, bridge, chord-only
 * instrumental, outro, comments and metadata (key, tempo, time, capo).
 */
export const TUTORIAL_SONG = `{title: Tutorial Song}
{artist: Gig-Dex Demo}
{key: C}
{tempo: 100}
{time: 4/4}
{capo: 2}

{comment: Hi! This song IS the manual. Read it top to bottom, tap the buttons as you go, then edit or delete it.}

{start_of_verse: Verse 1 (Reading)}
[C]Welcome to your [G]songbook, [Am]Wi-Fi can dis[F]appear
[C]Chords sit above the [G]words you sing, [C]bright and [G]clear
[C]Phone or projector, [G]fit it [Am]to the [F]screen
[C]Tap plus or [G]minus, keep the [C]lyrics clean
{end_of_verse}

{start_of_chorus: Chorus (Transposing, sing along!)}
[F]Sing along, transpose [C]up and let it [G]fly
[C]Too high? Tap [G]minus; watch the [Am]chords com[F]ply
[F]Capo two means [C]C sounds like [G]D tonight
[C]Each set song [G]saves its [Am]key, so the [F]next sounds [C]right
{end_of_chorus}

{start_of_verse: Verse 2 (Setlists)}
[C]Open Sets, make a [G]new list, [Am]tap the [F]plus sign
[C]Drag songs into [G]gig order; [C]encores twice are [G]fine
[C]Hit Perform when [G]lights go down, the [Am]screen stays [F]bright
[C]Swipe to the [G]next song; no [C]page-flip fight
{end_of_verse}

{start_of_bridge: Bridge (Safety)}
[Am]Before the gig, ex-[G]port a backup [F]file
[Am]Paste in chord sheets [G]too; your library [C]grows in style
[Am]Sync through folders [G]if you like, or [F]keep it right here
[C]If the [G]router calls in [Am]sick, the [F]chords won't [C]disappear
{end_of_bridge}

{comment: Instrumental}
[C] [G] [Am] [F] | [C] [G] [C]

{start_of_outro: Outro}
[C]That's the tour, now [G]go and [Am]play the [F]show
[C]Delete this [G]song once [Am]you've got [F]the [C]flow
{end_of_outro}

{comment: Tip: Settings Import takes .cho files, Settings Backup Export saves everything.}`;

/** Demo setlist shown alongside the demo songs. Song IDs are filled in when seeding. */
export const DEMO_SETLIST = {
	name: "Demo Night",
	description: "Tutorial Song first, Amazing Grace to close.",
	tags: ["demo"],
};
