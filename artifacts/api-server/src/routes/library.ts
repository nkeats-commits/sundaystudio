import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, libraryItemsTable, servicePlansTable } from "@workspace/db";
import {
  CreateLibraryItemBody,
  ListLibraryItemsQueryParams,
  SetLibraryItemRepertoireBody,
  BulkImportRepertoireBody,
  BulkDeleteLibraryItemsBody,
  BulkSetLibraryItemRepertoireBody,
  UpdateLibraryItemBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireActiveAccess } from "../middlewares/requireActiveAccess";
import { normalizeTitle } from "../lib/repertoire";
import { recordBpmFromContent } from "../lib/crowdsourceBpm";
import { lyricsExcerpt } from "../lib/songFieldParsers";

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

router.post("/library", requireAuth, requireActiveAccess, async (req, res) => {
  const parsed = CreateLibraryItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  // For songs: compute a lyric excerpt from the pasted lyrics so the AI
  // has a concise passage to work with in prompt context.
  let contentWithExcerpt = data.content as Record<string, unknown>;
  if (data.kind === "song") {
    const rawLyrics = (contentWithExcerpt as Record<string, unknown>).lyrics;
    if (typeof rawLyrics === "string" && rawLyrics.trim()) {
      contentWithExcerpt = {
        ...contentWithExcerpt,
        lyricsExcerpt: lyricsExcerpt(rawLyrics),
      };
    }
  }
  const [row] = await db
    .insert(libraryItemsTable)
    .values({
      userId: req.userId!,
      kind: data.kind,
      title: data.title,
      content: contentWithExcerpt,
      tags: data.tags ?? [],
      // Only songs can be in the repertoire — silently drop the flag for any
      // other kind so we don't leak it through the UI later.
      isRepertoire: data.kind === "song" ? data.isRepertoire ?? false : false,
    })
    .returning();
  // Crowdsource: every saved song with an explicit BPM contributes one
  // anonymous data point. Best-effort; failures are logged inside.
  if (data.kind === "song") {
    void recordBpmFromContent(data.title, data.content);
  }
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
router.patch("/library/:id/repertoire", requireAuth, requireActiveAccess, async (req, res) => {
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
 * Bulk-delete many library items in one shot. Every supplied ID is validated
 * against the caller's userId so a user can never delete another user's data.
 */
router.delete("/library/bulk", requireAuth, requireActiveAccess, async (req, res) => {
  const parsed = BulkDeleteLibraryItemsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { ids } = parsed.data;
  const result = await db
    .delete(libraryItemsTable)
    .where(
      and(
        eq(libraryItemsTable.userId, req.userId!),
        inArray(libraryItemsTable.id, ids),
      ),
    )
    .returning({ id: libraryItemsTable.id });
  res.json({ affected: result.length });
});

/**
 * Bulk-update isRepertoire on many library items at once. Only affects songs
 * (the repertoire concept applies only to songs) that belong to the caller.
 */
router.patch("/library/bulk-repertoire", requireAuth, requireActiveAccess, async (req, res) => {
  const parsed = BulkSetLibraryItemRepertoireBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { ids, isRepertoire } = parsed.data;
  const result = await db
    .update(libraryItemsTable)
    .set({ isRepertoire })
    .where(
      and(
        eq(libraryItemsTable.userId, req.userId!),
        eq(libraryItemsTable.kind, "song"),
        inArray(libraryItemsTable.id, ids),
      ),
    )
    .returning({ id: libraryItemsTable.id });
  res.json({ affected: result.length });
});

/**
 * Bulk-add many songs to the user's repertoire from a parsed list. Skips any
 * title that case-insensitively matches a song already in the user's
 * repertoire; also skips entries with a missing/empty title. Returns a
 * summary the UI can surface as a toast.
 */
router.post("/library/repertoire/bulk-import", requireAuth, requireActiveAccess, async (req, res) => {
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
    if (typeof song.bpm === "number" && Number.isFinite(song.bpm)) {
      content.bpm = Math.round(song.bpm);
    }
    // Optional CSV-import-only fields. All flow into the open jsonb `content`
    // column; no DB migration needed. Trim & drop empties so we don't store
    // whitespace junk that would later look like real data.
    if (song.key?.trim()) content.key = song.key.trim();
    if (song.ccli?.trim()) content.ccli = song.ccli.trim();
    if (song.notes?.trim()) content.notes = song.notes.trim();
    if (song.arrangementNotes?.trim())
      content.arrangementNotes = song.arrangementNotes.trim();
    if (song.lastScheduledDate?.trim())
      content.lastScheduledDate = song.lastScheduledDate.trim();
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
    // Bulk import: every row with a typed BPM contributes a sample.
    for (const v of valuesToInsert) {
      void recordBpmFromContent(v.title, v.content);
    }
  }

  res.json({ added, skippedDuplicates, invalidLines });
});

/**
 * Edit a saved library item in place. Accepts any subset of title, content,
 * and tags so the detail modal can persist quick fixes without re-creating
 * the row. Returns the updated row so the client can swap it into its cache.
 */
router.patch("/library/:id", requireAuth, requireActiveAccess, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const parsed = UpdateLibraryItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Partial<{
    title: string;
    content: Record<string, unknown>;
    tags: string[];
  }> = {};
  if (parsed.data.title !== undefined) {
    // Trim server-side so API callers outside the UI can't store
    // whitespace-only or padded titles.
    const trimmed = parsed.data.title.trim();
    if (!trimmed) {
      res.status(400).json({ error: "Title cannot be empty" });
      return;
    }
    updates.title = trimmed;
  }
  if (parsed.data.content !== undefined) {
    const incoming = parsed.data.content as Record<string, unknown>;
    // Re-derive the lyric excerpt whenever lyrics are present; clear it when
    // the user has removed lyrics from the content blob.
    const rawLyrics = incoming.lyrics;
    if (typeof rawLyrics === "string" && rawLyrics.trim()) {
      incoming.lyricsExcerpt = lyricsExcerpt(rawLyrics);
    } else {
      delete incoming.lyricsExcerpt;
    }
    updates.content = incoming;
  }
  if (parsed.data.tags !== undefined) updates.tags = parsed.data.tags;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  const [row] = await db
    .update(libraryItemsTable)
    .set(updates)
    .where(
      and(
        eq(libraryItemsTable.id, id),
        eq(libraryItemsTable.userId, req.userId!),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Edits to a song's content are also user-vouched data points for the
  // crowdsource pool. Skips itself silently when no BPM is present.
  if (row.kind === "song") {
    void recordBpmFromContent(row.title, row.content);
  }
  res.json(row);
});

router.delete("/library/:id", requireAuth, requireActiveAccess, async (req, res) => {
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
