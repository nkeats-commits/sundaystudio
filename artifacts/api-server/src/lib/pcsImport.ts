import { and, eq } from "drizzle-orm";
import {
  db,
  externalSongLinksTable,
  libraryItemsTable,
} from "@workspace/db";
import { pcsAuthedFetch } from "./pcsClient";
import {
  coerceBpm,
  splitList,
  dedupeCaseInsensitive,
  normalizePcoDateString,
  collectArrangementKeys,
  lyricsExcerpt,
} from "./songFieldParsers";
import { logger } from "./logger";

/**
 * Import songs from a connected church's Planning Center Services library
 * into Sunday Studio as repertoire items.
 *
 * Strategy:
 *  1. Page through `/services/v2/songs` with sparse fieldsets and
 *     `include=arrangements,tags` so the PCO API returns exactly the fields
 *     we need in a single round-trip.
 *  2. For each song extract: title, author, CCLI, copyright, themes (song-
 *     level), lyrics (full text), lastScheduledDate, all arrangement keys
 *     (availableKeys), BPM, primary key, meter, and duration (seconds) from
 *     the default arrangement, and tag names from included Tag resources.
 *  3. Optionally filter by service type (fetch song IDs used in the given
 *     service types via a date-bounded plans query) and/or by last-used date.
 *  4. Batch-upsert into `library_items` keyed via `external_song_links`
 *     for `(source: "pcs", externalId: <pcs song id>, userId)`.
 *
 * Returns counts so the UI can show "Imported 47 songs (3 new, 44 updated)".
 */

export type PcsSyncOptions = {
  serviceTypeIds?: string[];
  lastUsedSince?: string; // ISO YYYY-MM-DD — skip songs not used since this date
};

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
  relationships?: Record<
    string,
    {
      data?:
        | { id?: string; type?: string }
        | null
        | Array<{ id?: string; type?: string }>;
    }
  >;
};

type PcsListResponse = {
  data?: PcsResource[];
  included?: PcsResource[];
  links?: { next?: string };
};

/**
 * Paginated song list URL. Sparse fieldsets ensure we only receive attributes
 * we actually use, reducing payload size and avoiding silent breakage if PCO
 * adds required-only attributes in the future.
 */
const SONGS_BASE_URL =
  "/services/v2/songs" +
  "?include=arrangements,tags" +
  "&per_page=100" +
  "&fields[Song]=title,author,ccli_number,copyright,themes,lyrics,last_scheduled_at" +
  "&fields[Arrangement]=bpm,chord_chart_key,keys,meter,length,default" +
  "&fields[Tag]=name";

/**
 * Default lookback when service-type filters are requested but no
 * `lastUsedSince` date is specified. 3 years is a sensible cap that covers
 * most active repertoires without fetching all history going back to 2010.
 */
const DEFAULT_LOOKBACK_MS = 3 * 365 * 24 * 60 * 60 * 1000;

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
  const def = candidates.find(
    (a) => (a.attributes?.["default"] as boolean | undefined) === true,
  );
  return def ?? candidates[0]!;
}

function allArrangementsForSong(
  song: PcsResource,
  arrangements: Map<string, PcsResource>,
): PcsResource[] {
  const rel = song.relationships?.["arrangements"]?.data;
  const ids: string[] = [];
  if (Array.isArray(rel)) {
    for (const r of rel) if (r?.id) ids.push(r.id);
  } else if (rel && rel.id) {
    ids.push(rel.id);
  }
  return ids
    .map((id) => arrangements.get(id))
    .filter((a): a is PcsResource => Boolean(a));
}

function tagNamesForSong(
  song: PcsResource,
  tagsById: Map<string, PcsResource>,
): string[] {
  const rel = song.relationships?.["tags"]?.data;
  const ids: string[] = [];
  if (Array.isArray(rel)) {
    for (const r of rel) if (r?.id) ids.push(r.id);
  } else if (rel && rel.id) {
    ids.push(rel.id);
  }
  return ids
    .map((id) => tagsById.get(id)?.attributes?.["name"])
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    .map((n) => n.trim());
}

/**
 * Run an array of async tasks in parallel, capped at `chunkSize` concurrent
 * tasks per batch. Prevents overwhelming the DB connection pool when
 * processing many songs.
 */
async function runInChunks<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  chunkSize = 25,
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    await Promise.all(items.slice(i, i + chunkSize).map(fn));
  }
}

