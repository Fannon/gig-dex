import { expect, it } from "vitest";
import { isCalendarDate } from "./calendarDate";
import { parseSyncedSetlist } from "./libraryValidation";

it("validates calendar dates without rollover or timezone conversion", () => {
	expect(isCalendarDate("2024-02-29")).toBe(true);
	for (const value of ["2025-02-29", "2026-04-31", "2026-1-01", "2026-01-01T00:00:00Z", null])
		expect(isCalendarDate(value)).toBe(false);
	const list = {
		id: "list",
		name: "Gig",
		songIds: [],
		createdAt: "2026-01-01",
		lastModified: "2026-01-01",
	};
	expect(parseSyncedSetlist(JSON.stringify({ ...list, date: "2024-02-29" }), "list").date).toBe(
		"2024-02-29",
	);
	expect(() =>
		parseSyncedSetlist(JSON.stringify({ ...list, date: "2025-02-29" }), "list"),
	).toThrow();
});
