export type ReadingTheme = "violet" | "black" | "light";
export function savedReadingTheme(): ReadingTheme {
	try {
		const value = localStorage.getItem("reading-theme");
		return value === "violet" || value === "light" ? value : "black";
	} catch {
		return "black";
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
