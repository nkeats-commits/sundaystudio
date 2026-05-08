/**
 * Pure mappers for the "Import from CSV" repertoire flow.
 *
 * These take rows already parsed by Papa Parse (one object per CSV row,
 * keyed by header string) and turn them into the `RepertoireImportSong`
 * payload accepted by `POST /api/library/repertoire/bulk-import`.
 *
 * Two formats are supported:
 *
 * 1. **Planning Center Services (PCO) export.** Detected by the presence of
 *    the `Arrangement 1 Name` header. The export carries up to 19
 *    arrangements per song; we ingest only the *default* arrangement
 *    (the first slot whose `Name` is non-empty, falling back to slot 1).
 *
 * 2. **Generic CSV.** Any spreadsheet with at least a `title` column
 *    (case-insensitive). Optional columns: artist, bpm, key, tags,
 *    themes, ccli, notes.
 *
 * Everything is pure / framework-free so it can be unit-tested with
 * `node:test`.
 */

import type { RepertoireImportSong } from '@workspace/api-client-react';
import {
  splitList,
  dedupeCaseInsensitive,
  coerceBpm as sharedCoerceBpm,
  normalizePcoDateString,
  parseKeyList,
} from '@workspace/song-field-parsers';

export type CsvFormat = 'pco' | 'generic' | 'unknown';

/** PCO export uses these fixed top-level columns. */
const PCO_TOP_LEVEL_HEADERS = [
  'Title',
  'CCLI',
  'Themes',
  'Notes',
  'Last Scheduled Date',
  'Song Tag 1',
  'Song Tag 2',
] as const;

/**
 * Sniff the format from the parsed header row.
 *
 * - PCO: detected by the presence of `Arrangement 1 Name` + `Title`.
 * - Generic: detected by an exact (case-insensitive) `title` header.
 *   We deliberately do NOT accept `song` or `name` as aliases — that
 *   would let us silently mis-import contact lists, song service-list
 *   exports, etc. The user's spec is "any sheet with a `title` column",
 *   so we hold them to it.
 */
export function detectFormat(headers: string[]): CsvFormat {
  if (headers.includes('Arrangement 1 Name') && headers.includes('Title')) {
    return 'pco';
  }
  const lower = headers.map((h) => h.trim().toLowerCase());
  if (lower.includes('title')) {
    return 'generic';
  }
  return 'unknown';
}

/**
 * Thin wrapper over the shared `normalizePcoDateString` that preserves the
 * historical `string | undefined` return type (rather than `string | null`)
 * so existing callers and tests need no changes.
 *
 * Both server (ISO 8601 API timestamps) and client (human-readable PCO CSV
 * dates like "May 03, 2026") now use the same underlying implementation,
 * eliminating the divergence that caused day-offset bugs in non-UTC timezones
 * with the previous UTC-based approach.
 */
export function normalizeDate(raw: string | undefined): string | undefined {
  return normalizePcoDateString(raw) ?? undefined;
}

/**
 * Pick the single default arrangement: the first arrangement slot
 * (1..19) whose `Name` cell is non-empty. Falls back to slot 1 if no
 * slot is named (rare — single-arrangement songs sometimes ship that
 * way). All arrangement-level fields (BPM, key, arrangement notes)
 * are then read ONLY from this one slot, so each imported song
 * represents one coherent arrangement rather than a frankenstein of
 * fields stitched across slots.
 */
function pickDefaultArrangementSlot(row: Record<string, string>): number {
  for (let i = 1; i <= 19; i += 1) {
    const name = row[`Arrangement ${i} Name`];
    if (name && name.trim()) return i;
  }
  return 1;
}

/** Map one PCO row into a RepertoireImportSong (or `null` if no usable title). */
export function mapPcoRow(row: Record<string, string>): RepertoireImportSong | null {
  const title = row['Title']?.trim();
  if (!title) return null;

  const slot = pickDefaultArrangementSlot(row);
  const bpmRaw = sharedCoerceBpm(row[`Arrangement ${slot} BPM`]);
  const bpm = bpmRaw !== null ? bpmRaw : undefined;
  const keyFromChart = row[`Arrangement ${slot} Chord Chart Key`]?.trim();
  // Use shared parseKeyList for consistent annotation stripping ("F: Original Key, G" → ["F", "G"]).
  const keyFromList = parseKeyList(row[`Arrangement ${slot} Keys`])[0];
  const key = keyFromChart || keyFromList;
  const arrangementNotes = row[`Arrangement ${slot} Notes`]?.trim();

  const tags = dedupeCaseInsensitive([
    ...splitList(row['Themes']),
    ...splitList(row['Song Tag 1']),
    ...splitList(row['Song Tag 2']),
  ]);

  const song: RepertoireImportSong = { title };
  if (bpm !== undefined) song.bpm = bpm;
  if (key) song.key = key;
  if (arrangementNotes) song.arrangementNotes = arrangementNotes;
  if (tags.length > 0) song.tags = tags;
  const ccli = row['CCLI']?.trim();
  if (ccli) song.ccli = ccli;
  const notes = row['Notes']?.trim();
  if (notes) song.notes = notes;
  const lastScheduledDate = normalizeDate(row['Last Scheduled Date']);
  if (lastScheduledDate) song.lastScheduledDate = lastScheduledDate;
  return song;
}

