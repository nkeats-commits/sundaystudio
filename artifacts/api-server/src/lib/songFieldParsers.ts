/**
 * Shared field-parsing helpers for PCS song data on the server side.
 *
 * These are the canonical server implementations of helpers that mirror
 * the pure functions in the client-side parsePcoCsv.ts — keep them in sync.
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
 * Coerce a PCO datetime string (ISO 8601 with time, e.g.
 * "2024-03-17T07:00:00Z") or date-only string into ISO YYYY-MM-DD.
 * Returns null when the value is missing or unparseable.
 */
export function normalizePcoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const isoDatePart = trimmed.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoDatePart) return isoDatePart[1]!;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Collect all unique chord keys from an array of PCO arrangement attribute
 * objects. Deduplicates case-insensitively, preserving first-seen casing.
 */
export function collectArrangementKeys(
  arrangements: Array<{ attributes?: Record<string, unknown> }>,
): string[] {
  const keys: string[] = [];
  for (const arr of arrangements) {
    const key = arr.attributes?.["chord_chart_key"];
    if (typeof key === "string" && key.trim()) keys.push(key.trim());
  }
  return dedupeCaseInsensitive(keys);
}

/**
 * Extract a short lyrics excerpt (up to 500 chars, trimmed to the last
 * complete word so it doesn't end mid-word) from a raw lyrics string.
 * Returns null when the input is empty or missing.
 */
export function lyricsExcerpt(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return null;
  if (text.length <= 500) return text;
  const cut = text.slice(0, 500);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 200 ? cut.slice(0, lastSpace) : cut) + "…";
}
