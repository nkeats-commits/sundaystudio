/**
 * Bridge between the user's Resource Library + bundled "Scholarly Sources"
 * and the existing `SermonContext.resources[]` channel that flows into
 * `resourceBlurb()`.
 *
 * Two channels are merged here, both keyed by the sermon's primary +
 * secondary passages:
 *   1. Public-domain commentaries the user has enabled in Settings.
 *      Every chapter that matches a sermon passage is auto-injected,
 *      MINUS any source ids the pastor opted out of for THIS sermon
 *      (`excludedSourceIds`).
 *   2. Rows from the user's Resource Library (`sermon_resources`).
 *      A row is auto-included when its `relatedPassage` is empty (the
 *      pastor flagged it as "always relevant") OR when its parsed
 *      (book, chapter) overlaps the sermon's passages. Rows whose id
 *      appears in `excludedResourceIds` are skipped.
 *
 *      LEGACY back-compat: if a sermon was saved before task #71 it has
 *      a non-empty `attachedResourceIds` allow-list. To avoid quietly
 *      changing what those sermons see, when `attachedResourceIds` is
 *      non-empty we use those exact rows as the library inclusion set
 *      instead of passage matching. The UI surfaces a "Switch to
 *      auto-include" affordance for those sermons.
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
  listRegisteredSources,
  lookupCommentary,
  parsePassageRef,
} from "./scholarlySources";

export interface MergeableSermonContext {
  passage: string;
  secondaryPassages?: string[];
  /** Resource Library row ids the pastor opted out of for this sermon. */
  excludedResourceIds?: number[];
  /** Public-domain commentary source ids the pastor opted out of for this sermon. */
  excludedSourceIds?: string[];
  /**
   * LEGACY allow-list. Pre-task-71 sermons hand-attached library rows
   * via this field. When non-empty, the merge uses these exact ids as
   * the library channel instead of passage-matching the user's whole
   * Resource Library.
   */
  attachedResourceIds?: number[];
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
 * True iff `relatedPassage` references at least one (book, chapter) pair
 * that also appears in the sermon's passages.
 *
 * Match rule (must stay in sync with the OpenAPI doc on
 * `SermonResource.relatedPassage` and the client preview):
 *   - empty `relatedPassage`              → matches every sermon (the
 *                                           pastor saved a general note)
 *   - non-empty but unparseable           → DOES NOT match (the row is
 *                                           free-text-tagged like
 *                                           "Christmas Eve" — surfacing
 *                                           it on every sermon would
 *                                           dilute the prompt)
 *   - parseable                           → matches only on
 *                                           (book, chapter) overlap
 */
function libraryRowMatches(
  relatedPassage: string,
  sermonPairs: ReadonlyArray<{ book: string; chapter: number }>,
): boolean {
  const trimmed = relatedPassage.trim();
  if (!trimmed) return true;
  const rowPairs = parsePassageRef(trimmed);
  if (!rowPairs.length) return false;
  for (const a of rowPairs) {
    for (const b of sermonPairs) {
      if (a.book === b.book && a.chapter === b.chapter) return true;
    }
  }
  return false;
}

/**
 * True iff this sermon is in legacy mode — it was saved before task #71
 * and still has a hand-attached resource list. The UI uses this to show
 * a "Switch to auto-include" banner.
 *
 * Trust model: this is a back-compat affordance, not a security boundary.
 * A malicious client could spoof `attachedResourceIds` on the wire to
 * force allow-list semantics, but the DB query is always scoped to the
 * authenticated user's library rows so the worst case is they restrict
 * THEIR OWN sermon to a subset of THEIR OWN library — exactly equivalent
 * to clicking Exclude on every other row.
 */
function isLegacyMode(ctx: MergeableSermonContext): boolean {
  return (ctx.attachedResourceIds?.length ?? 0) > 0;
}

/**
 * Mutates `ctx.resources` in place: REPLACES whatever the client sent
 * with the server-derived merge of public-domain commentaries + Resource
 * Library rows that match the sermon's passages.
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
  const excludedResources = new Set(
    (ctx.excludedResourceIds ?? []).filter(Number.isInteger),
  );
  const excludedSources = new Set(
    (ctx.excludedSourceIds ?? []).filter((id) => typeof id === "string"),
  );

  // ---------------- Public-domain channel ----------------
  const enabledRaw = await getEnabledSourceIds(userId);
  // Layer per-sermon source opt-outs ON TOP of the global preferences.
  const enabled = enabledRaw.filter((id) => !excludedSources.has(id));
  // lookupCommentary enforces a single total-character budget across all
  // sources (TOTAL_COMMENTARY_BUDGET_CHARS), so prompt size stays bounded
  // regardless of how many sources the pastor has enabled.
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
  // Two modes:
  //   - LEGACY (attachedResourceIds non-empty): include ONLY those rows
  //     (still skip ones the pastor explicitly excluded after the fact).
  //   - NEW (attachedResourceIds empty): passage-match against the user's
  //     entire Resource Library, minus excluded ids.
  const legacy = isLegacyMode(ctx);
  let libraryRows: Array<typeof sermonResourcesTable.$inferSelect>;
  if (legacy) {
    const allowed = (ctx.attachedResourceIds ?? []).filter(
      (id) => Number.isInteger(id) && !excludedResources.has(id),
    );
    if (allowed.length === 0) {
      libraryRows = [];
    } else {
      libraryRows = await db
        .select()
        .from(sermonResourcesTable)
        .where(
          and(
            eq(sermonResourcesTable.userId, userId),
            inArray(sermonResourcesTable.id, allowed),
          ),
        );
    }
  } else {
    const where = [eq(sermonResourcesTable.userId, userId)];
    if (excludedResources.size > 0) {
      where.push(
        not(inArray(sermonResourcesTable.id, Array.from(excludedResources))),
      );
    }
    libraryRows = await db
      .select()
      .from(sermonResourcesTable)
      .where(and(...where));
  }

  const matchedLibrary = libraryRows.filter((r) => {
    if (!r.excerpt.trim()) return false;
    if (legacy) return true; // legacy: explicit allow-list bypasses passage match
    return libraryRowMatches(r.relatedPassage, sermonPairs);
  });

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

/* -------------------------------------------------------------------------- */
/* Preview                                                                    */
/* -------------------------------------------------------------------------- */

