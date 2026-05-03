import { Router, type IRouter, type Request, type Response } from "express";
import { and, count, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  usersTable,
  servicePlansTable,
  sermonsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireOwner, getOwnerEmail } from "../middlewares/requireOwner";
import {
  getUncachableStripeClient,
  isStripeConfigured,
} from "../lib/stripeClient";
import { getAccessState, TRIAL_DAYS } from "../lib/getAccessState";

const router: IRouter = Router();

const MONTHLY_AMOUNT_CENTS = 999;
const COMP_COUPON_LOOKUP = "worshipflow_owner_comp";

// Runtime input schemas — every admin endpoint validates params/query/body
// through these before touching the DB. Failures return 400 with details
// so the UI (and curl probes) get an actionable message.
const userIdParam = z.object({ id: z.string().min(1).max(128) });
const usersListQuery = z.object({
  search: z.string().max(200).optional(),
  status: z
    .enum(["trial", "subscribed", "past_due", "canceled", "expired"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
});
const extendTrialBody = z.object({
  days: z.coerce.number().int().min(1).max(365),
});

function badRequest(res: Response, err: z.ZodError): void {
  res.status(400).json({
    error: "Invalid request",
    details: err.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })),
  });
}

function parseUserIdParam(
  req: Request,
  res: Response,
): string | null {
  const parsed = userIdParam.safeParse(req.params);
  if (!parsed.success) {
    badRequest(res, parsed.error);
    return null;
  }
  return parsed.data.id;
}

/**
 * GET /admin/me — tiny endpoint that the frontend `useIsOwner` hook calls
 * to decide whether to render the Admin nav. Returns 200 for owners and
 * 404 for everyone else (so non-owners see the same response a missing
 * route would produce).
 */
router.get("/admin/me", requireAuth, requireOwner, (req, res) => {
  res.json({ ownerEmail: getOwnerEmail(), userId: req.userId });
});

/**
 * GET /admin/metrics — overview/dashboard numbers. Reads from `users` and
 * the stripe-replit-sync mirror tables; never writes anything.
 */
