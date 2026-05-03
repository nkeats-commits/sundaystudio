import { Router, type IRouter, type Request, type Response } from "express";
import { count, desc, eq, gte, sql } from "drizzle-orm";
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
import {
  getAccessState,
  type AccessState,
  TRIAL_DAYS,
} from "../lib/getAccessState";
import { getMonthlyPriceId } from "../lib/getMonthlyPriceId";

/**
 * One-shot probe (cached for the process) for whether the
 * `stripe.subscriptions` mirror table exists. We use this to decide
 * which CTE shape to build — the stripe-aware variant joins to the
 * mirror, the fallback derives state from `users` only.
 */
let _stripeSubsCache: { value: boolean; at: number } | null = null;
const STRIPE_PROBE_TTL_MS = 60_000;
async function stripeSubsAvailable(): Promise<boolean> {
  if (_stripeSubsCache && Date.now() - _stripeSubsCache.at < STRIPE_PROBE_TTL_MS) {
    return _stripeSubsCache.value;
  }
  let value = false;
  try {
    await db.execute(sql`SELECT 1 FROM stripe.subscriptions LIMIT 1`);
    value = true;
  } catch {
    value = false;
  }
  _stripeSubsCache = { value, at: Date.now() };
  return value;
}

/**
 * Build the `user_state` CTE that derives every user's canonical access
 * state in pure SQL. Mirrors the logic in `getAccessState` — Stripe sub
 * status takes precedence; otherwise the local 14-day trial window from
 * `trial_started_at` (or `created_at`) decides trial-vs-expired. Used by
 * both the metrics aggregation and the users list so neither truncates.
 *
 * `lastActivityAt` is also pre-joined here so the users list doesn't need
 * an N+1 lookup for service plans / sermons.
 */
function buildUserStateCte(stripeAvailable: boolean) {
  const trialMs = TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const trialInterval = sql.raw(`interval '${TRIAL_DAYS} days'`);
  const subJoin = stripeAvailable
    ? sql`
        latest_sub AS (
          SELECT DISTINCT ON (customer)
            customer, status, current_period_end, cancel_at_period_end,
            created
          FROM stripe.subscriptions
          WHERE customer IS NOT NULL
          ORDER BY customer, created DESC
        ),`
    : sql``;
  const subSelect = stripeAvailable
    ? sql`s.status AS sub_status,
           s.current_period_end AS sub_current_period_end,
           s.cancel_at_period_end AS sub_cancel_at_period_end,`
    : sql`NULL::text AS sub_status,
           NULL::bigint AS sub_current_period_end,
           NULL::boolean AS sub_cancel_at_period_end,`;
  const subFrom = stripeAvailable
    ? sql`LEFT JOIN latest_sub s ON s.customer = u.stripe_customer_id`
    : sql``;
  // Mirrors getAccessState exactly:
  //   - any present sub row decides the state (unknown statuses → past_due,
  //     matching the conservative "no access" fallback)
  //   - no sub row → trial vs expired by the local 14-day window
  const stateCase = stripeAvailable
    ? sql`CASE
            WHEN s.status IS NULL THEN
              CASE WHEN COALESCE(u.trial_started_at, u.created_at) + ${trialInterval} > NOW()
                   THEN 'trial' ELSE 'expired' END
            WHEN s.status = 'active' THEN 'active'
            WHEN s.status = 'trialing' THEN 'trialing'
            WHEN s.status IN ('past_due','unpaid','incomplete','paused') THEN 'past_due'
            WHEN s.status IN ('canceled','incomplete_expired') THEN 'canceled'
            ELSE 'past_due'
          END`
    : sql`CASE
            WHEN COALESCE(u.trial_started_at, u.created_at) + ${trialInterval} > NOW()
              THEN 'trial'
            ELSE 'expired'
          END`;
  return {
    cte: sql`
      WITH ${subJoin}
      last_plan AS (
        SELECT user_id, MAX(updated_at) AS updated_at
        FROM service_plans
        GROUP BY user_id
      ),
      last_sermon AS (
        SELECT user_id, MAX(updated_at) AS updated_at
        FROM sermons
        GROUP BY user_id
      ),
      user_state AS (
        SELECT
          u.id, u.email, u.first_name, u.last_name, u.image_url,
          u.created_at, u.trial_started_at, u.stripe_customer_id,
          ${subSelect}
          -- GREATEST(NULL, x) returns NULL in Postgres, so fall back to
          -- the lone non-null side when only one of plans/sermons exists.
          CASE
            WHEN lp.updated_at IS NULL AND ls.updated_at IS NULL THEN NULL
            WHEN lp.updated_at IS NULL THEN ls.updated_at
            WHEN ls.updated_at IS NULL THEN lp.updated_at
            ELSE GREATEST(lp.updated_at, ls.updated_at)
          END AS last_activity_at,
          ${stateCase} AS state_kind
        FROM users u
        ${subFrom}
        LEFT JOIN last_plan lp ON lp.user_id = u.id
        LEFT JOIN last_sermon ls ON ls.user_id = u.id
      )`,
    trialMs,
  };
}

