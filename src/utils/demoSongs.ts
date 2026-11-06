import { addSetlist, addSong } from "../db";
import { localCalendarDate } from "./calendarDate";
import { extractMetadata } from "./chordEngine";

/**
 * Demo songs that double as the manual: each one teaches one area of Gig-Dex.
 * Only use section labels the simple editor recognizes (Verse 1, Chorus,
 * Bridge, Instrumental, Outro) so the songs survive "try editing this song".
 */
export const HELLO_SONGBOOK = `{title: Hello, Songbook}
{artist: Gig-Dex Demo}
{key: G}
{tempo: 96}
{time: 4/4}

{comment: Demo 1 of 3: reading. Try each tip while you sing it.}

{start_of_verse: Verse 1}
[G]Chords sit on top and the [C]words sit be[G]low,
[G]just like on paper, but it [D]lights up the [G]show.
[G]The Wi-Fi at the venue just [C]gave up the [G]ghost?
[Em]Your songs live on this de[C]vice, right [D]where you need them [G]most.
{end_of_verse}

{start_of_chorus: Chorus}
[C]Too high? Tap [G]minus one.
[C]Too low? Tap [D]plus one.
[C]Every chord moves a[G]long, no re[Em]writing to [C]do.
[G]Hello, [D]songbook, [G]how do you do?
{end_of_chorus}

{start_of_verse: Verse 2}
[G]Tap the sliders button [C]when your eyes are [G]tired:
[G]A+ makes it bigger, [D]Auto fits it as re[G]quired.
[G]Switch the chords off [C]when you know them [G]cold;
[Em]Settings swaps the [C]theme, or [D]Nashville numbers, if you're [G]bold.
{end_of_verse}

{start_of_bridge: Bridge}
[Em]Can't find a [C]song? Press [G]Ctrl and [D]K.
[Em]Hit Perform, and the [C]buttons [D]get out of the [G]way.
{end_of_bridge}

{start_of_verse: Outro}
[G]Hello, [D]songbook, [G]how do you [C]do? [G]
{end_of_verse}

{comment: On a Mac it's Cmd+K. Tap a #tag to find songs that share it. Next up: The Setlist Shuffle.}`;

export const SETLIST_SHUFFLE = `{title: The Setlist Shuffle}
{artist: Gig-Dex Demo}
{key: E}
{tempo: 112}
{time: 4/4}

{comment: Demo 2 of 3: setlists. A twelve-bar blues, so the first line comes round twice.}

{start_of_verse: Verse 1}
[E7]The drummer lost the setlist, it was [A7]written on a paper [E7]plate.
[A7]Yeah, the drummer lost the setlist, it was [E7]written on a paper plate.
[B7]Open Setlists, tap New setlist, [A7]give it a name and a [E7]date. [B7]
{end_of_verse}

{start_of_verse: Verse 2}
[E7]Tap Add songs, pick your favorites, [A7]add one twice if you [E7]dare.
[A7]Add songs, pick your favorites, [E7]add one twice if you dare.
[B7]Drag them, or tap the arrows, [A7]put the encore over [E7]there. [B7]
{end_of_verse}

{start_of_verse: Verse 3}
[E7]Every song in a setlist [A7]keeps its very own [E7]key.
[A7]Every song in a setlist [E7]keeps its very own key:
[B7]transpose it once inside the setlist, [A7]and that's where it will [E7]be. [B7]
{end_of_verse}

{start_of_verse: Instrumental}
[E7] [A7] [E7] [E7]
[A7] [A7] [E7] [E7]
[B7] [A7] [E7] [B7]
{end_of_verse}

{start_of_verse: Verse 4}
[E7]Hit Perform setlist, then swipe or [A7]press the arrow [E7]keys.
[A7]Perform setlist, then swipe or [E7]press the arrow keys.
[B7]Open the gear for Keep screen awake: [A7]no napping, phone, [E7]please. [B7]
{end_of_verse}

{start_of_verse: Outro}
[E7]That's the setlist shuffle, [B7]now go play your [E7]gig. [B7] [E7]
{end_of_verse}

{comment: The + Setlist button on any song adds it to the setlist chosen in the sidebar, or starts one dated today.}`;

export const BACK_IT_UP_WALTZ = `{title: Back It Up Waltz}
{artist: Gig-Dex Demo}
{key: C}
{tempo: 108}
{time: 3/4}

{comment: Demo 3 of 3: editing, importing and keeping your songs safe.}

{start_of_verse: Verse 1}
[C]Tap Edit and [F]type like a [C]pro:
[Am]chords on one line, and the [G]words just be[C]low.
[C]Write Verse or [F]Chorus on a [C]line by it[Am]self,
[F]and each section gets [G]colored like [C]books on a shelf.
{end_of_verse}

{start_of_verse: Verse 2}
[C]Got a chord sheet? [F]Paste it right [C]in;
[Am]Advanced shows the [G]ChordPro under the [C]skin.
[C]ChordPro files [F]from some other [C]app? [Am]
[F]Settings, then [G]Library: im[C]port. That's a wrap.
{end_of_verse}

{start_of_chorus: Chorus}
[F]Back it [G]up, back it [C]up be[Am]fore the big show,
[F]phones fall in [G]pints, and that's [C]just how it goes.
[F]Export [G]library: [Em]one little [Am]file.
[F]Keep it some[G]where safe and [C]sleep for a while.
{end_of_chorus}

{start_of_verse: Verse 3}
[C]Laptop and [F]tablet and [C]phone in the [Am]band?
[F]Settings, then [G]Sync: Dropbox [C]lends you a hand.
[C]Or pick a [F]folder your [C]cloud drive al[Am]ready knows
[F](desktop Chrome or [G]Edge), and a[C]way it goes.
{end_of_verse}

{start_of_verse: Outro}
[C]Now delete these [F]three, or [C]keep them a[Am]round;
[F]your own songs de[G]serve the [C]stage and the sound.
{end_of_verse}

{comment: To remove a demo song, tap Edit, then Delete song; Undo brings it back. Have a great gig!}`;

export const DEMO_SONGS = [
  { content: HELLO_SONGBOOK, tags: ["demo", "reading"] },
  { content: SETLIST_SHUFFLE, tags: ["demo", "setlists", "blues"] },
  { content: BACK_IT_UP_WALTZ, tags: ["demo", "editing", "waltz"] },
];

/** Add the demo songs and a "Demo Night" setlist that plays them. */
export async function addDemoLibrary(): Promise<{ songId: string; setlistId: string }> {
  const ids: string[] = [];
  for (const { content, tags } of DEMO_SONGS) {
    const { title = "Demo song", artist = "Gig-Dex Demo", key, tempo, time } = extractMetadata(content);
    ids.push(await addSong({ title, artist, key, tempo, time, content, tags }));
  }
  const setlistId = await addSetlist({
    name: "Demo Night",
    date: localCalendarDate(),
    description:
      "All three demo songs, then an encore two semitones higher. Tap Perform setlist to try the stage view.",
    tags: ["demo"],
    // The repeated opener shows that each setlist entry keeps its own key.
    songIds: [...ids, ids[0]],
    songSettings: [...ids.map(() => ({ transpose: 0 })), { transpose: 2 }],
  });
  return { songId: ids[0], setlistId };
}