/**
 * Fetch the set of song IDs used in the given PCS service types since
 * `sinceDate`.
 *
 * Approach: paginate through plans for each service type with `include=items`,
 * then collect IDs from items where `item_type == "song"`. This is the
 * universally-supported PCO path — the nested `song_schedules` relationship
 * returns 404 on some organisations/service-type configurations and is not
 * reliable for this purpose.
 *
 * Key constraints to avoid the two known PCO API gotchas:
 *
 * 1. per_page=25 (NOT 100): PCO silently truncates the `included` array when
 *    there are too many associated resources. 25 plans × ~15 items ≈ 375
 *    included resources — well within PCO's untruncated limit. 100 plans × 15
 *    items = ~1 500 resources, which PCO regularly truncates to 0.
 *
 * 2. Date bound via `where[starts_at][gte]`: Without a date filter, every
 *    historical plan (potentially thousands going back to 2010) is paged
 *    through, making the pre-filter take many minutes. Bounding by sinceDate
 *    reduces plans to a recent slice — typically a handful of pages.
 *
 * 3. No sparse fieldsets: PCO's JSON:API implementation suppresses included
 *    resources when sparse fieldsets are active — even fieldsets on the
 *    primary resource (Plan) can prevent Item resources from appearing in the
 *    `included` array, which would yield an empty allowedSongIds set and
 *    filter out every song.
 *
 * FAIL-CLOSED: throws on any API error so a caller who explicitly requested
 * service-type filtering never silently imports the full library.
 */
