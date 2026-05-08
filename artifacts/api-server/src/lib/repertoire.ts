import { and, eq } from "drizzle-orm";
import { db, libraryItemsTable } from "@workspace/db";
import { coerceBpm as sharedCoerceBpm } from "@workspace/song-field-parsers";

export type RepertoireMode = "off" | "prefer" | "strict";

export type RepertoireSong = {
  title: string;
  artist: string | null;
  style: string | null;
  bpm: number | null;
  key: string | null;
  availableKeys: string[] | null;
  themes: string[] | null;
  lyricsExcerpt: string | null;
};

/**
 * Optional inclusive BPM range used to filter or shape song suggestions.
 * Either bound may be null, meaning "no constraint on that side".
 */
export type BpmRange = {
  min: number | null;
  max: number | null;
};

/**
 * Normalize a caller-supplied BPM range. Each bound is run through
 * `coerceBpm`, which keeps integers in 30-300 and drops anything else
 * (out-of-range or unparseable values become null on that side, leaving
 * the other side intact). Reversed bounds are swapped. Returns null when
 * neither bound is set so callers can short-circuit. Note: the OpenAPI
 * schema already rejects out-of-range integers with a 400, so in practice
 * the server only sees values inside 30-300.
 */
export function normalizeBpmRange(
  rawMin: unknown,
  rawMax: unknown,
): BpmRange | null {
  const min = coerceBpm(rawMin);
  const max = coerceBpm(rawMax);
  if (min === null && max === null) return null;
  if (min !== null && max !== null && min > max) {
    return { min: max, max: min };
  }
  return { min, max };
}

/**
 * True when the song's BPM lies inside the inclusive range. Songs with no
 * saved BPM are treated as "unknown" and pass — we'd rather show them than
 * silently drop a song the user has explicitly added to their repertoire.
 */
export function bpmInRange(
  bpm: number | null | undefined,
  range: BpmRange | null,
): boolean {
  if (!range) return true;
  if (bpm === null || bpm === undefined) return true;
  if (range.min !== null && bpm < range.min) return false;
  if (range.max !== null && bpm > range.max) return false;
  return true;
}

/** Render a BPM range as a short, human-readable phrase. */
export function describeBpmRange(range: BpmRange): string {
  if (range.min !== null && range.max !== null) {
    return `${range.min}–${range.max} BPM`;
  }
  if (range.min !== null) return `${range.min} BPM or faster`;
  if (range.max !== null) return `${range.max} BPM or slower`;
  return "";
}

/**
 * Coerce a stored content.bpm value (which can be a number or a numeric
 * string from older imports) into a clean integer in our valid range, or
 * null when the value is missing/unusable.
 *
 * Delegates to the canonical shared implementation so the server and the
 * client CSV importer always use identical logic.
 */
export function coerceBpm(value: unknown): number | null {
  return sharedCoerceBpm(value);
}

export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

/**
 * Load every song the user has marked as part of their repertoire.
 * Returns a projection that includes all fields useful for AI prompt
 * context: BPM, key, available keys, themes, and a lyrics excerpt.
 */
export async function loadRepertoireSongs(
  userId: string,
): Promise<RepertoireSong[]> {
  const rows = await db
    .select({
      title: libraryItemsTable.title,
      content: libraryItemsTable.content,
    })
    .from(libraryItemsTable)
    .where(
      and(
        eq(libraryItemsTable.userId, userId),
        eq(libraryItemsTable.kind, "song"),
        eq(libraryItemsTable.isRepertoire, true),
      ),
    );
  return rows.map((r) => {
    const content = (r.content ?? {}) as Record<string, unknown>;

    const availableKeys = Array.isArray(content["availableKeys"])
      ? (content["availableKeys"] as unknown[]).filter(
          (k): k is string => typeof k === "string" && k.trim().length > 0,
        )
      : null;

    const themes = Array.isArray(content["themes"])
      ? (content["themes"] as unknown[]).filter(
          (t): t is string => typeof t === "string" && t.trim().length > 0,
        )
      : null;

    return {
      title: r.title,
      artist:
        typeof content["artist"] === "string" &&
        content["artist"].trim().length > 0
          ? content["artist"]
          : null,
      style:
        typeof content["style"] === "string" &&
        content["style"].trim().length > 0
          ? content["style"]
          : null,
      bpm: coerceBpm(content["bpm"]),
      key:
        typeof content["key"] === "string" && content["key"].trim().length > 0
          ? content["key"].trim()
          : null,
      availableKeys:
        availableKeys && availableKeys.length > 0 ? availableKeys : null,
      themes: themes && themes.length > 0 ? themes : null,
      lyricsExcerpt:
        typeof content["lyricsExcerpt"] === "string" &&
        content["lyricsExcerpt"].trim().length > 0
          ? content["lyricsExcerpt"].trim()
          : null,
    };
  });
}

