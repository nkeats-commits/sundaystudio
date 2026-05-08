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
 *     service types via `/song_schedules`) and/or by last-used date.
 *  4. Upsert into `library_items` keyed via `external_song_links`
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
 * Fetch the set of song IDs used in the given PCS service types.
 *
 * Approach: paginate through plans for each service type with `include=items`,
 * then collect IDs from items where `item_type == "song"`. This is the
 * universally-supported PCO path — the nested `song_schedules` relationship
 * returns 404 on some organisations/service-type configurations and is not
 * reliable for this purpose.
 *
 * FAIL-CLOSED: throws on any API error so a caller who explicitly requested
 * service-type filtering never silently imports the full library.
 */
async function fetchServiceTypeSongIds(
  userId: string,
  serviceTypeIds: string[],
): Promise<Set<string>> {
  const songIds = new Set<string>();
  for (const stId of serviceTypeIds) {
    // Sparse fieldsets: we only need Plan IDs and Item item_type/song relationship.
    let next: string | null =
      `/services/v2/service_types/${stId}/plans` +
      `?per_page=100&include=items` +
      `&fields[Plan]=id&fields[Item]=item_type`;
    for (let page = 0; page < 100 && next; page += 1) {
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
      // Included items: pick those with item_type "song" and extract song ID.
      for (const item of body.included ?? []) {
        if (item.type !== "Item") continue;
        if (item.attributes?.["item_type"] !== "song") continue;
        const songRel = item.relationships?.["song"]?.data;
        if (songRel && !Array.isArray(songRel) && songRel.id) {
          songIds.add(songRel.id);
        }
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

  // Optional service-type pre-filter: collect allowed song IDs.
  // fetchServiceTypeSongIds throws on any PCS API failure (fail-closed) so
  // a filter that cannot be resolved aborts the sync rather than silently
  // importing the full library.
  let allowedSongIds: Set<string> | undefined;
  if (options?.serviceTypeIds && options.serviceTypeIds.length > 0) {
    allowedSongIds = await fetchServiceTypeSongIds(
      userId,
      options.serviceTypeIds,
    );
  }

  // Optional date pre-filter cutoff.
  const lastUsedCutoff: Date | null = options?.lastUsedSince
    ? new Date(options.lastUsedSince)
    : null;

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
    // Service-type filter.
    if (allowedSongIds !== undefined && !allowedSongIds.has(song.id)) return false;

    // Last-used-since filter: skip songs never scheduled or scheduled before cutoff.
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

  // Second pass: upsert each song.
  for (const song of filteredSongs) {
    try {
      const titleAttr = song.attributes?.["title"];
      const title =
        typeof titleAttr === "string" && titleAttr.trim()
          ? titleAttr.trim()
          : null;
      if (!title) continue;

      // Default arrangement → primary BPM, key, meter, and duration.
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

      // Meter (time signature, e.g. "4/4") from the default arrangement.
      const meter =
        typeof aa["meter"] === "string" && aa["meter"].trim()
          ? aa["meter"].trim()
          : null;

      // Duration in seconds ("length" is PCO's attribute name on arrangements).
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

      // All unique keys across every arrangement (chord_chart_key + keys[]).
      const availableKeys = collectArrangementKeys(allArrs);

      // Song-level metadata.
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

      // Themes: PCS stores as a comma-separated string at the song level.
      const rawThemes =
        typeof sa["themes"] === "string" ? (sa["themes"] as string) : null;
      const themes = dedupeCaseInsensitive(splitList(rawThemes));

      // Tags: from included Tag resources (separate from song-level themes).
      const tags = dedupeCaseInsensitive(tagNamesForSong(song, tagsById));

      // Full lyrics text (stored for AI context; not displayed in the UI).
      const rawLyrics =
        typeof sa["lyrics"] === "string" ? (sa["lyrics"] as string) : null;
      const lyrics = rawLyrics?.trim() || null;

      // A short excerpt for inline AI prompt use.
      const excerpt = lyricsExcerpt(rawLyrics);

      // Last scheduled date — shared normalizePcoDateString handles API ISO datetime.
      const lastScheduledDate = normalizePcoDateString(
        typeof sa["last_scheduled_at"] === "string"
          ? (sa["last_scheduled_at"] as string)
          : null,
      );

      // Build content JSONB. Only include keys with non-null/non-empty values.
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

      // Upsert via the external_song_links table.
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