/** Map every PCO row, dropping rows with no usable title. */
export function mapPcoRows(rows: Record<string, string>[]): RepertoireImportSong[] {
  const out: RepertoireImportSong[] = [];
  for (const row of rows) {
    const song = mapPcoRow(row);
    if (song) out.push(song);
  }
  return out;
}

/**
 * Build a case-insensitive lookup from header → original header so a
 * generic CSV can use any casing for its column names.
 */
function buildHeaderLookup(headers: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const h of headers) {
    map.set(h.trim().toLowerCase(), h);
  }
  return map;
}

function pickCell(
  row: Record<string, string>,
  lookup: Map<string, string>,
  ...candidates: string[]
): string | undefined {
  for (const c of candidates) {
    const original = lookup.get(c.toLowerCase());
    if (!original) continue;
    const v = row[original];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

/** Map a generic-format CSV row using flexible column-name matching. */
export function mapGenericRow(
  row: Record<string, string>,
  lookup: Map<string, string>,
): RepertoireImportSong | null {
  // Title column is required and must be literally `title` (any casing).
  // Other column names are flexible aliases.
  const title = pickCell(row, lookup, 'title');
  if (!title) return null;
  const song: RepertoireImportSong = { title };
  const artist = pickCell(row, lookup, 'artist', 'author');
  if (artist) song.artist = artist;
  const style = pickCell(row, lookup, 'style', 'genre');
  if (style) song.style = style;
  const bpmRaw = sharedCoerceBpm(pickCell(row, lookup, 'bpm', 'tempo'));
  if (bpmRaw !== null) song.bpm = bpmRaw;
  const key = pickCell(row, lookup, 'key');
  if (key) song.key = key;
  const ccli = pickCell(row, lookup, 'ccli', 'ccli #', 'ccli number');
  if (ccli) song.ccli = ccli;
  const notes = pickCell(row, lookup, 'notes', 'note');
  if (notes) song.notes = notes;
  const lastScheduledDate = normalizeDate(
    pickCell(row, lookup, 'last scheduled date', 'last scheduled', 'last played'),
  );
  if (lastScheduledDate) song.lastScheduledDate = lastScheduledDate;
  const tags = dedupeCaseInsensitive([
    ...splitList(pickCell(row, lookup, 'tags', 'tag')),
    ...splitList(pickCell(row, lookup, 'themes', 'theme')),
  ]);
  if (tags.length > 0) song.tags = tags;
  return song;
}

export function mapGenericRows(
  rows: Record<string, string>[],
  headers: string[],
): RepertoireImportSong[] {
  const lookup = buildHeaderLookup(headers);
  const out: RepertoireImportSong[] = [];
  for (const row of rows) {
    const song = mapGenericRow(row, lookup);
    if (song) out.push(song);
  }
  return out;
}

/** Top-level entrypoint used by the modal: picks the right mapper. */
export function mapRowsByFormat(
  format: CsvFormat,
  rows: Record<string, string>[],
  headers: string[],
): RepertoireImportSong[] {
  if (format === 'pco') return mapPcoRows(rows);
  if (format === 'generic') return mapGenericRows(rows, headers);
  return [];
}

/**
 * Normalize a title the same way the server does
 * (`artifacts/api-server/src/lib/repertoire.ts` → `normalizeTitle`).
 * Keeping these in lock-step matters: the on-screen "new vs duplicate"
 * count must reflect exactly which rows the server will skip when the
 * import lands. If the two diverge, the preview lies to the user.
 */
export function normalizeTitleForDedupe(title: string): string {
  return title.trim().toLowerCase();
}

/**
 * Drop rows whose normalized title duplicates a title we've already seen
 * earlier in the same import, so the on-screen "new vs duplicate" count
 * is honest before the server even sees the payload.
 */
export function dedupeByTitle(
  songs: RepertoireImportSong[],
): { unique: RepertoireImportSong[]; intraFileDupes: number } {
  const seen = new Set<string>();
  const unique: RepertoireImportSong[] = [];
  let intraFileDupes = 0;
  for (const s of songs) {
    const k = normalizeTitleForDedupe(s.title);
    if (seen.has(k)) {
      intraFileDupes += 1;
      continue;
    }
    seen.add(k);
    unique.push(s);
  }
  return { unique, intraFileDupes };
}

/**
 * Split parsed songs into "new" vs "already in repertoire" using the
 * user's current repertoire titles. Uses the same normalization the
 * server uses, so the preview counts match what the server will actually
 * insert vs skip on submit.
 */
export function splitNewVsDuplicate(
  songs: RepertoireImportSong[],
  existingTitles: string[],
): {
  newSongs: RepertoireImportSong[];
  existingMatches: RepertoireImportSong[];
} {
  const existing = new Set(
    existingTitles.map((t) => normalizeTitleForDedupe(t)),
  );
  const newSongs: RepertoireImportSong[] = [];
  const existingMatches: RepertoireImportSong[] = [];
  for (const s of songs) {
    if (existing.has(normalizeTitleForDedupe(s.title))) {
      existingMatches.push(s);
    } else {
      newSongs.push(s);
    }
  }
  return { newSongs, existingMatches };
}
