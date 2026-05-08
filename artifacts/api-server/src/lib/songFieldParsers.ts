/**
 * Server-side field-parsing helpers for PCS song data.
 *
 * Core pure utilities (splitList, dedupeCaseInsensitive, coerceBpm,
 * normalizePcoDateString, parseKeyList) live in the shared
 * `@workspace/song-field-parsers` lib so both the OAuth sync (server) and
 * the CSV importer (client) use identical implementations.
 *
 * This module re-exports the shared helpers for server callers that import
 * from `./songFieldParsers`, and adds server-only helpers that operate on
 * PCO API resource objects.
 */

export {
  splitList,
  dedupeCaseInsensitive,
  coerceBpm,
  normalizePcoDateString,
  parseKeyList,
} from "@workspace/song-field-parsers";

import {
  dedupeCaseInsensitive,
  parseKeyList,
} from "@workspace/song-field-parsers";

/**
 * Backwards-compatible alias — existing code may import normalizePcoDate
 * from this module. Delegates to the shared normalizePcoDateString.
 */
export { normalizePcoDateString as normalizePcoDate } from "@workspace/song-field-parsers";

/**
 * Collect all unique chord keys from an array of PCO arrangement attribute
 * objects.
 *
 * PCO exposes keys in two places per arrangement:
 *  - `chord_chart_key` (string) — the primary/default key
 *  - `keys` — may be a comma-separated string ("G, A, Bb", sometimes with
 *    PCO annotations like "F: Original Key, G") OR an array of strings or
 *    objects with a `startingKey` property depending on API version.
 *
 * Uses the shared `parseKeyList` for consistent comma/annotation parsing.
 * All values are deduplicated case-insensitively.
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

    // 2. keys — comma string or array (API version dependent).
    const keysAttr = attrs["keys"];
    if (typeof keysAttr === "string") {
      // Use shared parseKeyList for consistent annotation stripping.
      keys.push(...parseKeyList(keysAttr));
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
  return dedupeCaseInsensitive(keys);
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
