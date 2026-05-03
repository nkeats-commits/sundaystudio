import { eq, and, sql } from "drizzle-orm";
import { db, crowdsourceBpmTable } from "@workspace/db";
import { coerceBpm, normalizeTitle } from "./repertoire";
import { logger } from "./logger";

/**
 * Anonymous, cross-church BPM aggregation.
 *
 * `recordBpm` is called every time a user saves or edits a song with an
 * explicit BPM. We treat that act as the user vouching for the tempo and
 * roll it into a per-(title, artist) running average. No church or user
 * identifiers are stored — only the aggregate.
 *
 * `lookupBpm` is called by the Song Assistant transform when the AI
 * returned `bpm: null` AND the title is not in the user's own repertoire.
 * We require a minimum sample size before exposing a value so a single
 * mistyped BPM in one church can't propagate to every other church on
 * its first save.
 *
 * Both calls are best-effort — failures are logged and swallowed so a
 * crowdsource hiccup never breaks the user-visible flow.
 */

const MIN_SAMPLES_TO_EXPOSE = 3;

const ARTIST_FALLBACK = "__unknown__";

function normalizeArtist(raw: unknown): string {
  if (typeof raw !== "string") return ARTIST_FALLBACK;
  const t = raw.trim().toLowerCase();
  return t.length > 0 ? t : ARTIST_FALLBACK;
}

export async function recordBpm(
  rawTitle: unknown,
  rawArtist: unknown,
  rawBpm: unknown,
): Promise<void> {
  if (typeof rawTitle !== "string") return;
  const title = rawTitle.trim();
  if (!title) return;
  const bpm = coerceBpm(rawBpm);
  if (bpm === null) return;

  const titleKey = normalizeTitle(title);
  const artistKey = normalizeArtist(rawArtist);

  try {
    // Upsert a running average. Postgres can do this in a single statement
    // with `INSERT ... ON CONFLICT DO UPDATE` referencing the existing
    // row's columns, which keeps writes atomic across concurrent saves.
    await db
      .insert(crowdsourceBpmTable)
      .values({
        titleNormalized: titleKey,
        artistNormalized: artistKey,
        bpmAvg: String(bpm),
        sampleCount: 1,
      })
      .onConflictDoUpdate({
        target: [
          crowdsourceBpmTable.titleNormalized,
          crowdsourceBpmTable.artistNormalized,
        ],
        set: {
          bpmAvg: sql`((${crowdsourceBpmTable.bpmAvg} * ${crowdsourceBpmTable.sampleCount}) + ${bpm}) / (${crowdsourceBpmTable.sampleCount} + 1)`,
          sampleCount: sql`${crowdsourceBpmTable.sampleCount} + 1`,
        },
      });
  } catch (err) {
    logger.warn(
      { err, title, artist: artistKey },
      "Failed to record crowdsource BPM sample",
    );
  }
}

export type CrowdsourceBpmHint = {
  bpm: number;
  sampleCount: number;
};

export async function lookupBpm(
  rawTitle: unknown,
  rawArtist: unknown,
): Promise<CrowdsourceBpmHint | null> {
  if (typeof rawTitle !== "string") return null;
  const title = rawTitle.trim();
  if (!title) return null;
  const titleKey = normalizeTitle(title);
  const artistKey = normalizeArtist(rawArtist);

  try {
    // Try exact (title, artist) first — most reliable. Fall back to
    // title-only with the unknown-artist row, since old samples may have
    // been recorded without an artist.
    const candidates = await db
      .select()
      .from(crowdsourceBpmTable)
      .where(
        and(
          eq(crowdsourceBpmTable.titleNormalized, titleKey),
          // Either matches the artist we have, or is the unknown-artist
          // bucket (so a song saved without artist still contributes).
          sql`${crowdsourceBpmTable.artistNormalized} in (${artistKey}, ${ARTIST_FALLBACK})`,
        ),
      );
    if (candidates.length === 0) return null;
    // Prefer the most-sampled row when multiple match.
    const best = candidates.reduce((a, b) =>
      a.sampleCount >= b.sampleCount ? a : b,
    );
    if (best.sampleCount < MIN_SAMPLES_TO_EXPOSE) return null;
    const bpm = Math.round(Number(best.bpmAvg));
    if (!Number.isFinite(bpm) || bpm < 30 || bpm > 300) return null;
    return { bpm, sampleCount: best.sampleCount };
  } catch (err) {
    logger.warn(
      { err, title, artist: artistKey },
      "Failed to look up crowdsource BPM",
    );
    return null;
  }
}

/**
 * Convenience wrapper: extract title/artist/bpm from a freshly-saved
 * library row's content blob and record asynchronously. Safe to call
 * without awaiting; errors are swallowed inside `recordBpm`.
 */
export function recordBpmFromContent(
  title: string,
  content: unknown,
): Promise<void> {
  if (!content || typeof content !== "object") return Promise.resolve();
  const c = content as Record<string, unknown>;
  return recordBpm(title, c.artist, c.bpm);
}
