import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, servicePlansTable, usersTable } from "@workspace/db";
import {
  CreateServicePlanBody,
  UpdateServicePlanBody,
  UpdateServicePlanParams,
  ExportServicePlanBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireActiveAccess } from "../middlewares/requireActiveAccess";
import {
  renderServicePlanAsMarkdown,
  renderServicePlanAsText,
} from "../lib/servicePlanExport";
import { trackEvent } from "../lib/emailClient";
import { EVENTS } from "../lib/eventRegistry";

const router: IRouter = Router();

router.get("/service-plans", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(servicePlansTable)
    .where(eq(servicePlansTable.userId, req.userId!))
    .orderBy(desc(servicePlansTable.updatedAt));
  res.json(rows);
});

router.post("/service-plans", requireAuth, requireActiveAccess, async (req, res) => {
  const parsed = CreateServicePlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const [row] = await db
    .insert(servicePlansTable)
    .values({
      userId: req.userId!,
      title: data.title,
      scripture: data.scripture ?? "",
      theme: data.theme ?? "",
      season: data.season ?? "",
      serviceDate: data.serviceDate ?? null,
      content: data.content,
    })
    .returning();
  res.status(201).json(row);

  // Fire first_service_plan_saved once per user — best-effort, never blocks.
  void (async () => {
    try {
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, req.userId!))
        .limit(1);
      if (user && !user.firstServicePlanEventFiredAt) {
        await db
          .update(usersTable)
          .set({ firstServicePlanEventFiredAt: new Date() })
          .where(eq(usersTable.id, req.userId!));
        await trackEvent(EVENTS.FIRST_SERVICE_PLAN_SAVED, user.id, user.email);
      }
    } catch (err) {
      void err;
    }
  })();
});

router.get("/service-plans/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [row] = await db
    .select()
    .from(servicePlansTable)
    .where(
      and(eq(servicePlansTable.id, id), eq(servicePlansTable.userId, req.userId!)),
    )
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

router.put("/service-plans/:id", requireAuth, requireActiveAccess, async (req, res) => {
  const params = UpdateServicePlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const parsed = UpdateServicePlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = params.data.id;
  const data = parsed.data;
  const update: Record<string, unknown> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.scripture !== undefined) update.scripture = data.scripture;
  if (data.theme !== undefined) update.theme = data.theme;
  if (data.season !== undefined) update.season = data.season;
  if (data.serviceDate !== undefined) update.serviceDate = data.serviceDate;
  if (data.content !== undefined) update.content = data.content;

  const [row] = await db
    .update(servicePlansTable)
    .set(update)
    .where(
      and(eq(servicePlansTable.id, id), eq(servicePlansTable.userId, req.userId!)),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

router.post("/service-plans/:id/export", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const parsed = ExportServicePlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [plan] = await db
    .select()
    .from(servicePlansTable)
    .where(
      and(eq(servicePlansTable.id, id), eq(servicePlansTable.userId, req.userId!)),
    )
    .limit(1);
  if (!plan) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const content =
    parsed.data.format === "text"
      ? renderServicePlanAsText(plan)
      : renderServicePlanAsMarkdown(plan);
  res.json({ servicePlanId: id, format: parsed.data.format, content });

  // Fire service_plan_exported on every export — best-effort, never blocks.
  void (async () => {
    try {
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, req.userId!))
        .limit(1);
      if (user) {
        await trackEvent(EVENTS.SERVICE_PLAN_EXPORTED, user.id, user.email, {
          servicePlanId: id,
          format: parsed.data.format,
        });
      }
    } catch (err) {
      void err;
    }
  })();
});

router.delete("/service-plans/:id", requireAuth, requireActiveAccess, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const result = await db
    .delete(servicePlansTable)
    .where(
      and(eq(servicePlansTable.id, id), eq(servicePlansTable.userId, req.userId!)),
    )
    .returning();
  if (result.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).end();
});

export default router;