/** Map a row from `user_state` back into the AccessState union. */
function rowToAccessState(row: {
  state_kind: string;
  trial_started_at: Date | string | null;
  created_at: Date | string;
  sub_current_period_end: number | string | null;
  sub_cancel_at_period_end: boolean | null;
}): AccessState {
  const trialStartRaw = row.trial_started_at ?? row.created_at;
  const trialStartMs = new Date(trialStartRaw).getTime();
  const trialEndMs = trialStartMs + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const periodEndIso = (() => {
    const v = row.sub_current_period_end;
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return new Date(n * 1000).toISOString();
  })();
  switch (row.state_kind) {
    case "active":
      return {
        kind: "active",
        currentPeriodEnd: periodEndIso,
        cancelAtPeriodEnd: !!row.sub_cancel_at_period_end,
      };
    case "trialing":
      return { kind: "trialing", currentPeriodEnd: periodEndIso };
    case "past_due":
      return { kind: "past_due", currentPeriodEnd: periodEndIso };
    case "canceled":
      return { kind: "canceled" };
    case "trial": {
      const daysLeft = Math.max(
        0,
        Math.ceil((trialEndMs - Date.now()) / (24 * 60 * 60 * 1000)),
      );
      return {
        kind: "trial",
        daysLeft,
        trialEndsAt: new Date(trialEndMs).toISOString(),
      };
    }
    default:
      return {
        kind: "expired",
        trialEndedAt: new Date(trialEndMs).toISOString(),
      };
  }
}

/**
 * Probe every Stripe-mirror table we know about for any non-null
 * `_account_id`. Used by `comp-subscription` so the synchronous mirror
 * insert into `stripe.subscriptions` works even when the subs table is
 * empty (e.g. first-ever comp on a fresh environment) — `stripe.customers`,
 * `stripe.prices`, and `stripe.products` are all populated by the billing
 * seed before any subscription exists.
 */
