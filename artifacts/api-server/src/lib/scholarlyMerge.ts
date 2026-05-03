/**
 * Bridge between the user's Resource Library + bundled "Scholarly Sources"
 * and the existing `SermonContext.resources[]` channel that flows into
 * `resourceBlurb()`.
 *
 * Two channels are merged here, both keyed by the sermon's primary +
 * secondary passages:
 *   1. Public-domain commentaries the user has enabled in Settings.
 *      Every chapter that matches a sermon passage is auto-injected.
 *   2. Rows from the user's Resource Library (`sermon_resources`).
 *      A row is auto-included when its `relatedPassage` is empty (the
 *      pastor flagged it as "always relevant") OR when its parsed
 *      (book, chapter) overlaps the sermon's passages. Rows whose id
 *      appears in `excludedResourceIds` are skipped — that's how the
 *      pastor opts a single Library row out of a single sermon.
 *
 * Reusing the existing channel means SERMON_GROUND_RULES (no fabricated
 * commentary, attribute by title/author) automatically apply.
 *
 * Each injected entry is titled with a marker so the prompt can group
 * them: `[Public-Domain Source] ...` or `[Library] ...`.
 */
import { db, sermonResourcesTable, userSourcePreferencesTable } from "@workspace/db";
import { and, eq, inArray, not } from "drizzle-orm";
import {
  DEFAULT_ENABLED_SOURCE_IDS,
  isRegisteredSource,
  lookupCommentary,
  parsePassageRef,
} from "./scholarlySources";

export interface MergeableSermonContext {
  passage: string;
  secondaryPassages?: string[];
  /** Resource Library row ids the pastor opted out of for this sermon. */
  excludedResourceIds?: number[];
  resources?: { title: string; author?: string; excerpt: string }[];
}

/**
 * Server-side, deterministic record of which resources actually
 * contributed an excerpt to a generation. Surfaced to the client (e.g. the
 * Study tab "Sources consulted" footer) so the pastor sees the truth, not
 * just whatever the model paraphrases.
 */
export interface ConsultedSource {
  /** Stable id. PD: source id. Library: `library:<numericId>`. */
  id: string;
  title: string;
  author?: string;
  kind: "public-domain" | "library";
}

export interface MergeResult {
  count: number;
  consultedSources: ConsultedSource[];
}

/**
 * Resolve a user's enabled scholarly source ids from their saved preferences,
 * falling back to the curated defaults if they have never opened the panel.
 *
 * Filters out ids that are no longer registered so a stale row doesn't crash
 * lookup. Exported so the GET endpoint can reuse the same logic.
 */
export async function getEnabledSourceIds(userId: string): Promise<string[]> {
  const [row] = await db
    .select()
    .from(userSourcePreferencesTable)
    .where(eq(userSourcePreferencesTable.userId, userId))
    .limit(1);
  if (row) return row.enabledSourceIds.filter(isRegisteredSource);

  const seeded = DEFAULT_ENABLED_SOURCE_IDS.filter(isRegisteredSource);
  await db
    .insert(userSourcePreferencesTable)
    .values({ userId, enabledSourceIds: seeded })
    .onConflictDoNothing({ target: userSourcePreferencesTable.userId });
  return seeded;
}

/**
 * True if `relatedPassage` references at least one (book, chapter) pair
 * that also appears in the sermon's passages. Empty `relatedPassage` is
 * treated as "always relevant" — the pastor saved a general note, so we
 * surface it to every sermon (still subject to per-sermon exclude).
 */
function libraryRowMatches(
  relatedPassage: string,
  sermonPairs: ReadonlyArray<{ book: string; chapter: number }>,
): boolean {
  const trimmed = relatedPassage.trim();
  if (!trimmed) return true;
  const rowPairs = parsePassageRef(trimmed);
  if (!rowPairs.length) {
    // Unparseable but non-empty — fall back to always-include so a
    // pastor's hand-written tag like "Christmas Eve" still surfaces.
    return true;
  }
  for (const a of rowPairs) {
    for (const b of sermonPairs) {
      if (a.book === b.book && a.chapter === b.chapter) return true;
    }
  }
  return false;
}

/**
 * Mutates `ctx.resources` in place: REPLACES whatever the client sent
 * with the server-derived merge of public-domain commentaries + Resource
 * Library rows that match the sermon's passages.
 *
 * This is intentionally destructive — pre-task #71 the client could
 * inline arbitrary `resources[]` and the server trusted them. Now the
 * server is the sole authority on what the model sees, with the pastor's
 * only lever being `excludedResourceIds` (per-sermon opt-out of a
 * specific Library row).
 *
 * Returns metadata (count + consulted sources) the caller can surface
 * to the UI as a transparency footer.
 */
export async function mergeScholarlyResources(
  userId: string,
  ctx: MergeableSermonContext,
): Promise<MergeResult> {
  // Server is sole authority on prompt-context resources — wipe anything
  // the client tried to inject.
  ctx.resources = [];

  const passages = [ctx.passage, ...(ctx.secondaryPassages ?? [])].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  const sermonPairs = passages.flatMap((p) => parsePassageRef(p));
  const excludedSet = new Set((ctx.excludedResourceIds ?? []).filter(Number.isInteger));

  // ---------------- Public-domain channel ----------------
  const enabled = await getEnabledSourceIds(userId);
  const pdHits = enabled.length ? lookupCommentary(enabled, passages) : [];
  const pdInjected = pdHits.map((h) => {
    const bookDisplay = h.bookCanonical
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const titleSuffix = h.title ? ` — ${h.title}` : "";
    return {
      title: `[Public-Domain Source] ${h.sourceTitle} — ${bookDisplay} ${h.chapter}${titleSuffix}`,
      author: h.sourceAuthor,
      excerpt: h.text,
    };
  });

  // ---------------- Library channel ----------------
  // Pull every Library row for this user (excluding ids the pastor opted
  // out of for this sermon), then filter by passage match in JS — the
  // matcher needs to canonicalize book aliases and that's already on the
  // server side.
  const libraryWhereClauses = [eq(sermonResourcesTable.userId, userId)];
  if (excludedSet.size > 0) {
    libraryWhereClauses.push(
      not(inArray(sermonResourcesTable.id, Array.from(excludedSet))),
    );
  }
  const libraryRows = await db
    .select()
    .from(sermonResourcesTable)
    .where(and(...libraryWhereClauses));

  const matchedLibrary = libraryRows.filter(
    (r) => r.excerpt.trim() && libraryRowMatches(r.relatedPassage, sermonPairs),
  );

  const libInjected = matchedLibrary.map((r) => ({
    title: `[Library] ${r.title}`,
    author: r.author || undefined,
    excerpt: r.excerpt,
  }));

  ctx.resources = [...pdInjected, ...libInjected];

  // ---------------- Consulted-source bookkeeping ----------------
  const consultedSources: ConsultedSource[] = [];
  const seenSources = new Set<string>();
  for (const h of pdHits) {
    if (seenSources.has(h.sourceId)) continue;
    seenSources.add(h.sourceId);
    consultedSources.push({
      id: h.sourceId,
      title: h.sourceTitle,
      author: h.sourceAuthor,
      kind: "public-domain",
    });
  }
  for (const r of matchedLibrary) {
    consultedSources.push({
      id: `library:${r.id}`,
      title: r.title,
      author: r.author || undefined,
      kind: "library",
    });
  }

  return {
    count: pdInjected.length + libInjected.length,
    consultedSources,
  };
}
