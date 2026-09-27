import { describe, expect, it } from "vitest";
import { findSongLayout } from "./songLayout";

describe("song layout selection", () => {
	it("balances width and height to maximize legibility", () => {
		const limits = [16, 28, 22, 12];
		expect(findSongLayout(4, (size, columns) => size <= limits[columns - 1])).toEqual({
			fontSize: 28,
			columns: 2,
			fits: true,
		});
	});
	it("prefers fewer columns when font sizes tie", () => {
		expect(findSongLayout(6, (size) => size <= 24).columns).toBe(1);
	});
	it("handles nonmonotonic section fragmentation", () => {
		expect(findSongLayout(3, (size, columns) => columns === 3 && size === 30)).toEqual({
			fontSize: 30,
			columns: 3,
			fits: true,
		});
	});
	it("keeps a manual font size and adjusts columns", () => {
		expect(findSongLayout(4, (size, columns) => size <= columns * 10, 26)).toEqual({
			fontSize: 26,
			columns: 3,
			fits: true,
		});
	});
	it("offers readable scrolling if even the smallest layout cannot fit", () => {
		expect(findSongLayout(6, () => false)).toEqual({ fontSize: 18, columns: 1, fits: false });
		expect(findSongLayout(6, () => false, 32).fontSize).toBe(32);
	});
});

it("honors a configurable automatic minimum and readable fallback", () => {
	expect(findSongLayout(3, (size) => size <= 15, undefined, 18)).toEqual({
		fontSize: 18,
		columns: 1,
		fits: false,
	});
	expect(findSongLayout(3, () => false, undefined, 20).fontSize).toBe(20);
});
