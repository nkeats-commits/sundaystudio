import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, sermonsTable, sermonExportsTable } from "@workspace/db";
import {
  CreateSermonBody,
  UpdateSermonBody,
  ExportSermonBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import {
  renderSermonAsMarkdown,
  renderSermonAsText,
} from "../lib/sermonExport";

const router: IRouter = Router();

router.get("/sermons", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(sermonsTable)
    .where(eq(sermonsTable.userId, req.userId!))
    .orderBy(desc(sermonsTable.updatedAt));
  res.json(rows);
});

router.post("/sermons", requireAuth, async (req, res) => {
  const parsed = CreateSermonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
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

router.patch("/sermons/:id", requireAuth, async (req, res) => {
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
  const update: Record<string, unknown> = {};
  for (const k of [
    "title",
    "sermonDate",
    "passage",
    "secondaryPassages",
    "theme",
    "series",
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

router.delete("/sermons/:id", requireAuth, async (req, res) => {
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

router.post("/sermons/:id/duplicate", requireAuth, async (req, res) => {
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
