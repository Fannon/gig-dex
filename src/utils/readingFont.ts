export const minimumFontSizes = [12, 14, 16, 18, 20];
export function savedMinimumFontSize() {
	try {
		const value = Number(localStorage.getItem("song_minimum_font"));
		return minimumFontSizes.includes(value) ? value : 12;
	} catch {
		return 12;
	}
}
export function applyMinimumFontSize(value: number) {
	if (!minimumFontSizes.includes(value)) return;
	try {
		localStorage.setItem("song_minimum_font", String(value));
	} catch {
		/* Optional device preference. */
	}
	window.dispatchEvent(new Event("reading-font-changed"));
}
