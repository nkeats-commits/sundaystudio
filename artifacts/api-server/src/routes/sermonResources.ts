import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, sermonResourcesTable } from "@workspace/db";
import {
  CreateSermonResourceBody,
  UpdateSermonResourceBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireActiveAccess } from "../middlewares/requireActiveAccess";

const router: IRouter = Router();

router.get("/sermon-resources", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(sermonResourcesTable)
    .where(eq(sermonResourcesTable.userId, req.userId!))
    .orderBy(desc(sermonResourcesTable.updatedAt));
  res.json(rows);
});

router.post("/sermon-resources", requireAuth, requireActiveAccess, async (req, res) => {
  const parsed = CreateSermonResourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const [row] = await db
    .insert(sermonResourcesTable)
    .values({
      userId: req.userId!,
      resourceType: d.resourceType ?? "note",
      title: d.title,
      author: d.author ?? "",
      publisher: d.publisher ?? "",
      year: d.year ?? "",
      pageOrLocation: d.pageOrLocation ?? "",
      url: d.url ?? "",
      excerpt: d.excerpt ?? "",
      summary: d.summary ?? "",
      notes: d.notes ?? "",
      relatedPassage: d.relatedPassage ?? "",
      tags: d.tags ?? [],
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/sermon-resources/:id", requireAuth, requireActiveAccess, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const parsed = UpdateSermonResourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const update: Record<string, unknown> = {};
  for (const k of [
    "resourceType",
    "title",
    "author",
    "publisher",
    "year",
    "pageOrLocation",
    "url",
    "excerpt",
    "summary",
    "notes",
    "relatedPassage",
    "tags",
  ] as const) {
    if (d[k] !== undefined) update[k] = d[k];
  }
  if (Object.keys(update).length === 0) {
    const [row] = await db
      .select()
      .from(sermonResourcesTable)
      .where(
        and(
          eq(sermonResourcesTable.id, id),
          eq(sermonResourcesTable.userId, req.userId!),
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
    .update(sermonResourcesTable)
    .set(update)
    .where(
      and(
        eq(sermonResourcesTable.id, id),
        eq(sermonResourcesTable.userId, req.userId!),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

router.delete("/sermon-resources/:id", requireAuth, requireActiveAccess, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const result = await db
    .delete(sermonResourcesTable)
    .where(
      and(
        eq(sermonResourcesTable.id, id),
        eq(sermonResourcesTable.userId, req.userId!),
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
