import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  sermonsTable,
  sermonExportsTable,
  sermonResourcesTable,
  sermonSeriesTable,
  servicePlansTable,
  type ServicePlanContent,
  type ServicePlanItem,
} from "@workspace/db";
import {
  CreateSermonBody,
  UpdateSermonBody,
  ExportSermonBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireActiveAccess } from "../middlewares/requireActiveAccess";
import {
  renderSermonAsMarkdown,
  renderSermonAsText,
  renderSmallGroupHandoutEmail,
  renderSmallGroupHandoutMarkdown,
} from "../lib/sermonExport";

/**
 * Compose a fresh service plan around a sermon. We pull what we can from
 * the sermon's worshipIntegration block (call to worship, songs, prayer
 * prompts, response, communion, benediction), and always include a sermon
 * slot whose `linkedKind`/`linkedId`/`linkedTitle` point back to the source
 * sermon. The sermon body snapshot is the chosen big idea (or first option)
 * so the slot keeps reading well even if the sermon is later edited.
 */
function composeServicePlanFromSermon(sermon: typeof sermonsTable.$inferSelect): {
  title: string;
  scripture: string;
  theme: string;
  season: string;
  serviceDate: Date | null;
  content: ServicePlanContent;
} {
  const wi = sermon.worshipIntegration;
  const order: ServicePlanItem[] = [];
  let nextId = 1;
  const id = () => `slot-${nextId++}`;

  order.push({
    id: id(),
    kind: "welcome",
    title: "Welcome & Announcements",
    body: "",
  });

  if (wi?.callToWorship) {
    order.push({
      id: id(),
      kind: "scripture",
      title: "Call to Worship",
      body: wi.callToWorship,
    });
  }

  const songs = wi?.songs ?? [];
  if (songs[0]) {
    order.push({
      id: id(),
      kind: "song",
      title: songs[0].title,
      body: [songs[0].artist, songs[0].whyItFits].filter(Boolean).join(" — "),
    });
  }

  if (wi?.prayerPrompts && wi.prayerPrompts.length > 0) {
    order.push({
      id: id(),
      kind: "prayer",
      title: "Opening Prayer",
      body: wi.prayerPrompts[0]!,
    });
  }

  if (sermon.passage) {
    order.push({
      id: id(),
      kind: "scripture",
      title: "Scripture Reading",
      body: sermon.passage,
    });
  }

  // Snapshot of sermon for the slot body — use the chosen big idea, or fall
  // back to the first option, or the sermon theme. Linked fields point back
  // to the sermon row so the UI can render a "Linked to ..." pill.
  const bigIdea =
    sermon.bigIdea?.selected ??
    sermon.bigIdea?.options?.[0]?.bigIdea ??
    sermon.theme ??
    "";
  order.push({
    id: id(),
    kind: "sermon",
    title: sermon.title,
    body: bigIdea,
    linkedKind: "sermon",
    linkedId: sermon.id,
    linkedTitle: sermon.title,
  });

  if (songs[1]) {
    order.push({
      id: id(),
      kind: "song",
      title: songs[1].title,
      body: [songs[1].artist, songs[1].whyItFits].filter(Boolean).join(" — "),
    });
  }

  if (wi?.responseMoment) {
    order.push({
      id: id(),
      kind: "custom",
      title: "Response Moment",
      body: wi.responseMoment,
    });
  }

  if (wi?.communionMoment) {
    order.push({
      id: id(),
      kind: "communion",
      title: "Communion",
      body: wi.communionMoment,
    });
  }

  order.push({
    id: id(),
    kind: "benediction",
    title: "Benediction",
    body: wi?.benediction ?? "",
  });

  return {
    title: `Service for ${sermon.title}`,
    scripture: sermon.passage ?? "",
    theme: sermon.theme ?? "",
    season: "",
    serviceDate: sermon.sermonDate ?? null,
    content: { notes: wi?.teamDevotionalSeed ?? null, order },
  };
}

const router: IRouter = Router();

/**
 * Verify that every resource id in `ids` belongs to `userId`.
 * Returns null when valid, or a string with the offending ids when invalid.
 * (Multi-tenant safety — without this, a user could attach another tenant's
 * resource ids to their sermon and have the model receive their excerpts.)
 */