export interface PreviewPublicDomainHit {
  sourceId: string;
  sourceTitle: string;
  sourceAuthor?: string;
  bookCanonical: string;
  chapter: number;
}

export interface PreviewLibraryHit {
  id: number;
  title: string;
  author?: string;
  relatedPassage: string;
  /** True when matched because relatedPassage is empty (pastor-flagged broadly relevant). */
  alwaysRelevant: boolean;
}

export interface PreviewResult {
  publicDomain: PreviewPublicDomainHit[];
  library: PreviewLibraryHit[];
  legacyMode: boolean;
}

/**
 * Predict which Resource Library rows + public-domain commentary sources
 * the server will draw on for a given sermon context, WITHOUT touching the
 * prompt or running a generation.
 *
 * Server-side counterpart of `lib/passageMatch.ts` on the client. The
 * client computes the panel locally for instant feedback as the pastor
 * types; this endpoint is what the API server itself uses to verify the
 * same set right before generation, and it's what the integration tests
 * exercise.
 *
 * Public-domain return shape: ONE row per source that matched at least
 * one of the sermon's chapters (de-duped). The AI prompt itself still
 * receives one excerpt per (source, book, chapter) hit — see
 * `mergeScholarlyResources` — but the preview surface answers "which
 * sources will be consulted", not "how many excerpts", so the count never
 * over-reports a single commentary that happens to span multiple chapters.
 */
export async function previewSermonResources(
  userId: string,
  ctx: MergeableSermonContext,
): Promise<PreviewResult> {
  const passages = [ctx.passage, ...(ctx.secondaryPassages ?? [])].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  const sermonPairs = passages.flatMap((p) => parsePassageRef(p));
  const excludedResources = new Set(
    (ctx.excludedResourceIds ?? []).filter(Number.isInteger),
  );
  const excludedSources = new Set(
    (ctx.excludedSourceIds ?? []).filter((id) => typeof id === "string"),
  );
  const legacy = isLegacyMode(ctx);

  // ---- Public-domain ----
  const enabledRaw = await getEnabledSourceIds(userId);
  const enabled = enabledRaw.filter((id) => !excludedSources.has(id));
  // Use the same default budget as the merge path so the preview accurately
  // reflects which sources will actually contribute to the prompt.
  const pdHits = enabled.length ? lookupCommentary(enabled, passages) : [];
  const sourceMeta = new Map(
    listRegisteredSources().map((s) => [s.id, s] as const),
  );
  // The preview surface answers "which sources will the AI hear from",
  // not "how many chapter excerpts will be passed". Collapse multiple
  // (book, chapter) hits per source into one row so the panel doesn't
  // overcount when a sermon spans several chapters of the same commentary.
  // The merge itself still passes one excerpt per chapter to the prompt.
  const publicDomain: PreviewPublicDomainHit[] = [];
  const seenPdSources = new Set<string>();
  for (const h of pdHits) {
    if (seenPdSources.has(h.sourceId)) continue;
    seenPdSources.add(h.sourceId);
    publicDomain.push({
      sourceId: h.sourceId,
      sourceTitle: h.sourceTitle,
      sourceAuthor: h.sourceAuthor || sourceMeta.get(h.sourceId)?.author || undefined,
      bookCanonical: h.bookCanonical,
      chapter: h.chapter,
    });
  }

  // ---- Library ----
  let libraryRows: Array<typeof sermonResourcesTable.$inferSelect>;
  if (legacy) {
    const allowed = (ctx.attachedResourceIds ?? []).filter(
      (id) => Number.isInteger(id) && !excludedResources.has(id),
    );
    libraryRows = allowed.length === 0
      ? []
      : await db
          .select()
          .from(sermonResourcesTable)
          .where(
            and(
              eq(sermonResourcesTable.userId, userId),
              inArray(sermonResourcesTable.id, allowed),
            ),
          );
  } else {
    const where = [eq(sermonResourcesTable.userId, userId)];
    if (excludedResources.size > 0) {
      where.push(
        not(inArray(sermonResourcesTable.id, Array.from(excludedResources))),
      );
    }
    libraryRows = await db
      .select()
      .from(sermonResourcesTable)
      .where(and(...where));
  }

  const library: PreviewLibraryHit[] = [];
  for (const r of libraryRows) {
    if (!r.excerpt.trim()) continue;
    const trimmed = r.relatedPassage.trim();
    let matched: boolean;
    let alwaysRelevant = false;
    if (legacy) {
      matched = true;
      alwaysRelevant = trimmed === "";
    } else if (trimmed === "") {
      matched = true;
      alwaysRelevant = true;
    } else {
      matched = libraryRowMatches(r.relatedPassage, sermonPairs);
    }
    if (!matched) continue;
    library.push({
      id: r.id,
      title: r.title,
      author: r.author || undefined,
      relatedPassage: r.relatedPassage,
      alwaysRelevant,
    });
  }

  return { publicDomain, library, legacyMode: legacy };
}