router.get("/admin/metrics", requireAuth, requireOwner, async (req, res) => {
  try {
    const now = new Date();
    const ms7d = 7 * 24 * 60 * 60 * 1000;
    const ms30d = 30 * 24 * 60 * 60 * 1000;
    const ms90d = 90 * 24 * 60 * 60 * 1000;
    const sevenAgo = new Date(now.getTime() - ms7d);
    const thirtyAgo = new Date(now.getTime() - ms30d);
    const ninetyAgo = new Date(now.getTime() - ms90d);
    const trialMs = TRIAL_DAYS * 24 * 60 * 60 * 1000;
    const trialEndsSoon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const trialStartCutoff = new Date(now.getTime() - trialMs);
    const trialEndsSoonCutoff = new Date(
      trialEndsSoon.getTime() - trialMs,
    );

    const [{ value: totalUsers = 0 } = {}] = await db
      .select({ value: count() })
      .from(usersTable);
    const [{ value: signups7 = 0 } = {}] = await db
      .select({ value: count() })
      .from(usersTable)
      .where(gte(usersTable.createdAt, sevenAgo));
    const [{ value: signups30 = 0 } = {}] = await db
      .select({ value: count() })
      .from(usersTable)
      .where(gte(usersTable.createdAt, thirtyAgo));

    // Stripe-mirrored subscription counts (best effort — empty if schema missing).
    type CountRow = { count: number | string };
    const subCounts: Record<string, number> = {
      active: 0,
      trialing: 0,
      past_due: 0,
      canceled: 0,
    };
    let mrrCents = 0;
    let conversions30 = 0;
    let conversions90 = 0;
    let churn30 = 0;
    let stripeAvailable = false;

    try {
      const r = await db.execute(sql`
        SELECT status, COUNT(*)::int AS count
        FROM stripe.subscriptions
        GROUP BY status
      `);
      stripeAvailable = true;
      for (const row of r.rows as Array<{ status: string; count: number | string }>) {
        const n = typeof row.count === "string" ? parseInt(row.count, 10) : row.count;
        subCounts[row.status] = n;
      }
      // MRR = active monthly subs * $9.99 (we only sell one price).
      mrrCents = (subCounts["active"] ?? 0) * MONTHLY_AMOUNT_CENTS;

      const conv = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE created >= ${Math.floor(thirtyAgo.getTime() / 1000)})::int AS c30,
          COUNT(*) FILTER (WHERE created >= ${Math.floor(ninetyAgo.getTime() / 1000)})::int AS c90
        FROM stripe.subscriptions
        WHERE status IN ('active', 'trialing')
      `);
      const cRow = conv.rows[0] as { c30?: number | string; c90?: number | string };
      conversions30 = Number(cRow?.c30 ?? 0);
      conversions90 = Number(cRow?.c90 ?? 0);

      const churn = await db.execute(sql`
        SELECT COUNT(*)::int AS c
        FROM stripe.subscriptions
        WHERE status = 'canceled'
          AND COALESCE(canceled_at, ended_at, created) >= ${Math.floor(thirtyAgo.getTime() / 1000)}
      `);
      churn30 = Number((churn.rows[0] as CountRow | undefined)?.count ?? 0);
    } catch {
      stripeAvailable = false;
    }

    // Trial buckets — derived from local users table.
    // A user is "on trial" if they have no Stripe customer yet (or their sub
    // isn't active/trialing) AND trial_started_at is within the trial window.
    const [{ value: activeTrials = 0 } = {}] = await db
      .select({ value: count() })
      .from(usersTable)
      .where(
        and(
          gte(usersTable.trialStartedAt, trialStartCutoff),
          sql`${usersTable.stripeCustomerId} IS NULL`,
        ),
      );
    const [{ value: trialsEndingSoon = 0 } = {}] = await db
      .select({ value: count() })
      .from(usersTable)
      .where(
        and(
          gte(usersTable.trialStartedAt, trialStartCutoff),
          sql`${usersTable.trialStartedAt} <= ${trialEndsSoonCutoff}`,
          sql`${usersTable.stripeCustomerId} IS NULL`,
        ),
      );
    const [{ value: expiredTrials = 0 } = {}] = await db
      .select({ value: count() })
      .from(usersTable)
      .where(
        and(
          sql`${usersTable.trialStartedAt} < ${trialStartCutoff}`,
          sql`${usersTable.stripeCustomerId} IS NULL`,
        ),
      );

    // 30-day signup series — one bucket per day, oldest first.
    const signupSeriesRows = await db.execute(sql`
      SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
             COUNT(*)::int AS count
      FROM users
      WHERE created_at >= ${thirtyAgo}
      GROUP BY day
      ORDER BY day ASC
    `);
    const signupSeries = (
      signupSeriesRows.rows as Array<{ day: string | Date; count: number | string }>
    ).map((r) => ({
      day: typeof r.day === "string" ? r.day : r.day.toISOString().slice(0, 10),
      count: Number(r.count),
    }));

    let subSeries: Array<{ day: string; count: number }> = [];
    if (stripeAvailable) {
      try {
        const r = await db.execute(sql`
          SELECT date_trunc('day', to_timestamp(created) AT TIME ZONE 'UTC')::date AS day,
                 COUNT(*)::int AS count
          FROM stripe.subscriptions
          WHERE created >= ${Math.floor(thirtyAgo.getTime() / 1000)}
            AND status IN ('active', 'trialing')
          GROUP BY day
          ORDER BY day ASC
        `);
        subSeries = (
          r.rows as Array<{ day: string | Date; count: number | string }>
        ).map((row) => ({
          day:
            typeof row.day === "string"
              ? row.day
              : row.day.toISOString().slice(0, 10),
          count: Number(row.count),
        }));
      } catch {
        subSeries = [];
      }
    }

    res.json({
      totals: {
        users: Number(totalUsers),
        signups7d: Number(signups7),
        signups30d: Number(signups30),
      },
      trials: {
        active: Number(activeTrials),
        endingSoon: Number(trialsEndingSoon),
        expired: Number(expiredTrials),
      },
      subscriptions: {
        active: subCounts["active"] ?? 0,
        trialing: subCounts["trialing"] ?? 0,
        pastDue: subCounts["past_due"] ?? 0,
        canceled: subCounts["canceled"] ?? 0,
      },
      revenue: {
        mrrCents,
        conversions30d: conversions30,
        conversions90d: conversions90,
        churn30d: churn30,
      },
      series: { signups: signupSeries, subscriptions: subSeries },
      stripeAvailable,
    });
  } catch (err) {
    req.log.error({ err }, "admin metrics failed");
    res.status(500).json({ error: "Failed to load metrics" });
  }
});

/**
 * GET /admin/users — paginated list with optional search and status filter.
 * Status filter ∈ {trial, subscribed, past_due, canceled, expired}.
 */
router.get("/admin/users", requireAuth, requireOwner, async (req, res) => {
  const parsedQuery = usersListQuery.safeParse(req.query);
  if (!parsedQuery.success) {
    badRequest(res, parsedQuery.error);
    return;
  }
  const { limit, offset } = parsedQuery.data;
  const search = (parsedQuery.data.search ?? "").trim();
  const status = parsedQuery.data.status ?? "";
  try {

    const whereParts = [];
    if (search) {
      const pattern = `%${search}%`;
      whereParts.push(
        or(
          ilike(usersTable.email, pattern),
          ilike(usersTable.firstName, pattern),
          ilike(usersTable.lastName, pattern),
        )!,
      );
    }
    const whereClause = whereParts.length > 0 ? and(...whereParts) : undefined;

    const baseRows = await db
      .select()
      .from(usersTable)
      .where(whereClause as ReturnType<typeof and>)
      .orderBy(desc(usersTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ value: total = 0 } = {}] = await db
      .select({ value: count() })
      .from(usersTable)
      .where(whereClause as ReturnType<typeof and>);

    // For each row, compute access state + last activity.
    const items = await Promise.all(
      baseRows.map(async (u) => {
        const state = await getAccessState(u.id);
        const [lastPlan] = await db
          .select({ updatedAt: servicePlansTable.updatedAt })
          .from(servicePlansTable)
          .where(eq(servicePlansTable.userId, u.id))
          .orderBy(desc(servicePlansTable.updatedAt))
          .limit(1);
        const [lastSermon] = await db
          .select({ updatedAt: sermonsTable.updatedAt })
          .from(sermonsTable)
          .where(eq(sermonsTable.userId, u.id))
          .orderBy(desc(sermonsTable.updatedAt))
          .limit(1);
        const lastActivity = [lastPlan?.updatedAt, lastSermon?.updatedAt]
          .filter((d): d is Date => !!d)
          .sort((a, b) => b.getTime() - a.getTime())[0];
        return {
          id: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          createdAt: u.createdAt.toISOString(),
          stripeCustomerId: u.stripeCustomerId,
          state,
          lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
        };
      }),
    );

    const filtered = status
      ? items.filter((it) => {
          switch (status) {
            case "trial":
              return it.state.kind === "trial";
            case "subscribed":
              return (
                it.state.kind === "active" || it.state.kind === "trialing"
              );
            case "past_due":
              return it.state.kind === "past_due";
            case "canceled":
              return it.state.kind === "canceled";
            case "expired":
              return it.state.kind === "expired";
            default:
              return true;
          }
        })
      : items;

    res.json({
      items: filtered,
      total: Number(total),
      limit,
      offset,
    });
  } catch (err) {
    req.log.error({ err }, "admin user list failed");
    res.status(500).json({ error: "Failed to load users" });
  }
});

/**
 * GET /admin/users/:id — single-user detail view. Adds counts and pulls
 * the canonical access state through the same helper user-facing UI uses.
 */
router.get(
  "/admin/users/:id",
  requireAuth,
  requireOwner,
  async (req, res) => {
    const targetId = parseUserIdParam(req, res);
    if (!targetId) return;
    try {
      const [u] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, targetId))
        .limit(1);
      if (!u) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const state = await getAccessState(u.id);
      const [{ value: planCount = 0 } = {}] = await db
        .select({ value: count() })
        .from(servicePlansTable)
        .where(eq(servicePlansTable.userId, u.id));
      const [{ value: sermonCount = 0 } = {}] = await db
        .select({ value: count() })
        .from(sermonsTable)
        .where(eq(sermonsTable.userId, u.id));
      const [lastPlan] = await db
        .select({ updatedAt: servicePlansTable.updatedAt })
        .from(servicePlansTable)
        .where(eq(servicePlansTable.userId, u.id))
        .orderBy(desc(servicePlansTable.updatedAt))
        .limit(1);
      const [lastSermon] = await db
        .select({ updatedAt: sermonsTable.updatedAt })
        .from(sermonsTable)
        .where(eq(sermonsTable.userId, u.id))
        .orderBy(desc(sermonsTable.updatedAt))
        .limit(1);
      const lastActivity = [lastPlan?.updatedAt, lastSermon?.updatedAt]
        .filter((d): d is Date => !!d)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      res.json({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        imageUrl: u.imageUrl,
        createdAt: u.createdAt.toISOString(),
        trialStartedAt: u.trialStartedAt
          ? u.trialStartedAt.toISOString()
          : null,
        stripeCustomerId: u.stripeCustomerId,
        state,
        counts: {
          servicePlans: Number(planCount),
          sermons: Number(sermonCount),
        },
        lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
      });
    } catch (err) {
      req.log.error({ err }, "admin user detail failed");
      res.status(500).json({ error: "Failed to load user" });
    }
  },
);

/**
 * POST /admin/users/:id/extend-trial — bump `trial_started_at` forward so
 * the target gains `days` more days of trial. Idempotent in the sense that
 * calling it twice with the same `days` adds twice as much.
 */
router.post(
  "/admin/users/:id/extend-trial",
  requireAuth,
  requireOwner,
  async (req, res) => {
    const targetId = parseUserIdParam(req, res);
    if (!targetId) return;
    const parsedBody = extendTrialBody.safeParse(req.body);
    if (!parsedBody.success) {
      badRequest(res, parsedBody.error);
      return;
    }
    const { days } = parsedBody.data;
    try {
      const [u] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, targetId))
        .limit(1);
      if (!u) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      // Push the trial-start anchor backward so trial_end = anchor + 14d
      // moves forward by `days`. Cap at "now - trialDays" so the trial
      // can never start in the future (which would be confusing).
      const ms = days * 24 * 60 * 60 * 1000;
      const baseAnchor = u.trialStartedAt ?? u.createdAt;
      const newAnchor = new Date(baseAnchor.getTime() + ms);
      const maxAnchor = new Date(Date.now()); // future-anchored is OK; getAccessState handles it.
      const finalAnchor = newAnchor.getTime() > maxAnchor.getTime()
        ? maxAnchor
        : newAnchor;
      await db
        .update(usersTable)
        .set({ trialStartedAt: finalAnchor })
        .where(eq(usersTable.id, u.id));

      const ownerEmail = getOwnerEmail();
      req.log.info(
        { ownerEmail, targetId: u.id, days },
        "admin extended trial",
      );

      const state = await getAccessState(u.id);
      res.json({ state });
    } catch (err) {
      req.log.error({ err }, "extend-trial failed");
      res.status(500).json({ error: "Failed to extend trial" });
    }
  },
);

/**
 * POST /admin/users/:id/comp-subscription — gives the target an active
 * subscription on the house. Creates the Stripe customer if missing,
 * then creates a Stripe subscription with a 100%-off forever coupon
 * (created on demand, identified by lookup_key for idempotency).
 */
router.post(
  "/admin/users/:id/comp-subscription",
  requireAuth,
  requireOwner,
  async (req, res) => {
    const targetId = parseUserIdParam(req, res);
    if (!targetId) return;
    if (!(await isStripeConfigured())) {
      res
        .status(503)
        .json({ error: "Stripe is not configured on this server." });
      return;
    }
    try {
      const [u] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, targetId))
        .limit(1);
      if (!u) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Resolve the price id we sell. Reuse billing.ts's strategy: env
      // var → mirrored stripe.prices. We don't read the file here to keep
      // this route self-contained and safe in tests.
      const fromEnv = process.env["STRIPE_PRICE_ID"]?.trim();
      let priceId: string | null = fromEnv && fromEnv.length > 0 ? fromEnv : null;
      if (!priceId) {
        const r = await db.execute(sql`
          SELECT pr.id AS price_id
          FROM stripe.prices pr
          JOIN stripe.products p ON p.id = pr.product
          WHERE p.active = true AND pr.active = true
            AND pr.recurring->>'interval' = 'month'
          ORDER BY pr.created DESC
          LIMIT 1
        `);
        priceId = (r.rows[0] as { price_id?: string } | undefined)?.price_id ?? null;
      }
      if (!priceId) {
        res
          .status(503)
          .json({
            error:
              "Subscription plan not provisioned. Run the billing seed script first.",
          });
        return;
      }

      const stripe = await getUncachableStripeClient();

      // Customer.
      let customerId = u.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: u.email ?? undefined,
          name:
            [u.firstName, u.lastName].filter(Boolean).join(" ") || undefined,
          metadata: { userId: u.id, comped: "true" },
        });
        customerId = customer.id;
        await db
          .update(usersTable)
          .set({ stripeCustomerId: customerId })
          .where(eq(usersTable.id, u.id));
      }

      // Reusable 100%-off forever coupon. Look up by lookup_key to avoid
      // creating a new one every call.
      const existing = await stripe.coupons.list({ limit: 100 });
      let coupon = existing.data.find(
        (c) =>
          c.metadata?.["lookup_key"] === COMP_COUPON_LOOKUP &&
          c.percent_off === 100 &&
          c.duration === "forever",
      );
      if (!coupon) {
        coupon = await stripe.coupons.create({
          name: "WorshipFlow Owner Comp",
          percent_off: 100,
          duration: "forever",
          metadata: { lookup_key: COMP_COUPON_LOOKUP },
        });
      }

      // Create the subscription. Use payment_behavior=allow_incomplete so
      // Stripe doesn't require a payment method up front for a $0 sub.
      await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        discounts: [{ coupon: coupon.id }],
        payment_behavior: "allow_incomplete",
        metadata: { comped_by: getOwnerEmail() ?? "owner", userId: u.id },
      });

      const ownerEmail = getOwnerEmail();
      req.log.info(
        { ownerEmail, targetId: u.id },
        "admin comped subscription",
      );

      // The webhook syncs new subs into stripe.subscriptions; getAccessState
      // will pick it up shortly. Return the current best-known state.
      const state = await getAccessState(u.id);
      res.json({ state, couponId: coupon.id });
    } catch (err) {
      req.log.error({ err }, "comp-subscription failed");
      res.status(500).json({ error: "Failed to comp subscription" });
    }
  },
);

/**
 * DELETE /admin/users/:id — best-effort: cancel any active Stripe sub,
 * then hard-delete the user's content rows and the user row.
 *
 * We don't have FK cascades configured on every dependent table, so this
 * deletes the most important user-owned rows explicitly.
 */
router.delete(
  "/admin/users/:id",
  requireAuth,
  requireOwner,
  async (req, res) => {
    const targetId = parseUserIdParam(req, res);
    if (!targetId) return;
    // Don't let the owner accidentally delete themselves.
    if (targetId === req.userId) {
      res.status(400).json({ error: "You cannot delete your own account." });
      return;
    }
    try {
      const [u] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, targetId))
        .limit(1);
      if (!u) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Best-effort cancel of any active Stripe subscription.
      if (u.stripeCustomerId && (await isStripeConfigured())) {
        try {
          const stripe = await getUncachableStripeClient();
          const subs = await stripe.subscriptions.list({
            customer: u.stripeCustomerId,
            status: "all",
            limit: 100,
          });
          for (const s of subs.data) {
            if (s.status !== "canceled" && s.status !== "incomplete_expired") {
              await stripe.subscriptions.cancel(s.id);
            }
          }
        } catch (err) {
          req.log.warn(
            { err, userId: u.id },
            "best-effort stripe cancel failed during admin delete",
          );
        }
      }

      // Delete dependent rows (no cascades configured at DB level). We use
      // raw SQL for tables we don't import here to keep this file lean.
      await db.execute(sql`DELETE FROM service_plans WHERE user_id = ${u.id}`);
      await db.execute(sql`DELETE FROM sermons WHERE user_id = ${u.id}`);
      await db.execute(sql`DELETE FROM sermon_resources WHERE user_id = ${u.id}`);
      await db.execute(sql`DELETE FROM sermon_exports WHERE user_id = ${u.id}`);
      await db.execute(sql`DELETE FROM sermon_series WHERE user_id = ${u.id}`);
      await db.execute(sql`DELETE FROM library_items WHERE user_id = ${u.id}`);
      await db.execute(sql`DELETE FROM service_templates WHERE user_id = ${u.id}`);
      await db.execute(sql`DELETE FROM church_profiles WHERE user_id = ${u.id}`);
      await db.execute(sql`DELETE FROM pcs_connections WHERE user_id = ${u.id}`);
      await db.execute(sql`DELETE FROM external_song_links WHERE user_id = ${u.id}`);
      await db.delete(usersTable).where(eq(usersTable.id, u.id));

      const ownerEmail = getOwnerEmail();
      req.log.info(
        { ownerEmail, targetId: u.id },
        "admin deleted user",
      );

      res.status(204).end();
    } catch (err) {
      req.log.error({ err }, "admin delete user failed");
      res.status(500).json({ error: "Failed to delete user" });
    }
  },
);

export default router;
