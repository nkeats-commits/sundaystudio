/**
 * Scholarly Sources API — list bundled public-domain commentaries and let
 * the user toggle which ones the Sermon Builder consults.
 *
 * The actual commentary content is server-only. Clients receive only the
 * registry (id + metadata) and the user's enabled-id list.
 */
import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, userSourcePreferencesTable } from "@workspace/db";
import { UpdateScholarlySourcePreferencesBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import {
  DEFAULT_ENABLED_SOURCE_IDS,
  assertAllRegistered,
  isRegisteredSource,
  listRegisteredSources,
} from "../lib/scholarlySources";
import { getEnabledSourceIds } from "../lib/scholarlyMerge";

const router: IRouter = Router();

router.get("/sources", requireAuth, async (req, res) => {
  const enabled = await getEnabledSourceIds(req.userId!);
  res.json({
    sources: listRegisteredSources(),
    enabledSourceIds: enabled,
    defaults: DEFAULT_ENABLED_SOURCE_IDS.filter(isRegisteredSource),
  });
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
  try {
    assertAllRegistered(ids);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : "Invalid source id" });
    return;
  }
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
    sources: listRegisteredSources(),
    enabledSourceIds: ids,
    defaults: DEFAULT_ENABLED_SOURCE_IDS.filter(isRegisteredSource),
  });
});

export default router;
// Re-exported for tests
export { eq };
