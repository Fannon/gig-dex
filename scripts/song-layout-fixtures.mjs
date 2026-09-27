export const syntheticSongs = [
	{
		title: "Short song",
		content:
			"{key: C}\n{start_of_verse: Verse}\n[C]A quiet room, a [G]steady beat\n[Am]A little tune beneath our [F]feet\n{end_of_verse}",
	},
	{
		title: "Many sections",
		content: Array.from(
			{ length: 8 },
			(_, i) =>
				`{start_of_verse: Section ${i + 1}}\n[C]We follow the [G]rhythm today\n[Am]And carry the [F]music away\n[C]A melody [G]rises again\n[F]Together we [G]sing the refrain\n{end_of_verse}`,
		).join("\n\n"),
	},
	{
		title: "Long unbroken section",
		content: `{start_of_verse: Extended verse}\n${Array.from({ length: 32 }, (_, i) => `[C]Line ${i + 1}, the [G]rhythm carries on`).join("\n")}\n{end_of_verse}`,
	},
	{
		title: "Wide lines",
		content: Array.from(
			{ length: 4 },
			(_, i) =>
				`{comment: Verse ${i + 1}}\n[Cmaj7]The music carries us across the room and [G/B]every voice joins in a new refrain\n[Am7]The rhythm keeps us moving through the evening and [Fadd9]brings us back together once again`,
		).join("\n\n"),
	},
	{
		title: "Too large for one screen",
		content: Array.from(
			{ length: 250 },
			(_, i) => `[C]Line ${i + 1}, a [G]long collection of words`,
		).join("\n"),
	},
	{
		title: "Malformed ChordPro",
		content: "{title: Malformed ChordPro}\n[C]An unfinished [G\nA second line",
	},
];