async function findStripeAccountId(): Promise<string | null> {
  const tables = [
    "stripe.subscriptions",
    "stripe.customers",
    "stripe.prices",
    "stripe.products",
  ] as const;
  for (const t of tables) {
    try {
      const r = await db.execute(
        sql.raw(
          `SELECT _account_id FROM ${t} WHERE _account_id IS NOT NULL LIMIT 1`,
        ),
      );
      const row = r.rows[0] as { _account_id?: string } | undefined;
      if (row?._account_id) return row._account_id;
    } catch {
      // table missing — try next
    }
  }
  return null;
}

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
// Operator presets only — keeps the audit log meaningful and prevents
// accidental "extend by 9999 days" misclicks.
const extendTrialBody = z.object({
  days: z.union([z.literal(7), z.literal(14), z.literal(30)]),
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

    // Signup totals — straight from users table.
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
    const [{ value: signups90 = 0 } = {}] = await db
      .select({ value: count() })
      .from(usersTable)
      .where(gte(usersTable.createdAt, ninetyAgo));

    // ----- Canonical bucket counts -----
    // Bucket totals are derived from the same logic as `getAccessState` —
    // but pushed entirely into SQL via the shared user_state CTE so we
    // never truncate the user list. One aggregate query per row of users,
    // not one round-trip per user.
    const stripeAvailable = await stripeSubsAvailable();
    const { cte } = buildUserStateCte(stripeAvailable);
    const trialIntervalSql = sql.raw(`interval '${TRIAL_DAYS} days'`);
    const bucketRows = await db.execute(sql`
      ${cte}
      SELECT state_kind, COUNT(*)::int AS c
      FROM user_state
      GROUP BY state_kind
    `);
    const buckets = new Map<string, number>();
    for (const row of bucketRows.rows as Array<{
      state_kind: string;
      c: number | string;
    }>) {
      buckets.set(row.state_kind, Number(row.c));
    }
    const activeSubs = buckets.get("active") ?? 0;
    const trialingSubs = buckets.get("trialing") ?? 0;
    const pastDueSubs = buckets.get("past_due") ?? 0;
    const canceledSubs = buckets.get("canceled") ?? 0;
    const activeTrials = buckets.get("trial") ?? 0;
    const expiredTrials = buckets.get("expired") ?? 0;

    const endingSoonRow = await db.execute(sql`
      ${cte}
      SELECT COUNT(*)::int AS c
      FROM user_state
      WHERE state_kind = 'trial'
        AND COALESCE(trial_started_at, created_at) + ${trialIntervalSql}
            <= NOW() + interval '3 days'
    `);
    const trialsEndingSoon = Number(
      (endingSoonRow.rows[0] as { c?: number | string } | undefined)?.c ?? 0,
    );

    const mrrCents = activeSubs * MONTHLY_AMOUNT_CENTS;

    // ----- Stripe-mirror-derived series & conversions -----
    // For conversions, churn, and the daily series we still read the Stripe
    // mirror, but we collapse to the *first* qualifying subscription per
    // customer so a customer with multiple historical rows is counted once.
    let conversions30 = 0;
    let conversions90 = 0;
    let churn30 = 0;
    let signupSeries: Array<{ day: string; count: number }> = [];
    let subSeries: Array<{ day: string; count: number }> = [];

    // Signup series — always available.
    const signupSeriesRows = await db.execute(sql`
      SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
             COUNT(*)::int AS count
      FROM users
      WHERE created_at >= ${thirtyAgo}
      GROUP BY day
      ORDER BY day ASC
    `);
    signupSeries = (
      signupSeriesRows.rows as Array<{
        day: string | Date;
        count: number | string;
      }>
    ).map((r) => ({
      day:
        typeof r.day === "string" ? r.day : r.day.toISOString().slice(0, 10),
      count: Number(r.count),
    }));

    if (stripeAvailable) try {
      // True trial→paid cohort conversion: of users who signed up in the
      // window, how many later got their first paid subscription (any time
      // after signup). We join users → stripe.subscriptions on the local
      // stripe_customer_id mirror so we don't double-count cycled subs.
      const conv = await db.execute(sql`
        WITH cohort_30 AS (
          SELECT u.id, u.stripe_customer_id
          FROM users u
          WHERE u.created_at >= ${thirtyAgo}
        ),
        cohort_90 AS (
          SELECT u.id, u.stripe_customer_id
          FROM users u
          WHERE u.created_at >= ${ninetyAgo}
        )
        SELECT
          (SELECT COUNT(DISTINCT c.id)::int
             FROM cohort_30 c
             JOIN stripe.subscriptions s ON s.customer = c.stripe_customer_id
            WHERE s.status IN ('active', 'trialing')
          ) AS c30,
          (SELECT COUNT(DISTINCT c.id)::int
             FROM cohort_90 c
             JOIN stripe.subscriptions s ON s.customer = c.stripe_customer_id
            WHERE s.status IN ('active', 'trialing')
          ) AS c90
      `);
      const cRow = conv.rows[0] as {
        c30?: number | string;
        c90?: number | string;
      };
      conversions30 = Number(cRow?.c30 ?? 0);
      conversions90 = Number(cRow?.c90 ?? 0);

      // Churn: distinct customers whose *latest* subscription is canceled and
      // whose cancellation landed in the last 30 days.
      const churn = await db.execute(sql`
        WITH latest AS (
          SELECT DISTINCT ON (customer) customer, status,
                 COALESCE(canceled_at, ended_at, created) AS terminated_at
          FROM stripe.subscriptions
          WHERE customer IS NOT NULL
          ORDER BY customer, created DESC
        )
        SELECT COUNT(*)::int AS c
        FROM latest
        WHERE status = 'canceled'
          AND terminated_at >= ${Math.floor(thirtyAgo.getTime() / 1000)}
      `);
      churn30 = Number(
        (churn.rows[0] as { c?: number | string } | undefined)?.c ?? 0,
      );

      // Subscription series: first paid sub per customer, bucketed by day.
      const subSeriesRows = await db.execute(sql`
        WITH first_paid AS (
          SELECT DISTINCT ON (customer) customer, created
          FROM stripe.subscriptions
          WHERE status IN ('active', 'trialing') AND customer IS NOT NULL
          ORDER BY customer, created ASC
        )
        SELECT date_trunc('day', to_timestamp(created) AT TIME ZONE 'UTC')::date AS day,
               COUNT(*)::int AS count
        FROM first_paid
        WHERE created >= ${Math.floor(thirtyAgo.getTime() / 1000)}
        GROUP BY day
        ORDER BY day ASC
      `);
      subSeries = (
        subSeriesRows.rows as Array<{
          day: string | Date;
          count: number | string;
        }>
      ).map((row) => ({
        day:
          typeof row.day === "string"
            ? row.day
            : row.day.toISOString().slice(0, 10),
        count: Number(row.count),
      }));
    } catch (err) {
      // Mirror present but query failed — leave conversions/churn at 0.
      req.log.warn({ err }, "admin metrics: stripe-derived series failed");
    }

    // Conversion *rates* — % of signups in the window that became paid subs.
    const pct = (num: number, den: number): number =>
      den > 0 ? Math.round((num / den) * 1000) / 10 : 0;

    res.json({
      totals: {
        users: Number(totalUsers),
        signups7d: Number(signups7),
        signups30d: Number(signups30),
      },
      trials: {
        active: activeTrials,
        endingSoon: trialsEndingSoon,
        expired: expiredTrials,
      },
      subscriptions: {
        active: activeSubs,
        trialing: trialingSubs,
        pastDue: pastDueSubs,
        canceled: canceledSubs,
      },
      revenue: {
        mrrCents,
        conversions30d: conversions30,
        conversions90d: conversions90,
        churn30d: churn30,
        conversionRate30d: pct(conversions30, Number(signups30)),
        conversionRate90d: pct(conversions90, Number(signups90)),
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
    const stripeAvailable = await stripeSubsAvailable();
    const { cte } = buildUserStateCte(stripeAvailable);

    // Map the public `status` query param to the set of state_kind values
    // it covers. "subscribed" intentionally bundles active + trialing,
    // matching the UI's combined badge.
    const statusKinds: Record<string, string[]> = {
      trial: ["trial"],
      subscribed: ["active", "trialing"],
      past_due: ["past_due"],
      canceled: ["canceled"],
      expired: ["expired"],
    };
    const allowedKinds = status ? statusKinds[status] ?? [] : [];
    const statusFilter =
      status && allowedKinds.length > 0
        ? sql`AND state_kind = ANY(${allowedKinds}::text[])`
        : sql``;

    const searchPattern = search ? `%${search}%` : null;
    const searchFilter = searchPattern
      ? sql`AND (
            email ILIKE ${searchPattern}
            OR first_name ILIKE ${searchPattern}
            OR last_name ILIKE ${searchPattern}
          )`
      : sql``;

    // Single round-trip: filter, count, paginate over the full user set in
    // SQL. `COUNT(*) OVER()` gives us the filtered total alongside the
    // page rows so the UI can render correct page counts even at scale.
    const pageRows = await db.execute(sql`
      ${cte}
      SELECT
        id, email, first_name, last_name, image_url,
        created_at, trial_started_at, stripe_customer_id,
        sub_current_period_end, sub_cancel_at_period_end,
        last_activity_at, state_kind,
        COUNT(*) OVER()::int AS total_count
      FROM user_state
      WHERE 1 = 1
        ${statusFilter}
        ${searchFilter}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    type Row = {
      id: string;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      image_url: string | null;
      created_at: Date | string;
      trial_started_at: Date | string | null;
      stripe_customer_id: string | null;
      sub_current_period_end: number | string | null;
      sub_cancel_at_period_end: boolean | null;
      last_activity_at: Date | string | null;
      state_kind: string;
      total_count: number | string;
    };
    const rows = pageRows.rows as Row[];
    const total = rows.length > 0 ? Number(rows[0]!.total_count) : 0;

    const items = rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
      createdAt: new Date(r.created_at).toISOString(),
      stripeCustomerId: r.stripe_customer_id,
      state: rowToAccessState(r),
      lastActivityAt: r.last_activity_at
        ? new Date(r.last_activity_at).toISOString()
        : null,
    }));

    res.json({ items, total, limit, offset });
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
      // Always *increase* days_left by `days`. If the trial has already
      // expired we treat "now" as the floor so the user gets a fresh
      // `days` of trial; otherwise we extend their existing window.
      // trial_end = trial_started_at + TRIAL_DAYS, so to make
      // new_trial_end = max(current_end, now) + days, we set
      // new_anchor   = new_trial_end - TRIAL_DAYS.
      const dayMs = 24 * 60 * 60 * 1000;
      const trialMs = TRIAL_DAYS * dayMs;
      const baseAnchor = u.trialStartedAt ?? u.createdAt;
      const currentEndMs = baseAnchor.getTime() + trialMs;
      const newEndMs = Math.max(currentEndMs, Date.now()) + days * dayMs;
      const finalAnchor = new Date(newEndMs - trialMs);
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

      // Reuse the same monthly price resolver the user-facing checkout
      // flow uses, so comp-subscription works in every environment where
      // checkout already works (env var, .local/billing-config.json, or
      // the Stripe mirror).
      const priceId = await getMonthlyPriceId();
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
      const newSub = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        discounts: [{ coupon: coupon.id }],
        payment_behavior: "allow_incomplete",
        metadata: { comped_by: getOwnerEmail() ?? "owner", userId: u.id },
      });

      // Synchronously mirror the new subscription into stripe.subscriptions
      // so getAccessState reflects "active" *immediately*, without waiting
      // for the Stripe webhook to land. _account_id is shared across the
      // whole stripe.* mirror, so we probe every populated table for it
      // (subscriptions can be empty on a fresh install — customers/prices/
      // products are populated by the billing seed).
      let mirrorInserted = false;
      try {
        const accountId = await findStripeAccountId();
        if (accountId) {
          await db.execute(sql`
            INSERT INTO stripe.subscriptions (_account_id, _raw_data, _last_synced_at)
            VALUES (
              ${accountId},
              ${JSON.stringify(newSub)}::jsonb,
              NOW()
            )
          `);
          mirrorInserted = true;
        } else {
          req.log.warn(
            { subId: newSub.id },
            "comp-subscription: no stripe _account_id found in any mirror table",
          );
        }
      } catch (err) {
        req.log.warn(
          { err, subId: newSub.id },
          "comp-subscription: mirror insert failed; webhook will catch up",
        );
      }
      // Bust the user-state Stripe-availability probe so the next list/metrics
      // request sees the row we just inserted even if the table was empty
      // before this call.
      if (mirrorInserted) _stripeSubsCache = null;

      const ownerEmail = getOwnerEmail();
      req.log.info(
        { ownerEmail, targetId: u.id, subId: newSub.id },
        "admin comped subscription",
      );

      // After the synthetic mirror insert above, getAccessState should now
      // return "active" — but we also synthesize a guaranteed-active reply
      // in case the mirror insert was skipped (no prior account row found).
      const live = await getAccessState(u.id);
      // Stripe's Subscription type moved current_period_end onto items in
      // recent API versions; keep both shapes working with a runtime read.
      const periodEndUnix =
        (newSub as unknown as { current_period_end?: number })
          .current_period_end ??
        newSub.items?.data?.[0]?.current_period_end ??
        null;
      const state =
        live.kind === "active" || live.kind === "trialing"
          ? live
          : {
              kind: "active" as const,
              currentPeriodEnd: periodEndUnix
                ? new Date(periodEndUnix * 1000).toISOString()
                : null,
              cancelAtPeriodEnd: false,
            };
      res.json({ state, couponId: coupon.id, subscriptionId: newSub.id });
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
