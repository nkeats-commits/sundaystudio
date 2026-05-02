import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, libraryItemsTable, servicePlansTable } from "@workspace/db";
import {
  CreateLibraryItemBody,
  ListLibraryItemsQueryParams,
  SetLibraryItemRepertoireBody,
  BulkImportRepertoireBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { normalizeTitle } from "../lib/repertoire";

const router: IRouter = Router();

router.get("/library", requireAuth, async (req, res) => {
  const params = ListLibraryItemsQueryParams.safeParse(req.query);
  const kind = params.success ? params.data.kind : undefined;
  const repertoireOnly = params.success ? params.data.repertoire : undefined;

  const conditions = [eq(libraryItemsTable.userId, req.userId!)];
  if (kind) conditions.push(eq(libraryItemsTable.kind, kind));
  if (repertoireOnly) {
    // Repertoire concept only applies to songs today, so narrow the kind too
    // unless the caller already pinned it.
    if (!kind) conditions.push(eq(libraryItemsTable.kind, "song"));
    conditions.push(eq(libraryItemsTable.isRepertoire, true));
  }

  const rows = await db
    .select()
    .from(libraryItemsTable)
    .where(and(...conditions))
    .orderBy(
      // Repertoire view: alphabetical by title; default view: most recent first.
      repertoireOnly
        ? sql`lower(${libraryItemsTable.title}) asc`
        : desc(libraryItemsTable.createdAt),
    );
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
      // Only songs can be in the repertoire — silently drop the flag for any
      // other kind so we don't leak it through the UI later.
      isRepertoire: data.kind === "song" ? data.isRepertoire ?? false : false,
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

/**
 * Promote / demote a saved song to/from the user's repertoire. Returns the
 * updated row so the client can swap it into its cache without a refetch.
 */
router.patch("/library/:id/repertoire", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const parsed = SetLibraryItemRepertoireBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(libraryItemsTable)
    .set({ isRepertoire: parsed.data.isRepertoire })
    .where(
      and(
        eq(libraryItemsTable.id, id),
        eq(libraryItemsTable.userId, req.userId!),
        // Only songs can move in/out of the repertoire.
        eq(libraryItemsTable.kind, "song"),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

/**
 * Bulk-add many songs to the user's repertoire from a parsed list. Skips any
 * title that case-insensitively matches a song already in the user's
 * repertoire; also skips entries with a missing/empty title. Returns a
 * summary the UI can surface as a toast.
 */
router.post("/library/repertoire/bulk-import", requireAuth, async (req, res) => {
  const parsed = BulkImportRepertoireBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Pull existing repertoire titles once so we can dedupe in-memory.
  const existing = await db
    .select({ title: libraryItemsTable.title })
    .from(libraryItemsTable)
    .where(
      and(
        eq(libraryItemsTable.userId, req.userId!),
        eq(libraryItemsTable.kind, "song"),
        eq(libraryItemsTable.isRepertoire, true),
      ),
    );
  const seen = new Set(existing.map((r) => normalizeTitle(r.title)));

  let added = 0;
  let skippedDuplicates = 0;
  let invalidLines = 0;
  const valuesToInsert: {
    userId: string;
    kind: string;
    title: string;
    content: Record<string, unknown>;
    tags: string[];
    isRepertoire: boolean;
  }[] = [];

  for (const song of parsed.data.songs) {
    const title = song.title?.trim() ?? "";
    if (!title) {
      invalidLines += 1;
      continue;
    }
    const key = normalizeTitle(title);
    if (seen.has(key)) {
      skippedDuplicates += 1;
      continue;
    }
    seen.add(key);
    const content: Record<string, unknown> = {};
    if (song.artist?.trim()) content.artist = song.artist.trim();
    if (song.style?.trim()) content.style = song.style.trim();
    valuesToInsert.push({
      userId: req.userId!,
      kind: "song",
      title,
      content,
      tags: song.tags ?? [],
      isRepertoire: true,
    });
  }

  if (valuesToInsert.length > 0) {
    const inserted = await db
      .insert(libraryItemsTable)
      .values(valuesToInsert)
      .returning({ id: libraryItemsTable.id });
    added = inserted.length;
  }

  res.json({ added, skippedDuplicates, invalidLines });
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
