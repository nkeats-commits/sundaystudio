/**
 * Shared pure helpers for Planning Center song field parsing.
 *
 * Framework-free with no runtime dependencies — safe to use on both
 * the server (api-server) and the client (worship-flow CSV importer).
 */

/** Split a comma-separated tag/theme string, trim each piece, drop empties. */
export function splitList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Dedupe a list of strings case-insensitively, preserving first-seen casing. */
export function dedupeCaseInsensitive(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const k = item.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/**
 * Coerce a raw BPM value into a valid integer in the range 30-300, or null
 * when the value is missing, non-numeric, or out of range.
 *
 * Accepts numbers (already numeric) or strings (from CSV cells or API JSON
 * that encodes numbers as strings). Rounds floating-point inputs.
 *
 * The 30-300 range matches the OpenAPI schema constraint so the prompt and
 * the database never see nonsensical tempos.
 */
export function coerceBpm(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : NaN;
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 30 || rounded > 300) return null;
  return rounded;
}

/**
 * Normalize a PCO date/datetime string into ISO YYYY-MM-DD, or null when
 * the input is missing or unparseable.
 *
 * Handles all three PCO date formats consistently on both server and client:
 *
 *  1. Already-ISO `YYYY-MM-DD` — returned as-is.
 *  2. API ISO 8601 with time `YYYY-MM-DDThh:mm:ssZ` — the date prefix is
 *     extracted directly, avoiding any timezone conversion (the date part of
 *     a PCO API timestamp already represents the correct calendar day).
 *  3. Human-readable PCO CSV export dates like `"May 03, 2026"` — parsed
 *     using LOCAL date methods (getFullYear / getMonth / getDate) so the
 *     calendar day is preserved regardless of the user's timezone. Using
 *     UTC methods here (getUTCFullYear etc.) would shift the day backward
 *     in negative-UTC timezones (e.g. UTC-7 → "2026-05-02").
 */
export function normalizePcoDateString(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Case 1: already ISO date-only.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // Case 2: ISO datetime — extract the date prefix directly.
  const isoDatePart = trimmed.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoDatePart) return isoDatePart[1]!;
  // Case 3: human-readable ("May 03, 2026") — parse as local calendar day.
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parse a PCO key list string into an array of unique keys.
 *
 * PCO encodes keys as a comma-separated string, sometimes with annotations
 * like `"F: Original Key, G, Bb"`. This function strips the annotation
 * (everything after the first `:` in each segment), trims whitespace, and
 * deduplicates case-insensitively.
 *
 * Used by:
 *  - Server `collectArrangementKeys` (all keys from a PCO API arrangement).
 *  - Client `mapPcoRow` / `firstKeyFromList` (keys column in a PCO CSV export).
 */
export function parseKeyList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const keys: string[] = [];
  for (const segment of raw.split(",")) {
    // Strip PCO annotation suffix (e.g. "G: Original Key" → "G").
    const clean = segment.split(":")[0]?.trim();
    if (clean) keys.push(clean);
  }
  return dedupeCaseInsensitive(keys);
}
