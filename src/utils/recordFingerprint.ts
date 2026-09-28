/** Stable JSON equivalent, including omission of undefined object fields. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => (item === undefined ? "null" : stableStringify(item))).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function recordFingerprint(record: unknown): string {
  if (!record || typeof record !== "object") return stableStringify(record);
  const deletion = record as { deleted?: unknown; id?: unknown; type?: unknown };
  if (
    deletion.deleted === true &&
    typeof deletion.id === "string" &&
    (deletion.type === "song" || deletion.type === "setlist")
  )
    return stableStringify({ deleted: true, id: deletion.id, type: deletion.type });
  const { lastModified: _lastModified, ...data } = record as Record<string, unknown>;
  const rawSettings = data.songSettings;
  if (Array.isArray(data.songIds) && Array.isArray(rawSettings)) {
    const settings = data.songIds.map((_, index) => {
      const entry = rawSettings[index] as { transpose?: number; capo?: number } | undefined;
      return { transpose: entry?.transpose ?? 0, ...(entry?.capo === undefined ? {} : { capo: entry.capo }) };
    });
    if (settings.every((entry) => entry.transpose === 0 && !("capo" in entry))) delete data.songSettings;
    else data.songSettings = settings;
  }
  return stableStringify(data);
}
