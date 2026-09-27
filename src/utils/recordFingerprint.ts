/** Stable JSON equivalent, including omission of undefined object fields. */
export function stableStringify(value: unknown): string {
	if (Array.isArray(value))
		return `[${value.map((item) => (item === undefined ? "null" : stableStringify(item))).join(",")}]`;
	if (value && typeof value === "object")
		return `{${Object.entries(value)
			.filter(([, item]) => item !== undefined)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
			.join(",")}}`;
	return JSON.stringify(value) ?? "null";
}
export function recordFingerprint(record: unknown): string {
	if (!record || typeof record !== "object") return stableStringify(record);
	const { lastModified: _lastModified, ...data } = record as Record<string, unknown>;
	return stableStringify(data);
}
