/** BPM represents quarter notes; the denominator determines each visual subdivision. */
export function tempoMeter(value?: string) {
	const match = /^(\d+)\s*\/\s*(\d+)$/.exec(value?.trim() ?? "4/4");
	const beats = Number(match?.[1]);
	const division = Number(match?.[2]);
	if (
		!Number.isInteger(beats) ||
		!Number.isInteger(division) ||
		beats < 1 ||
		beats > 16 ||
		division < 1 ||
		division > 32
	)
		return { beats: 4, division: 4, label: "4/4" };
	return { beats, division, label: `${beats}/${division}` };
}
export const tempoPeriod = (bpm: number, division: number) => (60000 / bpm) * (4 / division);

/** Keep the saved song field and its exported ChordPro time directive consistent. */
export function withSongTime(content: string, time: string) {
	let found = false;
	const updated = content.replace(/\{time\s*:[^{}]*\}/gi, () => {
		if (found) return "";
		found = true;
		return `{time: ${time}}`;
	});
	return found ? updated : `{time: ${time}}\n${content}`;
}
