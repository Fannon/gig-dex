import { stableStringify } from "../utils/recordFingerprint";
import type { LibraryRecord, RecordType } from "./records";

/** Version 0 is the original unversioned envelope. Keep reading it indefinitely. */
export const SYNC_FORMAT_VERSION = 1;
export const MAX_SYNC_FILE_BYTES = 5 * 1024 * 1024;
const REVISION_FILENAME = /^gigdex-(song|setlist)-([0-9a-f-]+)\.json$/;

export function parseRevisionFilename(name: string): { type: RecordType; revision: string } | undefined {
  const match = REVISION_FILENAME.exec(name);
  return match ? { type: match[1] as RecordType, revision: match[2] } : undefined;
}

export function revisionFilename(type: RecordType, revision: string): string {
  const name = `gigdex-${type}-${revision}.json`;
  if (!parseRevisionFilename(name)) throw new Error("Invalid sync revision filename.");
  return name;
}

export function syncEnvelope(value: unknown): { revision: string; parents: string[] } | undefined {
  if (!value || typeof value !== "object") throw new Error("Invalid sync revision envelope.");
  const envelope = (value as { _sync?: unknown })._sync;
  if (envelope === undefined) return undefined; // Legacy Google Drive files only.
  if (!envelope || typeof envelope !== "object") throw new Error("Invalid sync revision envelope.");
  const fields = envelope as Record<string, unknown>;
  if (fields.formatVersion !== undefined && fields.formatVersion !== SYNC_FORMAT_VERSION)
    throw new Error(
      `Unsupported sync format version ${String(fields.formatVersion)}. Update Gig-Dex before syncing this item.`,
    );
  if (
    typeof fields.revision !== "string" ||
    !fields.revision ||
    !Array.isArray(fields.parents) ||
    !fields.parents.every((parent) => typeof parent === "string") ||
    (fields.formatVersion === SYNC_FORMAT_VERSION &&
      (fields.parents.some((parent) => parent.length === 0) ||
        new Set(fields.parents).size !== fields.parents.length ||
        fields.parents.includes(fields.revision)))
  )
    throw new Error("Invalid sync revision envelope.");
  return { revision: fields.revision, parents: fields.parents };
}

export function parseSyncFile(text: string): Record<string, unknown> {
  if (new TextEncoder().encode(text).byteLength > MAX_SYNC_FILE_BYTES)
    throw new Error("Sync file exceeds the 5 MB safety limit.");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid sync file.");
  syncEnvelope(value);
  return value as Record<string, unknown>;
}

export async function verifySyncFile(value: Record<string, unknown>): Promise<void> {
  const envelope = syncEnvelope(value);
  if (!envelope || (value._sync as { formatVersion?: unknown }).formatVersion !== SYNC_FORMAT_VERSION) return;
  const { _sync: _ignored, ...record } = value;
  const expected = await createSyncFile(record, envelope.parents);
  if (expected.revision !== envelope.revision)
    throw new Error("Sync revision checksum mismatch. The remote file was changed.");
}

export async function readSyncResponse(response: Response): Promise<string> {
  const length = Number(response.headers.get("Content-Length"));
  if (length > MAX_SYNC_FILE_BYTES) throw new Error("Sync file exceeds the 5 MB safety limit.");
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SYNC_FILE_BYTES) throw new Error("Sync file exceeds the 5 MB safety limit.");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** The revision ID is derived from the complete stored record and its ancestry. */
export async function createSyncFile(record: LibraryRecord | Record<string, unknown>, parents: string[]) {
  const ancestry = [...new Set(parents)].sort();
  const input = stableStringify({ formatVersion: SYNC_FORMAT_VERSION, parents: ancestry, record });
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
  const revision = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const content = stableStringify({
    ...record,
    _sync: { formatVersion: SYNC_FORMAT_VERSION, revision, parents: ancestry },
  });
  if (new TextEncoder().encode(content).byteLength > MAX_SYNC_FILE_BYTES)
    throw new Error("This item exceeds the 5 MB sync file limit.");
  return { revision, parents: ancestry, content };
}
