import { recordKey } from "./records";
import type { SyncMetadata } from "./types";

const identity = (file: SyncMetadata) => `${recordKey(file.type, file.id)}:${file.revision}`;
export function syncHeads(records: SyncMetadata[]) {
  const ancestors = new Set<string>();
  const graph = new Map(records.map((file) => [identity(file), file]));
  const done = new Set<string>();
  const active = new Set<string>();
  const visit = (key: string) => {
    if (active.has(key)) throw new Error("Invalid cyclic sync ancestry.");
    if (done.has(key)) return;
    active.add(key);
    const file = graph.get(key);
    if (!file) return;
    for (const parent of file.parents ?? []) {
      const parentKey = `${recordKey(file.type, file.id)}:${parent}`;
      ancestors.add(parentKey);
      if (graph.has(parentKey)) visit(parentKey);
    }
    active.delete(key);
    done.add(key);
  };
  for (const key of graph.keys()) visit(key);
  return records.filter((file) => !ancestors.has(identity(file)));
}

/** Retain heads, branches, recent uploads and five historical revisions per record. */
export function planRevisionCleanup(records: SyncMetadata[], now = Date.now()) {
  const heads = new Set(syncHeads(records).map(identity));
  const groups = new Map<string, SyncMetadata[]>();
  for (const file of records) {
    const key = recordKey(file.type, file.id);
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }
  const cutoff = now - 30 * 86400000;
  const planned: SyncMetadata[] = [];
  for (const group of groups.values()) {
    const roots = group.filter((file) => heads.has(identity(file)));
    if (roots.length !== 1) continue; // Unjoined remote conflicts always retain all history.
    const graph = new Map(group.map((file) => [file.revision, file]));
    const reachable = new Set<string>();
    const depth = new Map<string, number>();
    const visit = (revision: string, distance = 0) => {
      depth.set(revision, Math.min(depth.get(revision) ?? Infinity, distance));
      if (reachable.has(revision)) return;
      reachable.add(revision);
      for (const parent of graph.get(revision)?.parents ?? []) visit(parent, distance + 1);
    };
    visit(roots[0].revision ?? "");
    const ancestors = group.filter(
      (file) => !heads.has(identity(file)) && file.revision && reachable.has(file.revision),
    );
    const keep = new Set(
      [...ancestors]
        .sort(
          (a, b) =>
            (Date.parse(b.uploadedAt ?? "") || 0) - (Date.parse(a.uploadedAt ?? "") || 0) ||
            (depth.get(a.revision ?? "") ?? Infinity) - (depth.get(b.revision ?? "") ?? Infinity),
        )
        .slice(0, 5)
        .map(identity),
    );
    const candidates = new Set(
      ancestors
        .filter(
          (file) =>
            file.revision &&
            !file.revision.startsWith("legacy-") &&
            !keep.has(identity(file)) &&
            Number.isFinite(Date.parse(file.uploadedAt ?? "")) &&
            Date.parse(file.uploadedAt ?? "") < cutoff &&
            (file.etag || file.version),
        )
        .map(identity),
    );
    // Removing a middle node must not expose an older retained ancestor as a new head.
    let changed = true;
    while (changed) {
      changed = false;
      for (const file of group) {
        if (!candidates.has(identity(file))) continue;
        for (const parent of file.parents ?? []) {
          const retained = graph.get(parent);
          if (!retained || candidates.has(identity(retained))) continue;
          if (!group.some((other) => !candidates.has(identity(other)) && other.parents?.includes(parent))) {
            candidates.delete(identity(file));
            changed = true;
            break;
          }
        }
      }
    }
    // Oldest ancestors first: interruption cannot expose a retained old version as a head.
    const ordered = new Set<string>();
    const order = (file: SyncMetadata) => {
      if (ordered.has(identity(file))) return;
      ordered.add(identity(file));
      for (const parent of file.parents ?? []) {
        const node = graph.get(parent);
        if (node && candidates.has(identity(node))) order(node);
      }
      if (candidates.has(identity(file))) planned.push(file);
    };
    for (const file of group) order(file);
  }
  return planned;
}