/** Look up a repertoire song's BPM by title (case-insensitive). */
export function repertoireBpmByTitle(
  songs: RepertoireSong[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of songs) {
    if (s.bpm !== null) out.set(normalizeTitle(s.title), s.bpm);
  }
  return out;
}

/** Look up a repertoire song's musical key by title (case-insensitive). */
export function repertoireKeyByTitle(
  songs: RepertoireSong[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of songs) {
    if (s.key !== null) out.set(normalizeTitle(s.title), s.key);
  }
  return out;
}

/**
 * Build the prompt fragment that tells the model how to use the user's
 * repertoire. Returns an empty string when there is nothing useful to add.
 *
 * Each song line is formatted as:
 *   - Title (Artist) — BPM BPM, Key: X [also: Y, Z] | Themes: a, b
 *
 * When a lyrics excerpt is available and the song has no themes, a brief
 * lyrical cue is appended after a pipe so the model can assess thematic fit.
 */
export function repertoirePromptBlock(
  songs: RepertoireSong[],
  mode: RepertoireMode,
  range: BpmRange | null = null,
): string {
  if (mode === "off") return "";
  const filteredSongs =
    mode === "strict" && range
      ? songs.filter((s) => bpmInRange(s.bpm, range))
      : songs;
  if (filteredSongs.length === 0) return "";

  const list = filteredSongs
    .map((s) => {
      const bpmTag = s.bpm !== null ? ` — ${s.bpm} BPM` : "";
      const keyTag = s.key !== null ? `, Key: ${s.key}` : "";

      // Other keys this song can be played in.
      const otherKeys = s.availableKeys
        ? s.availableKeys.filter((k) => k !== s.key)
        : [];
      const availableKeysTag =
        otherKeys.length > 0 ? ` [also: ${otherKeys.join(", ")}]` : "";

      // Themes and/or a lyrical cue — include both when available so the
      // model has the richest possible context to assess thematic fit.
      let contextTag = "";
      if (s.themes && s.themes.length > 0) {
        contextTag = ` | Themes: ${s.themes.join(", ")}`;
      }
      if (s.lyricsExcerpt) {
        // Brief lyrical hint — first 200 chars so the model can assess thematic fit.
        const hint =
          s.lyricsExcerpt.length > 200
            ? s.lyricsExcerpt.slice(0, 200).trimEnd() + "…"
            : s.lyricsExcerpt;
        contextTag += ` | "${hint}"`;
      }

      const rangeTag =
        mode === "prefer" &&
        range &&
        s.bpm !== null &&
        bpmInRange(s.bpm, range)
          ? " ✓ in tempo range"
          : "";
      return `- ${s.title}${s.artist ? ` (${s.artist})` : ""}${bpmTag}${keyTag}${availableKeysTag}${contextTag}${rangeTag}`;
    })
    .join("\n");

  const tempoGuidance = `Tempo guidance: when a slot's intent or title implies energy (e.g. "opener", "upbeat", "celebration", "sending"), favor faster songs (roughly 100+ BPM). When a slot implies reflection, lament, communion, confession, or response, favor slower songs (roughly under 90 BPM).

BPM accuracy is critical: ONLY return a numeric "bpm" when you are highly confident in the recording's actual tempo. If you are unsure, return "bpm": null. A wrong BPM is much worse than a missing one — pastors plan their service tempo around this number. Do NOT estimate, guess, or invent. The user's verified repertoire BPMs (shown above when set) are always preferred over your own knowledge.`;

  if (mode === "strict") {
    return `THE USER'S TEAM REPERTOIRE — this is the EXHAUSTIVE list of songs they know (BPM shown when set):
${list}

Hard rule: every entry in your "songs" array MUST be a title from the list above, copied exactly. If fewer than the requested count fit the theme, return only the ones that fit. NEVER invent or substitute songs that are not on this list.

${tempoGuidance}`;
  }
  return `THE USER'S TEAM REPERTOIRE — these are songs the team already knows (BPM shown when set). Prefer them when they fit the theme:
${list}

Guidance: when a repertoire song genuinely fits the theme, choose it over a less-familiar option. It is fine to also suggest other real, published songs to round out the picks.${range ? ` When a tempo range is requested (see above), strongly prefer the entries marked "✓ in tempo range".` : ""}

${tempoGuidance}`;
}

/**
 * Build a fast lookup set of normalized repertoire titles.
 */
export function repertoireTitleSet(songs: RepertoireSong[]): Set<string> {
  return new Set(songs.map((s) => normalizeTitle(s.title)));
}
