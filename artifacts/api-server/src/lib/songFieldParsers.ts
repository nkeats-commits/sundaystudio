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

const LYRICS_EXCERPT_MAX = 400;

/**
 * Extract a lyrics excerpt using a first-verse + chorus heuristic (~400 chars).
 *
 * Strategy:
 *  1. Split the text into sections by double newlines or labelled headers
 *     like [Verse 1] / [Chorus] / [Refrain].
 *  2. Take the first non-chorus section as the verse and the first section
 *     labelled "chorus" or "refrain" as the chorus.
 *  3. Combine them (verse then chorus) and return up to LYRICS_EXCERPT_MAX
 *     chars, truncated at the last word boundary.
 *  4. Fall back to a plain word-boundary truncation when no section structure
 *     is detected.
 *
 * Returns null when the input is empty or missing.
 */
export function lyricsExcerpt(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return null;

  // Split on blank lines (one or more). Each element is a section candidate.
  const sections = text
    .split(/\n[ \t]*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  let verse: string | null = null;
  let chorus: string | null = null;

  for (const section of sections) {
    // Optional bracketed header on the first line: [Verse], [Chorus 1], etc.
    const firstLine = section.split("\n")[0]?.trim() ?? "";
    const hasHeader = /^\[.+\]/.test(firstLine);
    const headerText = hasHeader ? firstLine.slice(1, firstLine.indexOf("]")).toLowerCase() : "";
    const isChorusHeader =
      headerText === "chorus" ||
      headerText.startsWith("chorus ") ||
      headerText === "refrain";
    const body = hasHeader
      ? section.slice(firstLine.length).trim()
      : section;

    if (!verse && !isChorusHeader) {
      verse = body.length > 0 ? body : section;
    } else if (!chorus && isChorusHeader && body.length > 0) {
      chorus = body;
    }
    if (verse && chorus) break;
  }

  // Build combined excerpt: verse first, then chorus when distinct.
  const parts: string[] = [];
  if (verse) parts.push(verse);
  if (chorus && chorus !== verse) parts.push(chorus);

  const combined = parts.length > 0 ? parts.join("\n\n") : text;

  if (combined.length <= LYRICS_EXCERPT_MAX) return combined;

  const cut = combined.slice(0, LYRICS_EXCERPT_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > LYRICS_EXCERPT_MAX * 0.6 ? cut.slice(0, lastSpace) : cut) + "…";
}