async function fetchServiceTypeSongIds(
  userId: string,
  serviceTypeIds: string[],
  sinceDate: Date,
): Promise<Set<string>> {
  const songIds = new Set<string>();
  const sinceIso = sinceDate.toISOString();

  // PCO plans use filter=after_date&after_date=YYYY-MM-DD — the where[]
  // syntax is not supported on this endpoint and is silently ignored.
  const sinceDateStr = sinceIso.slice(0, 10); // YYYY-MM-DD

  for (const stId of serviceTypeIds) {
    let next: string | null =
      `/services/v2/service_types/${stId}/plans` +
      `?per_page=25&include=items&order=-sort_date` +
      `&filter=after_date&after_date=${sinceDateStr}`;

    for (let page = 0; page < 200 && next; page += 1) {
      const res = await pcsAuthedFetch(userId, next);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Could not resolve service-type filter for service type ${stId} ` +
            `(PCS returned ${res.status}). Sync aborted to avoid importing ` +
            `songs outside your selected service types. ${text}`.trim(),
        );
      }
      const body = (await res.json()) as PcsListResponse;
      for (const item of body.included ?? []) {
        if (item.type !== "Item") continue;
        if (item.attributes?.["item_type"] !== "song") continue;
        // PCO may return the song relationship as data linkage OR as link-only
        // (without a data member). Handle both:
        //   data linkage:  relationships.song.data = { id, type }
        //   link-only:     relationships.song.links.related = ".../songs/<id>"
        const songRel = item.relationships?.["song"];
        const songData = songRel?.data;
        let songId: string | null = null;
        if (songData && !Array.isArray(songData) && songData.id) {
          songId = songData.id;
        } else {
          const relatedUrl = (songRel as { links?: { related?: unknown } } | undefined)
            ?.links?.related;
          if (typeof relatedUrl === "string") {
            const m = relatedUrl.match(/\/songs\/(\d+)/);
            if (m?.[1]) songId = m[1];
          }
        }
        if (songId) songIds.add(songId);
      }
      next = body.links?.next ?? null;
    }
  }
  return songIds;
}

export async function importPcsSongs(
  userId: string,
  options?: PcsSyncOptions,
): Promise<PcsImportResult> {
  const result: PcsImportResult = {
    total: 0,
    inserted: 0,
    updated: 0,
    errors: [],
  };

  // Optional date pre-filter cutoff (used both to filter songs and to bound
  // the plans query in fetchServiceTypeSongIds).
  const lastUsedCutoff: Date | null = options?.lastUsedSince
    ? new Date(options.lastUsedSince)
    : null;

  // Optional service-type pre-filter: collect allowed song IDs.
  //
  // The sinceDate passed to fetchServiceTypeSongIds bounds the plans query so
  // we only scan recent plans instead of all history. When lastUsedSince is
  // set we reuse that date (correct intersection semantics: songs used in
  // those service types AND used since that date). When no date filter is set
  // we fall back to a 3-year lookback to keep the query bounded.
  //
  // fetchServiceTypeSongIds throws on any PCS API failure (fail-closed) so
  // a filter that cannot be resolved aborts the sync rather than silently
  // importing the full library.
  let allowedSongIds: Set<string> | undefined;
  if (options?.serviceTypeIds && options.serviceTypeIds.length > 0) {
    const serviceTypeSinceDate =
      lastUsedCutoff ?? new Date(Date.now() - DEFAULT_LOOKBACK_MS);
    allowedSongIds = await fetchServiceTypeSongIds(
      userId,
      options.serviceTypeIds,
      serviceTypeSinceDate,
    );
    if (allowedSongIds.size === 0) {
      logger.warn(
        { serviceTypeIds: options.serviceTypeIds },
        "PCS service-type filter resolved but matched 0 song IDs — " +
          "selected service types may have no scheduled songs in the " +
          "requested date range",
      );
    }
  }

  // First pass: collect all songs + arrangements + tags across paginated pages.
  let next: string | null = SONGS_BASE_URL;
  const songs: PcsResource[] = [];
  const arrangements = new Map<string, PcsResource>();
  const tagsById = new Map<string, PcsResource>();

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
      if (r.type === "Tag") tagsById.set(r.id, r);
    }
    next = body.links?.next ?? null;
  }

  // Apply pre-filters before counting total so the result reflects what we
  // actually process, not the raw PCS library size.
  const filteredSongs = songs.filter((song) => {
    if (allowedSongIds !== undefined && !allowedSongIds.has(song.id)) return false;

    if (lastUsedCutoff) {
      const raw = song.attributes?.["last_scheduled_at"];
      if (!raw || typeof raw !== "string") return false;
      const scheduledDate = new Date(raw);
      if (scheduledDate < lastUsedCutoff) return false;
    }

    return true;
  });

  result.total = filteredSongs.length;
  if (filteredSongs.length === 0) return result;

  // ─── Batch upsert ─────────────────────────────────────────────────────────
  //
  // Old approach: one SELECT + one UPDATE or INSERT per song → O(n) serial DB
  // roundtrips (very slow for 200+ songs).
  //
  // New approach:
  //  1. Fetch ALL existing PCS links for this user in one query.
  //  2. Compute content for every filtered song in-memory.
  //  3. Split into toUpdate / toInsert lists.
  //  4. toUpdate: run library_items + link timestamp updates in parallel chunks.
  //  5. toInsert: single batch INSERT into library_items, then single batch
  //     INSERT into external_song_links.

  // Step 1: pre-fetch all existing PCS links for this user.
  const existingLinks = await db
    .select({
      id: externalSongLinksTable.id,
      libraryItemId: externalSongLinksTable.libraryItemId,
      externalId: externalSongLinksTable.externalId,
    })
    .from(externalSongLinksTable)
    .where(
      and(
        eq(externalSongLinksTable.userId, userId),
        eq(externalSongLinksTable.source, "pcs"),
      ),
    );

  const linkByExternalId = new Map(existingLinks.map((l) => [l.externalId, l]));

  // Step 2 & 3: compute content + split into update/insert batches.
  type UpdateRecord = {
    libraryItemId: number;
    linkId: number;
    title: string;
    content: Record<string, unknown>;
  };
  type InsertRecord = {
    externalId: string;
    title: string;
    content: Record<string, unknown>;
  };

  const toUpdate: UpdateRecord[] = [];
  const toInsert: InsertRecord[] = [];

  for (const song of filteredSongs) {
    try {
      const titleAttr = song.attributes?.["title"];
      const title =
        typeof titleAttr === "string" && titleAttr.trim()
          ? titleAttr.trim()
          : null;
      if (!title) continue;

      const defaultArrangement = pickArrangementForSong(song, arrangements);
      const allArrs = allArrangementsForSong(song, arrangements);
      const aa = defaultArrangement?.attributes ?? {};
      const sa = song.attributes ?? {};

      const artist =
        typeof sa["author"] === "string" && sa["author"]
          ? (sa["author"] as string)
          : null;
      const bpm = coerceBpm(aa["bpm"]);
      const key =
        typeof aa["chord_chart_key"] === "string" && aa["chord_chart_key"]
          ? (aa["chord_chart_key"] as string)
          : null;
      const meter =
        typeof aa["meter"] === "string" && aa["meter"].trim()
          ? aa["meter"].trim()
          : null;
      const durationRaw = aa["length"];
      const duration =
        typeof durationRaw === "number" &&
        Number.isFinite(durationRaw) &&
        durationRaw > 0
          ? Math.round(durationRaw)
          : typeof durationRaw === "string" && durationRaw.trim()
            ? (() => {
                const n = Number(durationRaw.trim());
                return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
              })()
            : null;

      const availableKeys = collectArrangementKeys(allArrs);

      const ccli =
        typeof sa["ccli_number"] === "string" && sa["ccli_number"]
          ? (sa["ccli_number"] as string)
          : typeof sa["ccli_number"] === "number"
            ? String(sa["ccli_number"])
            : null;
      const copyright =
        typeof sa["copyright"] === "string" && sa["copyright"]
          ? (sa["copyright"] as string)
          : null;

      const rawThemes =
        typeof sa["themes"] === "string" ? (sa["themes"] as string) : null;
      const themes = dedupeCaseInsensitive(splitList(rawThemes));
      const tags = dedupeCaseInsensitive(tagNamesForSong(song, tagsById));

      const rawLyrics =
        typeof sa["lyrics"] === "string" ? (sa["lyrics"] as string) : null;
      const lyrics = rawLyrics?.trim() || null;
      const excerpt = lyricsExcerpt(rawLyrics);

      const lastScheduledDate = normalizePcoDateString(
        typeof sa["last_scheduled_at"] === "string"
          ? (sa["last_scheduled_at"] as string)
          : null,
      );

      const content: Record<string, unknown> = { source: "planning-center" };
      if (artist) content["artist"] = artist;
      if (bpm !== null) content["bpm"] = bpm;
      if (key) content["key"] = key;
      if (availableKeys.length > 0) content["availableKeys"] = availableKeys;
      if (themes.length > 0) content["themes"] = themes;
      if (tags.length > 0) content["tags"] = tags;
      if (lyrics) content["lyrics"] = lyrics;
      if (excerpt) content["lyricsExcerpt"] = excerpt;
      if (ccli) content["ccli"] = ccli;
      if (copyright) content["copyright"] = copyright;
      if (lastScheduledDate) content["lastScheduledDate"] = lastScheduledDate;
      if (meter) content["meter"] = meter;
      if (duration !== null) content["duration"] = duration;

      const existing = linkByExternalId.get(song.id);
      if (existing) {
        toUpdate.push({
          libraryItemId: existing.libraryItemId,
          linkId: existing.id,
          title,
          content,
        });
      } else {
        toInsert.push({ externalId: song.id, title, content });
      }
    } catch (err) {
      logger.warn({ err, songId: song.id }, "Failed to prepare PCS song for import");
      result.errors.push(
        `Song ${song.id}: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  }

  // Step 4: update existing songs in parallel chunks.
  const now = new Date();
  await runInChunks(toUpdate, async ({ libraryItemId, linkId, title, content }) => {
    await db
      .update(libraryItemsTable)
      .set({ title, content, isRepertoire: true })
      .where(
        and(
          eq(libraryItemsTable.id, libraryItemId),
          eq(libraryItemsTable.userId, userId),
        ),
      );
    await db
      .update(externalSongLinksTable)
      .set({ lastSyncedAt: now })
      .where(eq(externalSongLinksTable.id, linkId));
  });
  result.updated = toUpdate.length;

  // Step 5: batch-insert new songs inside a transaction so that if the
  // external_song_links insert fails after library_items have been created,
  // the whole batch rolls back instead of leaving orphaned library rows.
  if (toInsert.length > 0) {
    try {
      await db.transaction(async (tx) => {
        const insertedItems = await tx
          .insert(libraryItemsTable)
          .values(
            toInsert.map(({ title, content }) => ({
              userId,
              kind: "song" as const,
              title,
              content,
              tags: [],
              isRepertoire: true,
            })),
          )
          .returning({ id: libraryItemsTable.id });

        const linkValues = toInsert
          .map((s, i) => {
            const item = insertedItems[i];
            if (!item) return null;
            return {
              libraryItemId: item.id,
              userId,
              source: "pcs" as const,
              externalId: s.externalId,
            };
          })
          .filter((v): v is NonNullable<typeof v> => v !== null);

        if (linkValues.length > 0) {
          await tx.insert(externalSongLinksTable).values(linkValues);
        }
        result.inserted = linkValues.length;
      });
    } catch (err) {
      logger.error({ err }, "PCS batch insert failed");
      result.errors.push(
        `Batch insert failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  }

  return result;
}
