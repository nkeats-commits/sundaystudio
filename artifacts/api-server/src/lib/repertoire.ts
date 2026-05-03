import { and, eq } from "drizzle-orm";
import { db, libraryItemsTable } from "@workspace/db";

export type RepertoireMode = "off" | "prefer" | "strict";

export type RepertoireSong = {
  title: string;
  artist: string | null;
  style: string | null;
  bpm: number | null;
};

/**
 * Coerce a stored content.bpm value (which can be a number or a numeric
 * string from older imports) into a clean integer in our valid range, or
 * null when the value is missing/unusable. We mirror the same 30-300 range
 * the OpenAPI schema validates on input so the prompt never sees nonsense.
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

export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

/**
 * Load every song the user has marked as part of their repertoire.
 * Returns a small projection — we only need title/artist/style for the prompt
 * and for matching titles against AI output.
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
    return {
      title: r.title,
      artist:
        typeof content.artist === "string" && content.artist.trim().length > 0
          ? content.artist
          : null,
      style:
        typeof content.style === "string" && content.style.trim().length > 0
          ? content.style
          : null,
      bpm: coerceBpm(content.bpm),
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

/**
 * Build the prompt fragment that tells the model how to use the user's
 * repertoire. Returns an empty string when there is nothing useful to add.
 */
export function repertoirePromptBlock(
  songs: RepertoireSong[],
  mode: RepertoireMode,
): string {
  if (mode === "off" || songs.length === 0) return "";
  const list = songs
    .map(
      (s) =>
        `- ${s.title}${s.artist ? ` (${s.artist})` : ""}${s.bpm !== null ? ` — ${s.bpm} BPM` : ""}`,
    )
    .join("\n");
  const tempoGuidance = `Tempo guidance: when a slot's intent or title implies energy (e.g. "opener", "upbeat", "celebration", "sending"), favor faster songs (roughly 100+ BPM). When a slot implies reflection, lament, communion, confession, or response, favor slower songs (roughly under 90 BPM). For each suggested song, return a "bpm" integer estimate when known, or null when you genuinely don't know.`;
  if (mode === "strict") {
    return `THE USER'S TEAM REPERTOIRE — this is the EXHAUSTIVE list of songs they know (BPM shown when set):
${list}

Hard rule: every entry in your "songs" array MUST be a title from the list above, copied exactly. If fewer than the requested count fit the theme, return only the ones that fit. NEVER invent or substitute songs that are not on this list.

${tempoGuidance}`;
  }
  return `THE USER'S TEAM REPERTOIRE — these are songs the team already knows (BPM shown when set). Prefer them when they fit the theme:
${list}

Guidance: when a repertoire song genuinely fits the theme, choose it over a less-familiar option. It is fine to also suggest other real, published songs to round out the picks.

${tempoGuidance}`;
}

/**
 * Build a fast lookup set of normalized repertoire titles.
 */
export function repertoireTitleSet(songs: RepertoireSong[]): Set<string> {
  return new Set(songs.map((s) => normalizeTitle(s.title)));
}
