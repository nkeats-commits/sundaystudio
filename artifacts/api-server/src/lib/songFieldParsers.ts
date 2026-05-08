/**
 * Server-side field-parsing helpers for PCS song data.
 *
 * Pure list utilities (`splitList`, `dedupeCaseInsensitive`) come from the
 * shared `@workspace/song-field-parsers` lib so both the OAuth sync and the
 * client-side CSV importer stay in sync with a single canonical implementation.
 */

import {
  splitList as _splitList,
  dedupeCaseInsensitive as _dedupe,
} from "@workspace/song-field-parsers";

export { splitList, dedupeCaseInsensitive } from "@workspace/song-field-parsers";

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
 * objects.
 *
 * PCO exposes keys in two places per arrangement:
 *  - `chord_chart_key` (string) — the primary/default key
 *  - `keys` — may be a comma-separated string ("G, A, Bb") OR an array of
 *    objects with a `startingKey` property, depending on which API version
 *    is in use. Both forms are handled.
 *
 * All values are deduplicated case-insensitively, preserving first-seen casing.
 */
export function collectArrangementKeys(
  arrangements: Array<{ attributes?: Record<string, unknown> }>,
): string[] {
  const keys: string[] = [];
  for (const arr of arrangements) {
    const attrs = arr.attributes ?? {};

    // 1. chord_chart_key — always a plain string when present.
    const chartKey = attrs["chord_chart_key"];
    if (typeof chartKey === "string" && chartKey.trim()) {
      keys.push(chartKey.trim());
    }

    // 2. keys — comma-separated string or array of strings/objects.
    const keysAttr = attrs["keys"];
    if (typeof keysAttr === "string" && keysAttr.trim()) {
      for (const k of keysAttr.split(",")) {
        // Strip PCO-style annotations like "G: Original Key".
        const clean = k.split(":")[0]?.trim();
        if (clean) keys.push(clean);
      }
    } else if (Array.isArray(keysAttr)) {
      for (const entry of keysAttr) {
        if (typeof entry === "string" && entry.trim()) {
          keys.push(entry.trim());
        } else if (entry !== null && typeof entry === "object") {
          // PCO key object: { startingKey: "G", endingKey: "G", ... }
          const obj = entry as Record<string, unknown>;
          const startKey = obj["startingKey"];
          if (typeof startKey === "string" && startKey.trim()) {
            keys.push(startKey.trim());
          }
        }
      }
    }
  }
  return _dedupe(keys);
}

/**
 * Extract a lyrics excerpt (up to 500 chars, trimmed to the last complete
 * word). Returns null when the input is empty or missing.
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

// Expose the raw shared helpers under their original names for callers that
// imported them from this module before the shared-lib refactor.
export { _splitList as splitListHelper, _dedupe as dedupeHelper };
