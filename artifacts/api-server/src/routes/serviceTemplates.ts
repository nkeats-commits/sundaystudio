import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, serviceTemplatesTable } from "@workspace/db";
import {
  CreateServiceTemplateBody,
  UpdateServiceTemplateBody,
  UpdateServiceTemplateParams,
  DeleteServiceTemplateParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireActiveAccess } from "../middlewares/requireActiveAccess";

const router: IRouter = Router();

router.get("/service-templates", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(serviceTemplatesTable)
    .where(eq(serviceTemplatesTable.userId, req.userId!))
    .orderBy(desc(serviceTemplatesTable.updatedAt));
  res.json(rows);
});

router.post("/service-templates", requireAuth, requireActiveAccess, async (req, res) => {
  const parsed = CreateServiceTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "Name cannot be empty" });
    return;
  }
  // Reject duplicate names per user (case-insensitive) so the picker
  // doesn't end up with two visually identical entries.
  const [dup] = await db
    .select({ id: serviceTemplatesTable.id })
    .from(serviceTemplatesTable)
    .where(
      and(
        eq(serviceTemplatesTable.userId, req.userId!),
        sql`lower(${serviceTemplatesTable.name}) = lower(${name})`,
      ),
    )
    .limit(1);
  if (dup) {
    res
      .status(409)
      .json({ error: "You already have a service flow with that name" });
    return;
  }
  try {
    const [row] = await db
      .insert(serviceTemplatesTable)
      .values({
        userId: req.userId!,
        name,
        description: parsed.data.description?.trim() ?? "",
        flow: parsed.data.flow,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    // Catch the DB-level unique-index race that the app-level check
    // above can't prevent under concurrent inserts.
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      res
        .status(409)
        .json({ error: "You already have a service flow with that name" });
      return;
    }
    req.log.error({ err }, "failed to create service template");
    res.status(500).json({ error: "Failed to save service flow" });
  }
});

router.patch("/service-templates/:id", requireAuth, requireActiveAccess, async (req, res) => {
  const params = UpdateServiceTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const parsed = UpdateServiceTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Partial<{
    name: string;
    description: string;
    flow: typeof serviceTemplatesTable.$inferInsert.flow;
  }> = {};
  if (parsed.data.name !== undefined) {
    const trimmed = parsed.data.name.trim();
    if (!trimmed) {
      res.status(400).json({ error: "Name cannot be empty" });
      return;
    }
    // Block renaming onto another saved template's name.
    const [dup] = await db
      .select({ id: serviceTemplatesTable.id })
      .from(serviceTemplatesTable)
      .where(
        and(
          eq(serviceTemplatesTable.userId, req.userId!),
          sql`lower(${serviceTemplatesTable.name}) = lower(${trimmed})`,
        ),
      )
      .limit(1);
    if (dup && dup.id !== params.data.id) {
      res
        .status(409)
        .json({ error: "You already have a service flow with that name" });
      return;
    }
    updates.name = trimmed;
  }
  if (parsed.data.description !== undefined) {
    updates.description = parsed.data.description.trim();
  }
  if (parsed.data.flow !== undefined) {
    updates.flow = parsed.data.flow;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  try {
    const [row] = await db
      .update(serviceTemplatesTable)
      .set(updates)
      .where(
        and(
          eq(serviceTemplatesTable.id, params.data.id),
          eq(serviceTemplatesTable.userId, req.userId!),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    // Mirror POST: catch the unique-index race during concurrent renames.
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      res
        .status(409)
        .json({ error: "You already have a service flow with that name" });
      return;
    }
    req.log.error({ err }, "failed to update service template");
    res.status(500).json({ error: "Failed to update service flow" });
  }
});

router.delete("/service-templates/:id", requireAuth, requireActiveAccess, async (req, res) => {
  const params = DeleteServiceTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const result = await db
    .delete(serviceTemplatesTable)
    .where(
      and(
        eq(serviceTemplatesTable.id, params.data.id),
        eq(serviceTemplatesTable.userId, req.userId!),
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
