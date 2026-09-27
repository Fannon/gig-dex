export type ReadingTheme = "violet" | "black" | "light";
export function savedReadingTheme(): ReadingTheme {
	try {
		const value = localStorage.getItem("reading-theme");
		return value === "black" || value === "light" ? value : "violet";
	} catch {
		return "violet";
	}
}
export function applyReadingTheme(theme: ReadingTheme) {
	document.documentElement.dataset.readingTheme = theme;
	try {
		localStorage.setItem("reading-theme", theme);
	} catch {
		/* This session still applies. */
	}
	window.dispatchEvent(new Event("reading-theme-changed"));
}
