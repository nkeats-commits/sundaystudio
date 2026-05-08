/**
 * Shared pure helpers for Planning Center song field parsing.
 *
 * These functions are framework-free and have no dependencies so they can be
 * used on both the server (api-server) and the client (worship-flow CSV
 * importer) without duplication.
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
