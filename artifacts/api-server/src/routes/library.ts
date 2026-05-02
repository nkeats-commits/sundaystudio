import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, libraryItemsTable } from "@workspace/db";
import { CreateLibraryItemBody, ListLibraryItemsQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/library", requireAuth, async (req, res) => {
  const params = ListLibraryItemsQueryParams.safeParse(req.query);
  const kind = params.success ? params.data.kind : undefined;
  const where = kind
    ? and(
        eq(libraryItemsTable.userId, req.userId!),
        eq(libraryItemsTable.kind, kind),
      )
    : eq(libraryItemsTable.userId, req.userId!);
  const rows = await db
    .select()
    .from(libraryItemsTable)
    .where(where)
    .orderBy(desc(libraryItemsTable.createdAt));
  res.json(rows);
});

router.post("/library", requireAuth, async (req, res) => {
  const parsed = CreateLibraryItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const [row] = await db
    .insert(libraryItemsTable)
    .values({
      userId: req.userId!,
      kind: data.kind,
      title: data.title,
      content: data.content,
      tags: data.tags ?? [],
    })
    .returning();
  res.status(201).json(row);
});

router.delete("/library/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const result = await db
    .delete(libraryItemsTable)
    .where(
      and(eq(libraryItemsTable.id, id), eq(libraryItemsTable.userId, req.userId!)),
    )
    .returning();
  if (result.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).end();
});

export default router;
