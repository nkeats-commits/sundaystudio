/**
 * Bridge between the per-user "Scholarly Sources" preferences and the
 * existing `SermonContext.resources[]` channel that flows into
 * `resourceBlurb()`.
 *
 * For each generation request we look up the user's enabled bundled sources,
 * resolve commentary entries for the primary + secondary passages, and
 * PREPEND them to the resources array as synthetic entries. Reusing the
 * existing channel means the SERMON_GROUND_RULES (no fabricated commentary,
 * attribute by title/author) automatically apply.
 *
 * Each injected entry is titled like:
 *   `[Public-Domain Source] Matthew Henry's Concise Commentary — Romans 8`
 * so the model has unambiguous attribution to use.
 */
import { db, userSourcePreferencesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  DEFAULT_ENABLED_SOURCE_IDS,
  isRegisteredSource,
  lookupCommentary,
} from "./scholarlySources";

export interface MergeableSermonContext {
  passage: string;
  secondaryPassages?: string[];
  resources?: { title: string; author?: string; excerpt: string }[];
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
  const raw = row ? row.enabledSourceIds : DEFAULT_ENABLED_SOURCE_IDS;
  return raw.filter(isRegisteredSource);
}

/**
 * Mutates `ctx.resources` in place: prepends commentary entries derived from
 * the user's enabled scholarly sources for the sermon's passages.
 *
 * Returns the count of injected entries (caller can log / surface to UI).
 * Safe to call regardless of whether the user has any enabled sources or
 * whether any source has data for the passage — both cases yield 0.
 */
export async function mergeScholarlyResources(
  userId: string,
  ctx: MergeableSermonContext,
): Promise<number> {
  const enabled = await getEnabledSourceIds(userId);
  if (!enabled.length) return 0;
  const passages = [ctx.passage, ...(ctx.secondaryPassages ?? [])].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  const hits = lookupCommentary(enabled, passages);
  if (!hits.length) return 0;
  const injected = hits.map((h) => {
    const bookDisplay = h.bookCanonical
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const titleSuffix = h.title ? ` — ${h.title}` : "";
    return {
      title: `[Public-Domain Source] ${h.sourceTitle} — ${bookDisplay} ${h.chapter}${titleSuffix}`,
      author: h.sourceAuthor,
      excerpt: h.text,
    };
  });
  ctx.resources = [...injected, ...(ctx.resources ?? [])];
  return injected.length;
}
