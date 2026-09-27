import type { LibraryRecord } from "../sync/records";
import { stableStringify } from "./recordFingerprint";

export function changedFields(local: LibraryRecord | undefined, remote: LibraryRecord) {
	const left = (local ?? {}) as unknown as Record<string, unknown>;
	const right = remote as unknown as Record<string, unknown>;
	return [...new Set([...Object.keys(left), ...Object.keys(right)])]
		.filter(
			(key) =>
				!["id", "createdAt", "lastModified", "content"].includes(key) &&
				stableStringify(left[key]) !== stableStringify(right[key]),
		)
		.map((key) => ({ key, local: left[key], remote: right[key] }));
}
export type DiffLine = { kind: "same" | "removed" | "added"; text: string };
/** Bound the comparison cost for imported long songs; the fallback still preserves every line. */
export function lineDifference(left: string, right: string): DiffLine[] {
	const a = left.split("\n");
	const b = right.split("\n");
	if (a.length * b.length > 250000) {
		let prefix = 0;
		while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
		let suffix = 0;
		while (
			suffix < a.length - prefix &&
			suffix < b.length - prefix &&
			a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
		)
			suffix++;
		return [
			...a.slice(0, prefix).map((text) => ({ kind: "same" as const, text })),
			...a.slice(prefix, a.length - suffix).map((text) => ({ kind: "removed" as const, text })),
			...b.slice(prefix, b.length - suffix).map((text) => ({ kind: "added" as const, text })),
			...a.slice(a.length - suffix).map((text) => ({ kind: "same" as const, text })),
		];
	}
	const width = b.length + 1;
	const cells = new Uint32Array((a.length + 1) * width);
	for (let i = a.length - 1; i >= 0; i--)
		for (let j = b.length - 1; j >= 0; j--)
			cells[i * width + j] =
				a[i] === b[j]
					? 1 + cells[(i + 1) * width + j + 1]
					: Math.max(cells[(i + 1) * width + j], cells[i * width + j + 1]);
	const result: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && a[i] === b[j]) {
			result.push({ kind: "same", text: a[i++] });
			j++;
		} else if (
			i < a.length &&
			(j >= b.length || cells[(i + 1) * width + j] >= cells[i * width + j + 1])
		)
			result.push({ kind: "removed", text: a[i++] });
		else result.push({ kind: "added", text: b[j++] });
	}
	return result;
}