async function validateResourceOwnership(
  userId: string,
  ids: number[],
): Promise<string | null> {
  if (ids.length === 0) return null;
  const nonInt = ids.filter((n) => !Number.isInteger(n));
  if (nonInt.length > 0) {
    return `attachedResourceIds must be integers: ${nonInt.join(", ")}`;
  }
  const unique = Array.from(new Set(ids));
  const owned = await db
    .select({ id: sermonResourcesTable.id })
    .from(sermonResourcesTable)
    .where(
      and(
        eq(sermonResourcesTable.userId, userId),
        inArray(sermonResourcesTable.id, unique),
      ),
    );
  const ownedSet = new Set(owned.map((r) => r.id));
  const missing = unique.filter((id) => !ownedSet.has(id));
  if (missing.length > 0) {
    return `Some attached resources do not exist or are not yours: ${missing.join(", ")}`;
  }
  return null;
}

/**
 * Verify that `seriesId` belongs to `userId`. Returns null when valid (or when
 * id is null/undefined — meaning "unlink from any series"), or an error string.
 * Without this a user could attach their sermon to another tenant's series row.
 */
async function validateSeriesOwnership(
  userId: string,
  seriesId: number | null | undefined,
): Promise<string | null> {
  if (seriesId === null || seriesId === undefined) return null;
  if (!Number.isInteger(seriesId)) {
    return `seriesId must be an integer: ${seriesId}`;
  }
  const [row] = await db
    .select({ id: sermonSeriesTable.id })
    .from(sermonSeriesTable)
    .where(
      and(
        eq(sermonSeriesTable.userId, userId),
        eq(sermonSeriesTable.id, seriesId),
      ),
    )
    .limit(1);
  if (!row) {
    return `Sermon series ${seriesId} does not exist or is not yours`;
  }
  return null;
}

router.get("/sermons", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(sermonsTable)
    .where(eq(sermonsTable.userId, req.userId!))
    .orderBy(desc(sermonsTable.updatedAt));
  res.json(rows);
});

router.post("/sermons", requireAuth, requireActiveAccess, async (req, res) => {
  const parsed = CreateSermonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const ownershipError = await validateResourceOwnership(
    req.userId!,
    d.attachedResourceIds ?? [],
  );
  if (ownershipError) {
    res.status(400).json({ error: ownershipError });
    return;
  }
  const seriesError = await validateSeriesOwnership(req.userId!, d.seriesId);
  if (seriesError) {
    res.status(400).json({ error: seriesError });
    return;
  }
  const [row] = await db
    .insert(sermonsTable)
    .values({
      userId: req.userId!,
      title: d.title,
      sermonDate: d.sermonDate ?? null,
      passage: d.passage ?? "",
      secondaryPassages: d.secondaryPassages ?? [],
      theme: d.theme ?? "",
      series: d.series ?? "",
      seriesId: d.seriesId ?? null,
      seriesOrder: d.seriesOrder ?? null,
      occasion: d.occasion ?? "",
      audience: d.audience ?? "",
      length: d.length ?? "",
      tone: d.tone ?? "",
      style: d.style ?? "",
      depth: d.depth ?? "",
      outputFormat: d.outputFormat ?? "manuscript",
      pastorNotes: d.pastorNotes ?? "",
      attachedResourceIds: d.attachedResourceIds ?? [],
      tags: d.tags ?? [],
      status: d.status ?? "draft",
    })
    .returning();
  res.status(201).json(row);
});

