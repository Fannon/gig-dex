import { expect, it } from "vitest";
import { tempoMeter, tempoPeriod, withSongTime } from "./tempo";

it("defaults to four quarter notes and accepts requested custom divisions", () => {
	expect(tempoMeter()).toEqual({ beats: 4, division: 4, label: "4/4" });
	expect(tempoMeter("2/3")).toEqual({ beats: 2, division: 3, label: "2/3" });
	expect(tempoMeter("6/8")).toEqual({ beats: 6, division: 8, label: "6/8" });
	expect(tempoMeter("8/8")).toEqual({ beats: 8, division: 8, label: "8/8" });
	expect(tempoPeriod(120, 4)).toBe(500);
	expect(tempoPeriod(120, 8)).toBe(250);
	for (const value of ["0/4", "300/4", "4/0", "wrong"]) expect(tempoMeter(value).label).toBe("4/4");
});

it("updates song time without changing lyrics or leaving contradictory metadata", () => {
	expect(withSongTime("[C]Synthetic line", "6/8")).toBe("{time: 6/8}\n[C]Synthetic line");
	expect(withSongTime("{Time: 4/4}\n[C]Synthetic line\n{time: 3/4}", "8/8")).toBe(
		"{time: 8/8}\n[C]Synthetic line\n",
	);
});
