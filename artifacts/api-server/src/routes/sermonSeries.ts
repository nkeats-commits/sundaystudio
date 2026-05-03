import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  db,
  sermonSeriesTable,
  sermonsTable,
} from "@workspace/db";
import {
  CreateSermonSeriesBody,
  UpdateSermonSeriesBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireActiveAccess } from "../middlewares/requireActiveAccess";

const router: IRouter = Router();

router.get("/sermon-series", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(sermonSeriesTable)
    .where(eq(sermonSeriesTable.userId, req.userId!))
    .orderBy(desc(sermonSeriesTable.updatedAt));
  res.json(rows);
});

router.post("/sermon-series", requireAuth, requireActiveAccess, async (req, res) => {
  const parsed = CreateSermonSeriesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const [row] = await db
    .insert(sermonSeriesTable)
    .values({
      userId: req.userId!,
      title: d.title,
      summary: d.summary ?? "",
      bigIdea: d.bigIdea ?? "",
      startDate: d.startDate ?? null,
      endDate: d.endDate ?? null,
      plannedSermonCount: d.plannedSermonCount ?? null,
      status: d.status ?? "planning",
      tags: d.tags ?? [],
    })
    .returning();
  res.status(201).json(row);
});

router.get("/sermon-series/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [series] = await db
    .select()
    .from(sermonSeriesTable)
    .where(
      and(
        eq(sermonSeriesTable.id, id),
        eq(sermonSeriesTable.userId, req.userId!),
      ),
    )
    .limit(1);
  if (!series) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Ordered list of sermons in this series — by seriesOrder when present,
  // then by sermonDate, then by createdAt as a stable fallback.
  const sermons = await db
    .select()
    .from(sermonsTable)
    .where(
      and(
        eq(sermonsTable.userId, req.userId!),
        eq(sermonsTable.seriesId, id),
      ),
    )
    .orderBy(
      asc(sermonsTable.seriesOrder),
      asc(sermonsTable.sermonDate),
      asc(sermonsTable.createdAt),
    );
  res.json({ ...series, sermons });
});

router.patch("/sermon-series/:id", requireAuth, requireActiveAccess, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const parsed = UpdateSermonSeriesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const update: Record<string, unknown> = {};
  for (const k of [
    "title",
    "summary",
    "bigIdea",
    "startDate",
    "endDate",
    "plannedSermonCount",
    "status",
    "tags",
  ] as const) {
    if (d[k] !== undefined) update[k] = d[k];
  }
  if (Object.keys(update).length === 0) {
    const [row] = await db
      .select()
      .from(sermonSeriesTable)
      .where(
        and(
          eq(sermonSeriesTable.id, id),
          eq(sermonSeriesTable.userId, req.userId!),
        ),
      )
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
    return;
  }
  const [row] = await db
    .update(sermonSeriesTable)
    .set(update)
    .where(
      and(
        eq(sermonSeriesTable.id, id),
        eq(sermonSeriesTable.userId, req.userId!),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

router.delete("/sermon-series/:id", requireAuth, requireActiveAccess, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Unlink any sermons that referenced this series so we don't leave dangling
  // foreign references on the sermons.seriesId column.
  await db
    .update(sermonsTable)
    .set({ seriesId: null, seriesOrder: null })
    .where(
      and(
        eq(sermonsTable.userId, req.userId!),
        eq(sermonsTable.seriesId, id),
      ),
    );
  const result = await db
    .delete(sermonSeriesTable)
    .where(
      and(
        eq(sermonSeriesTable.id, id),
        eq(sermonSeriesTable.userId, req.userId!),
      ),
    )
    .returning();
  if (result.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).end();
});

export default router;
