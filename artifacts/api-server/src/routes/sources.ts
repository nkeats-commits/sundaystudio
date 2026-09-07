/**
 * Scholarly Sources API — list bundled public-domain commentaries and Bible
 * reference collections and let the user toggle which ones the Sermon Builder
 * consults.
 *
 * The actual commentary content is server-only. Clients receive only the
 * registry (id + metadata) and the user's enabled-id list.
 */
import { Router, type IRouter } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, userSourcePreferencesTable, usersTable } from "@workspace/db";
import {
  LookupBibleReferencesBody,
  UpdateScholarlySourcePreferencesBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { trackEvent } from "../lib/emailClient";
import { EVENTS } from "../lib/eventRegistry";
import {
  DEFAULT_ENABLED_SOURCE_IDS,
  isRegisteredSource,
  listRegisteredSources,
} from "../lib/scholarlySources";
import {
  describeReferenceLookupFailure,
  isRegisteredReferenceSource,
  lookupReferenceBundle,
  listRegisteredReferenceSources,
} from "../lib/referenceSources";
import { getEnabledSourceIds } from "../lib/scholarlyMerge";

const router: IRouter = Router();

router.get("/sources", requireAuth, async (req, res) => {
  const enabled = await getEnabledSourceIds(req.userId!);
  res.json({
    sources: [...listRegisteredSources(), ...listRegisteredReferenceSources()]
      .sort((a, b) => a.title.localeCompare(b.title)),
    enabledSourceIds: enabled,
    defaults: DEFAULT_ENABLED_SOURCE_IDS.filter(
      (id) => isRegisteredSource(id) || isRegisteredReferenceSource(id),
    ),
  });
});

router.post("/sources/lookup", requireAuth, async (req, res) => {
  const parsed = LookupBibleReferencesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const enabled = await getEnabledSourceIds(req.userId!);
  const passages = [
    ...(parsed.data.passage ? [parsed.data.passage] : []),
    ...(parsed.data.secondaryPassages ?? []),
  ];
  try {
    res.json(lookupReferenceBundle(enabled, passages, parsed.data.terms ?? []));
  } catch (error) {
    req.log.error({ err: error }, "Bible reference lookup failed");
    res.status(500).json(describeReferenceLookupFailure(error));
  }
});

router.put("/sources/preferences", requireAuth, async (req, res) => {
  const parsed = UpdateScholarlySourcePreferencesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Dedupe + drop unknown ids gracefully on the validation pass; reject hard
  // if the client sent an obvious typo so they notice.
  const ids = Array.from(new Set(parsed.data.enabledSourceIds));
  const unknownId = ids.find(
    (id) => !isRegisteredSource(id) && !isRegisteredReferenceSource(id),
  );
  if (unknownId) {
    res
      .status(400)
      .json({ error: `Unknown source id: ${unknownId}` });
    return;
  }
  // Capture previous enabled count BEFORE the upsert so we can detect a true
  // "never had any sources" → "at least one source" transition. Fetched here
  // (synchronously in the handler) so the closure below always sees the pre-save
  // value even though the upsert has already mutated the row by then.
  const [prevPref] = await db
    .select({ enabledSourceIds: userSourcePreferencesTable.enabledSourceIds })
    .from(userSourcePreferencesTable)
    .where(eq(userSourcePreferencesTable.userId, req.userId!))
    .limit(1);
  const previouslyEnabledCount = prevPref?.enabledSourceIds?.length ?? 0;

  await db
    .insert(userSourcePreferencesTable)
    .values({
      userId: req.userId!,
      enabledSourceIds: ids,
    })
    .onConflictDoUpdate({
      target: userSourcePreferencesTable.userId,
      set: {
        enabledSourceIds: ids,
        updatedAt: sql`now()`,
      },
    });
  res.json({
    sources: [...listRegisteredSources(), ...listRegisteredReferenceSources()]
      .sort((a, b) => a.title.localeCompare(b.title)),
    enabledSourceIds: ids,
    defaults: DEFAULT_ENABLED_SOURCE_IDS.filter(
      (id) => isRegisteredSource(id) || isRegisteredReferenceSource(id),
    ),
  });

  // Fire scholarly_sources_enabled only on the first true enablement transition:
  // user went from zero enabled sources to at least one. Saves that just re-save
  // existing defaults (e.g. matthew-henry-concise → matthew-henry-concise) without
  // ever having consciously enabled anything do NOT trigger this event.
  if (ids.length > 0 && previouslyEnabledCount === 0) {
    void (async () => {
      try {
        const [claimed] = await db
          .update(usersTable)
          .set({ scholarlySourcesEventFiredAt: new Date() })
          .where(and(eq(usersTable.id, req.userId!), isNull(usersTable.scholarlySourcesEventFiredAt)))
          .returning({ id: usersTable.id, email: usersTable.email });
        if (claimed) {
          const delivered = await trackEvent(EVENTS.SCHOLARLY_SOURCES_ENABLED, claimed.id, claimed.email, {
            enabledCount: ids.length,
            sourceIds: ids,
          });
          if (!delivered) {
            await db.update(usersTable)
              .set({ scholarlySourcesEventFiredAt: null })
              .where(eq(usersTable.id, claimed.id));
          }
        }
      } catch (err) {
        req.log.warn({ err }, "scholarly_sources_enabled event tracking failed");
      }
    })();
  }
});

export default router;
// Re-exported for tests
export { eq };
