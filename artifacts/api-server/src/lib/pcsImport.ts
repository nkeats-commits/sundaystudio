import { and, eq } from "drizzle-orm";
import {
  db,
  externalSongLinksTable,
  libraryItemsTable,
} from "@workspace/db";
import { pcsAuthedFetch } from "./pcsClient";
import { coerceBpm } from "./repertoire";
import { logger } from "./logger";

/**
 * Import every song from a connected church's Planning Center Services
 * library into WorshipFlow as repertoire items.
 *
 * Strategy:
 *  1. Page through `/services/v2/songs?include=arrangements` (PCO returns
 *     up to 100 per page; the response includes pagination links).
 *  2. For each song, take the BPM and key from the song's first
 *     arrangement (PCO models `arrangements` as the per-key, per-tempo
 *     variants of a song). When multiple arrangements exist we pick the
 *     one PCS marks as `default` if available, otherwise the first.
 *  3. Upsert into `library_items` keyed by the `external_song_links`
 *     row for `(source: "pcs", externalId: <pcs song id>, userId)`. New
 *     songs are inserted with `isRepertoire: true`. Existing songs are
 *     updated in place — Planning Center is the trusted source, so its
 *     BPM overwrites whatever was there before for songs we previously
 *     imported (we never overwrite a hand-typed song that doesn't have
 *     an external link).
 *
 * Returns counts so the UI can show "Imported 47 songs (3 new, 44 updated)".
 */

export type PcsImportResult = {
  total: number;
  inserted: number;
  updated: number;
  errors: string[];
};

type PcsResource = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: string; type?: string } | null | Array<{ id?: string; type?: string }> }>;
};

type PcsListResponse = {
  data?: PcsResource[];
  included?: PcsResource[];
  links?: { next?: string };
};

function pickArrangementForSong(
  song: PcsResource,
  arrangements: Map<string, PcsResource>,
): PcsResource | null {
  const rel = song.relationships?.["arrangements"]?.data;
  const ids: string[] = [];
  if (Array.isArray(rel)) {
    for (const r of rel) if (r?.id) ids.push(r.id);
  } else if (rel && rel.id) {
    ids.push(rel.id);
  }
  const candidates = ids
    .map((id) => arrangements.get(id))
    .filter((a): a is PcsResource => Boolean(a));
  if (candidates.length === 0) return null;
  // Prefer one explicitly marked default if PCS includes that flag.
  const def = candidates.find(
    (a) => (a.attributes?.["default"] as boolean | undefined) === true,
  );
  return def ?? candidates[0]!;
}

function songContentFrom(
  song: PcsResource,
  arrangement: PcsResource | null,
): { artist: string | null; bpm: number | null; key: string | null } {
  const sa = song.attributes ?? {};
  const aa = arrangement?.attributes ?? {};
  const artist =
    typeof sa["author"] === "string" && sa["author"]
      ? (sa["author"] as string)
      : null;
  const bpm = coerceBpm(aa["bpm"]);
  const key =
    typeof aa["chord_chart_key"] === "string" && aa["chord_chart_key"]
      ? (aa["chord_chart_key"] as string)
      : null;
  return { artist, bpm, key };
}

export async function importPcsSongs(userId: string): Promise<PcsImportResult> {
  const result: PcsImportResult = {
    total: 0,
    inserted: 0,
    updated: 0,
    errors: [],
  };

  // First pass: collect all songs + arrangements across paginated calls.
  // PCS caps `per_page` at 100. `include=arrangements` returns the full
  // arrangement list under `included`.
  let next: string | null =
    "/services/v2/songs?include=arrangements&per_page=100";
  const songs: PcsResource[] = [];
  const arrangements = new Map<string, PcsResource>();
  // Hard guard against runaway pagination from a misbehaving upstream.
  for (let page = 0; page < 100 && next; page += 1) {
    const res = await pcsAuthedFetch(userId, next);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`PCS list songs failed (${res.status}): ${text}`);
    }
    const body = (await res.json()) as PcsListResponse;
    for (const r of body.data ?? []) {
      if (r.type === "Song") songs.push(r);
    }
    for (const r of body.included ?? []) {
      if (r.type === "Arrangement") arrangements.set(r.id, r);
    }
    next = body.links?.next ?? null;
  }

  result.total = songs.length;
  if (songs.length === 0) return result;

  // Second pass: upsert each song. Done sequentially to keep things
  // simple — PCS rate-limits aggressive parallel writes anyway, and
  // import volumes are typically a few hundred songs at most.
  for (const song of songs) {
    try {
      const titleAttr = song.attributes?.["title"];
      const title =
        typeof titleAttr === "string" && titleAttr.trim()
          ? titleAttr.trim()
          : null;
      if (!title) continue;
      const arrangement = pickArrangementForSong(song, arrangements);
      const { artist, bpm, key } = songContentFrom(song, arrangement);

      const content: Record<string, unknown> = {};
      if (artist) content["artist"] = artist;
      if (bpm !== null) content["bpm"] = bpm;
      if (key) content["key"] = key;
      content["source"] = "planning-center";

      // Look for an existing link row for this user + PCS song id.
      const existingLink = await db
        .select()
        .from(externalSongLinksTable)
        .where(
          and(
            eq(externalSongLinksTable.userId, userId),
            eq(externalSongLinksTable.source, "pcs"),
            eq(externalSongLinksTable.externalId, song.id),
          ),
        )
        .limit(1);

      if (existingLink.length > 0) {
        // Update the linked library item in place. Planning Center is
        // authoritative for songs we've imported, so its BPM wins.
        await db
          .update(libraryItemsTable)
          .set({ title, content, isRepertoire: true })
          .where(
            and(
              eq(libraryItemsTable.id, existingLink[0]!.libraryItemId),
              eq(libraryItemsTable.userId, userId),
            ),
          );
        await db
          .update(externalSongLinksTable)
          .set({ lastSyncedAt: new Date() })
          .where(eq(externalSongLinksTable.id, existingLink[0]!.id));
        result.updated += 1;
      } else {
        // Insert a new library item + link in one logical step. Postgres
        // has no transactional helper exposed at the drizzle layer here,
        // but the link insert immediately following the row insert is
        // tight enough that a partial-failure window is acceptable for
        // this background operation.
        const [inserted] = await db
          .insert(libraryItemsTable)
          .values({
            userId,
            kind: "song",
            title,
            content,
            tags: [],
            isRepertoire: true,
          })
          .returning({ id: libraryItemsTable.id });
        if (!inserted) continue;
        await db.insert(externalSongLinksTable).values({
          libraryItemId: inserted.id,
          userId,
          source: "pcs",
          externalId: song.id,
        });
        result.inserted += 1;
      }
    } catch (err) {
      logger.warn(
        { err, songId: song.id },
        "Failed to import a single PCS song",
      );
      result.errors.push(
        `Song ${song.id}: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  }

  return result;
}
