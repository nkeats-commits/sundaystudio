import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, libraryItemsTable, servicePlansTable } from "@workspace/db";
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

/**
 * Reverse lookup: which service plans pull this library item into one of
 * their slots? Scans `content.order` for elements whose linkedKind/linkedId
 * point back to this library item.
 */
router.get("/library/:id/linked-services", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const needle = JSON.stringify([{ linkedKind: "library_item", linkedId: id }]);
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