router.get("/sermons/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [row] = await db
    .select()
    .from(sermonsTable)
    .where(and(eq(sermonsTable.id, id), eq(sermonsTable.userId, req.userId!)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

router.patch("/sermons/:id", requireAuth, requireActiveAccess, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const parsed = UpdateSermonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  if (d.attachedResourceIds !== undefined) {
    const ownershipError = await validateResourceOwnership(
      req.userId!,
      d.attachedResourceIds,
    );
    if (ownershipError) {
      res.status(400).json({ error: ownershipError });
      return;
    }
  }
  if (d.seriesId !== undefined) {
    const seriesError = await validateSeriesOwnership(req.userId!, d.seriesId);
    if (seriesError) {
      res.status(400).json({ error: seriesError });
      return;
    }
  }
  const update: Record<string, unknown> = {};
  for (const k of [
    "title",
    "sermonDate",
    "passage",
    "secondaryPassages",
    "theme",
    "series",
    "seriesId",
    "seriesOrder",
    "occasion",
    "audience",
    "length",
    "tone",
    "style",
    "depth",
    "outputFormat",
    "pastorNotes",
    "study",
    "bigIdea",
    "outline",
    "manuscript",
    "applications",
    "illustrations",
    "conclusion",
    "worshipIntegration",
    "smallGroupQuestions",
    "sectionHashes",
    "attachedResourceIds",
    "tags",
    "status",
  ] as const) {
    if (d[k] !== undefined) update[k] = d[k];
  }
  if (Object.keys(update).length === 0) {
    const [row] = await db
      .select()
      .from(sermonsTable)
      .where(and(eq(sermonsTable.id, id), eq(sermonsTable.userId, req.userId!)))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
    return;
  }
  const [row] = await db
    .update(sermonsTable)
    .set(update)
    .where(and(eq(sermonsTable.id, id), eq(sermonsTable.userId, req.userId!)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

router.delete("/sermons/:id", requireAuth, requireActiveAccess, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const result = await db
    .delete(sermonsTable)
    .where(and(eq(sermonsTable.id, id), eq(sermonsTable.userId, req.userId!)))
    .returning();
  if (result.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).end();
});

router.post("/sermons/:id/duplicate", requireAuth, requireActiveAccess, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [src] = await db
    .select()
    .from(sermonsTable)
    .where(and(eq(sermonsTable.id, id), eq(sermonsTable.userId, req.userId!)))
    .limit(1);
  if (!src) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = src;
  const [row] = await db
    .insert(sermonsTable)
    .values({ ...rest, title: `${src.title} (copy)`, status: "draft" })
    .returning();
  res.status(201).json(row);
});

router.post("/sermons/:id/build-service", requireAuth, requireActiveAccess, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [sermon] = await db
    .select()
    .from(sermonsTable)
    .where(and(eq(sermonsTable.id, id), eq(sermonsTable.userId, req.userId!)))
    .limit(1);
  if (!sermon) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const composed = composeServicePlanFromSermon(sermon);
  const [row] = await db
    .insert(servicePlansTable)
    .values({
      userId: req.userId!,
      title: composed.title,
      scripture: composed.scripture,
      theme: composed.theme,
      season: composed.season,
      serviceDate: composed.serviceDate,
      content: composed.content,
    })
    .returning();
  res.status(201).json(row);
});

/**
 * Reverse lookup: which service plans pull this sermon into one of their
 * slots? We scan the jsonb `content.order` array for elements whose
 * `linkedKind`/`linkedId` point back to this sermon. The `@>` containment
 * operator runs against the jsonb GIN index efficiently when one exists,
 * and degrades to a sequential scan otherwise — fine at this scale.
 */
router.get("/sermons/:id/linked-services", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const needle = JSON.stringify([{ linkedKind: "sermon", linkedId: id }]);
  const rows = await db
    .select({
      id: servicePlansTable.id,
      title: servicePlansTable.title,
      serviceDate: servicePlansTable.serviceDate,
    })
    .from(servicePlansTable)
    .where(
      and(
        eq(servicePlansTable.userId, req.userId!),
        sql`${servicePlansTable.content}->'order' @> ${needle}::jsonb`,
      ),
    )
    .orderBy(desc(servicePlansTable.serviceDate));
  res.json(rows);
});

router.post("/sermons/:id/export", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const parsed = ExportSermonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [sermon] = await db
    .select()
    .from(sermonsTable)
    .where(and(eq(sermonsTable.id, id), eq(sermonsTable.userId, req.userId!)))
    .limit(1);
  if (!sermon) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const content =
    parsed.data.format === "text"
      ? renderSermonAsText(sermon)
      : parsed.data.format === "small-group-handout"
        ? renderSmallGroupHandoutMarkdown(sermon)
        : parsed.data.format === "small-group-email"
          ? renderSmallGroupHandoutEmail(sermon)
          : renderSermonAsMarkdown(sermon);
  const [row] = await db
    .insert(sermonExportsTable)
    .values({
      userId: req.userId!,
      sermonId: id,
      format: parsed.data.format,
      content,
    })
    .returning();
  res.json(row);
});

export default router;
