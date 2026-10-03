import { Router, type IRouter, type Request, type Response } from "express";
import { count, desc, eq, gte, sql, getTableColumns, notInArray } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import path from "node:path";
import multer from "multer";
import {
  db,
  usersTable,
  servicePlansTable,
  sermonsTable,
  aiUsageEventsTable,
  helpArticlesTable,
  helpCategoryOrderTable,
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
import { ObjectStorageService } from "../lib/objectStorage";

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
 * status takes precedence; otherwise only a Stripe-confirmed trial window
 * from `trial_started_at` can become trial-vs-expired. Used by
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
  //   - active paid subscriptions retain access
  //   - Stripe trials require confirmed card-backed enrollment
  //   - pending enrollment never becomes a local trial
  const stateCase = stripeAvailable
    ? sql`CASE
            WHEN s.status IS NULL THEN
              CASE
                WHEN u.trial_enrollment_status = 'pending' THEN 'enrollment_required'
                WHEN u.trial_enrollment_status = 'enrolled'
                  AND u.trial_started_at + ${trialInterval} > NOW() THEN 'trial'
                ELSE 'expired'
              END
            WHEN s.status = 'active' THEN 'active'
            WHEN s.status = 'trialing'
              AND u.trial_enrollment_status = 'enrolled'
              AND u.trial_started_at + ${trialInterval} > NOW() THEN 'trial'
            WHEN s.status = 'incomplete'
              AND u.trial_enrollment_status = 'enrolled'
              AND u.trial_started_at + ${trialInterval} > NOW() THEN 'trial'
            WHEN s.status = 'trialing' AND u.trial_enrollment_status = 'enrolled' THEN 'trialing'
            WHEN s.status = 'trialing' THEN 'enrollment_required'
            WHEN s.status IN ('past_due','unpaid','incomplete','paused') THEN 'past_due'
            WHEN s.status IN ('canceled','incomplete_expired') THEN 'canceled'
            ELSE 'past_due'
          END`
    : sql`CASE
            WHEN u.trial_enrollment_status = 'pending' THEN 'enrollment_required'
            WHEN u.trial_enrollment_status = 'enrolled'
              AND u.trial_started_at + ${trialInterval} > NOW() THEN 'trial'
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
          u.created_at, u.trial_started_at, u.trial_enrollment_status, u.stripe_customer_id,
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
  trial_enrollment_status: string;
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
    case "enrollment_required":
      return { kind: "enrollment_required" };
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

type ConversionFunnelMetrics = {
  activatedUsers: number;
  promptShown: number;
  promptClicked: number;
  checkoutStarted: number;
  subscriptionsStarted: number;
  activatedToPaidRate: number;
  byTrialDay: Array<{
    trialDay: number;
    activated: number;
    promptShown: number;
    promptClicked: number;
    checkoutStarted: number;
    subscriptionsStarted: number;
  }>;
};

async function getConversionFunnelMetrics(): Promise<ConversionFunnelMetrics> {
  const empty: ConversionFunnelMetrics = {
    activatedUsers: 0,
    promptShown: 0,
    promptClicked: 0,
    checkoutStarted: 0,
    subscriptionsStarted: 0,
    activatedToPaidRate: 0,
    byTrialDay: [],
  };
  try {
    const rows = await db.execute(sql`
      SELECT
        trial_day::int AS trial_day,
        COUNT(*) FILTER (WHERE event_name = 'ss_trial_activated')::int AS activated,
        COUNT(*) FILTER (WHERE event_name = 'ss_upgrade_prompt_shown')::int AS prompt_shown,
        COUNT(*) FILTER (WHERE event_name = 'ss_upgrade_prompt_clicked')::int AS prompt_clicked,
        COUNT(*) FILTER (WHERE event_name = 'ss_checkout_started')::int AS checkout_started,
        COUNT(*) FILTER (WHERE event_name = 'ss_subscription_started')::int AS subscriptions_started
      FROM trial_events
      GROUP BY trial_day
      ORDER BY trial_day ASC
    `);
    const byTrialDay = (rows.rows as Array<Record<string, number | string>>).map((row) => ({
      trialDay: Number(row.trial_day),
      activated: Number(row.activated),
      promptShown: Number(row.prompt_shown),
      promptClicked: Number(row.prompt_clicked),
      checkoutStarted: Number(row.checkout_started),
      subscriptionsStarted: Number(row.subscriptions_started),
    }));
    const total = byTrialDay.reduce(
      (acc, row) => ({
        activated: acc.activated + row.activated,
        promptShown: acc.promptShown + row.promptShown,
        promptClicked: acc.promptClicked + row.promptClicked,
        checkoutStarted: acc.checkoutStarted + row.checkoutStarted,
        subscriptionsStarted: acc.subscriptionsStarted + row.subscriptionsStarted,
      }),
      { activated: 0, promptShown: 0, promptClicked: 0, checkoutStarted: 0, subscriptionsStarted: 0 },
    );
    const distinctUsers = await db.execute(sql`
      SELECT
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'ss_trial_activated')::int AS activated_users
      FROM trial_events
    `);
    const activatedUsers = Number(
      (distinctUsers.rows[0] as { activated_users?: number | string } | undefined)?.activated_users ?? 0,
    );
    return {
      activatedUsers,
      promptShown: total.promptShown,
      promptClicked: total.promptClicked,
      checkoutStarted: total.checkoutStarted,
      subscriptionsStarted: total.subscriptionsStarted,
      activatedToPaidRate:
        activatedUsers > 0
          ? Math.round((total.subscriptionsStarted / activatedUsers) * 1000) / 10
          : 0,
      byTrialDay,
    };
  } catch (err) {
    // Keep the existing admin overview usable during first deploy, before the
    // additive trial_events migration has been applied.
    return empty;
  }
}

// Runtime input schemas — every admin endpoint validates params/query/body
// through these before touching the DB. Failures return 400 with details
// so the UI (and curl probes) get an actionable message.
const userIdParam = z.object({ id: z.string().min(1).max(128) });
const usersListQuery = z.object({
  search: z.string().max(200).optional(),
  status: z
    .enum([
      "enrollment_required",
      "trial",
      "subscribed",
      "past_due",
      "canceled",
      "expired",
    ])
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
        AND trial_started_at + ${trialIntervalSql}
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
          WHERE u.trial_enrollment_status = 'enrolled'
            AND u.trial_started_at >= ${thirtyAgo}
        ),
        cohort_90 AS (
          SELECT u.id, u.stripe_customer_id
          FROM users u
          WHERE u.trial_enrollment_status = 'enrolled'
            AND u.trial_started_at >= ${ninetyAgo}
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

    // ----- AI cost metrics -----
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const aiMonthlyRow = await db.execute(sql`
      SELECT
        COALESCE(SUM(input_tokens), 0)::bigint  AS input_tokens,
        COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
        COALESCE(SUM(cost_usd::numeric), 0)     AS cost_usd,
        COUNT(DISTINCT user_id)::int            AS active_users
      FROM ai_usage_events
      WHERE created_at >= ${monthStart}
    `);
    const aiMonth = aiMonthlyRow.rows[0] as {
      input_tokens: bigint | number | string;
      output_tokens: bigint | number | string;
      cost_usd: number | string;
      active_users: number | string;
    } | undefined;
    const totalInputTokensThisMonth = Number(aiMonth?.input_tokens ?? 0);
    const totalOutputTokensThisMonth = Number(aiMonth?.output_tokens ?? 0);
    const estimatedCostThisMonth = Number(aiMonth?.cost_usd ?? 0);
    const activeAiUsers = Number(aiMonth?.active_users ?? 0);
    const avgCostPerActiveUser =
      activeAiUsers > 0
        ? Math.round((estimatedCostThisMonth / activeAiUsers) * 1e6) / 1e6
        : 0;

    const aiDailyRows = await db.execute(sql`
      SELECT
        date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
        COALESCE(SUM(cost_usd::numeric), 0) AS cost_usd
      FROM ai_usage_events
      WHERE created_at >= ${thirtyAgo}
      GROUP BY day
      ORDER BY day ASC
    `);
    const dailyCost = (
      aiDailyRows.rows as Array<{
        day: string | Date;
        cost_usd: number | string;
      }>
    ).map((r) => ({
      day:
        typeof r.day === "string" ? r.day : r.day.toISOString().slice(0, 10),
      costUsd: Number(r.cost_usd),
    }));

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
      conversion: await getConversionFunnelMetrics(),
      aiCost: {
        totalInputTokensThisMonth,
        totalOutputTokensThisMonth,
        estimatedCostThisMonth,
        avgCostPerActiveUser,
        dailyCost,
      },
    });
  } catch (err) {
    req.log.error({ err }, "admin metrics failed");
    res.status(500).json({ error: "Failed to load metrics" });
  }
});

/**
 * GET /admin/users/:id/ai-usage — per-user AI token and cost breakdown.
 * Returns all-time totals, last-30-day totals, and a breakdown by generation type.
 */
router.get(
  "/admin/users/:id/ai-usage",
  requireAuth,
  requireOwner,
  async (req, res) => {
    const targetId = parseUserIdParam(req, res);
    if (!targetId) return;
    try {
      const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const allTimeRow = await db.execute(sql`
        SELECT
          COALESCE(SUM(input_tokens), 0)::bigint  AS input_tokens,
          COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
          COALESCE(SUM(cost_usd::numeric), 0)     AS cost_usd,
          COUNT(*)::int                            AS event_count
        FROM ai_usage_events
        WHERE user_id = ${targetId}
      `);
      const allTimeData = allTimeRow.rows[0] as {
        input_tokens: bigint | number | string;
        output_tokens: bigint | number | string;
        cost_usd: number | string;
        event_count: number | string;
      } | undefined;

      const last30dRow = await db.execute(sql`
        SELECT
          COALESCE(SUM(input_tokens), 0)::bigint  AS input_tokens,
          COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
          COALESCE(SUM(cost_usd::numeric), 0)     AS cost_usd,
          COUNT(*)::int                            AS event_count
        FROM ai_usage_events
        WHERE user_id = ${targetId}
          AND created_at >= ${thirtyAgo}
      `);
      const last30dData = last30dRow.rows[0] as {
        input_tokens: bigint | number | string;
        output_tokens: bigint | number | string;
        cost_usd: number | string;
        event_count: number | string;
      } | undefined;

      const byTypeRows = await db.execute(sql`
        SELECT
          generation_type,
          COALESCE(SUM(input_tokens), 0)::bigint  AS input_tokens,
          COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
          COALESCE(SUM(cost_usd::numeric), 0)     AS cost_usd,
          COUNT(*)::int                            AS event_count
        FROM ai_usage_events
        WHERE user_id = ${targetId}
        GROUP BY generation_type
        ORDER BY cost_usd DESC
      `);
      const byType = (
        byTypeRows.rows as Array<{
          generation_type: string;
          input_tokens: bigint | number | string;
          output_tokens: bigint | number | string;
          cost_usd: number | string;
          event_count: number | string;
        }>
      ).map((r) => ({
        generationType: r.generation_type,
        inputTokens: Number(r.input_tokens),
        outputTokens: Number(r.output_tokens),
        costUsd: Number(r.cost_usd),
        eventCount: Number(r.event_count),
      }));

      res.json({
        allTime: {
          inputTokens: Number(allTimeData?.input_tokens ?? 0),
          outputTokens: Number(allTimeData?.output_tokens ?? 0),
          costUsd: Number(allTimeData?.cost_usd ?? 0),
          eventCount: Number(allTimeData?.event_count ?? 0),
        },
        last30d: {
          inputTokens: Number(last30dData?.input_tokens ?? 0),
          outputTokens: Number(last30dData?.output_tokens ?? 0),
          costUsd: Number(last30dData?.cost_usd ?? 0),
          eventCount: Number(last30dData?.event_count ?? 0),
        },
        byType,
      });
    } catch (err) {
      req.log.error({ err }, "admin user ai-usage failed");
      res.status(500).json({ error: "Failed to load AI usage" });
    }
  },
);

/**
 * GET /admin/users — paginated list with optional search and status filter.
 * Status filter ∈ {enrollment_required, trial, subscribed, past_due, canceled, expired}.
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
      enrollment_required: ["enrollment_required"],
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
        created_at, trial_started_at, trial_enrollment_status, stripe_customer_id,
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
      trial_enrollment_status: string;
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
        trialStartedAt: u.trialEnrollmentStatus === "enrolled" && u.trialStartedAt
          ? u.trialStartedAt.toISOString()
          : null,
        stripeCustomerId: u.stripeCustomerId,
        state,
        counts: {
          servicePlans: Number(planCount),
          sermons: Number(sermonCount),
        },
        lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
        eventStamps: {
          churchProfileEventFiredAt: u.churchProfileEventFiredAt?.toISOString() ?? null,
          firstServicePlanEventFiredAt: u.firstServicePlanEventFiredAt?.toISOString() ?? null,
          firstLibraryItemEventFiredAt: u.firstLibraryItemEventFiredAt?.toISOString() ?? null,
          firstSermonEventFiredAt: u.firstSermonEventFiredAt?.toISOString() ?? null,
          planningCenterEventFiredAt: u.planningCenterEventFiredAt?.toISOString() ?? null,
          scholarlySourcesEventFiredAt: u.scholarlySourcesEventFiredAt?.toISOString() ?? null,
          repertoireEventFiredAt: u.repertoireEventFiredAt?.toISOString() ?? null,
        },
      });
    } catch (err) {
      req.log.error({ err }, "admin user detail failed");
      res.status(500).json({ error: "Failed to load user" });
    }
  },
);

/** POST /admin/users/:id/extend-trial — reject unsafe local-only extensions. */
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
      const currentState = await getAccessState(u.id);
      if (currentState.kind !== "trial") {
        res.status(409).json({
          error: "Only a currently active, confirmed trial can be extended.",
        });
        return;
      }
      res.status(409).json({
        error:
          "Card-backed trial extensions are unavailable here because this action cannot move the Stripe first-charge date with the access end date.",
      });
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
          name: "Sunday Studio Owner Comp",
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
      await db.execute(sql`DELETE FROM ai_usage_events WHERE user_id = ${u.id}`);
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

// ── Help Articles CRUD ────────────────────────────────────────────────────────

const objectStorageService = new ObjectStorageService();

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/avif": ".avif",
  };
  return map[mime] ?? ".bin";
}

const helpArticleBodySchema = z.object({
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  title: z.string().min(1).max(300),
  body: z.string().default(""),
  category: z.string().min(1).max(100).default("General"),
  published: z.boolean().default(false),
});

router.get(
  "/admin/help-articles",
  requireAuth,
  requireOwner,
  async (req: Request, res: Response) => {
    try {
      const articles = await db
        .select(getTableColumns(helpArticlesTable))
        .from(helpArticlesTable)
        .leftJoin(
          helpCategoryOrderTable,
          eq(helpCategoryOrderTable.category, helpArticlesTable.category),
        )
        .orderBy(
          sql`COALESCE(${helpCategoryOrderTable.position}, 9999)`,
          helpArticlesTable.category,
          sql`COALESCE(${helpArticlesTable.position}, 9999)`,
          helpArticlesTable.title,
        );
      res.json(articles);
    } catch (err) {
      req.log.error({ err }, "admin list help articles failed");
      res.status(500).json({ error: "Failed to fetch help articles" });
    }
  },
);

router.post(
  "/admin/help-articles",
  requireAuth,
  requireOwner,
  async (req: Request, res: Response) => {
    try {
      const parsed = helpArticleBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const [article] = await db
        .insert(helpArticlesTable)
        .values(parsed.data)
        .returning();
      res.status(201).json(article);
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "23505"
      ) {
        res.status(409).json({ error: "A help article with that slug already exists" });
        return;
      }
      req.log.error({ err }, "admin create help article failed");
      res.status(500).json({ error: "Failed to create help article" });
    }
  },
);

router.get(
  "/admin/help-articles/category-order",
  requireAuth,
  requireOwner,
  async (req: Request, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(helpCategoryOrderTable)
        .orderBy(helpCategoryOrderTable.position);
      const order = rows.map((r) => r.category);
      res.json({ order });
    } catch (err) {
      req.log.error({ err }, "get help category order failed");
      res.status(500).json({ error: "Failed to fetch category order" });
    }
  },
);

const categoryOrderSchema = z.object({
  order: z.array(z.string().min(1).max(100)),
});

router.put(
  "/admin/help-articles/category-order",
  requireAuth,
  requireOwner,
  async (req: Request, res: Response) => {
    try {
      const parsed = categoryOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const { order } = parsed.data;
      if (order.length === 0) {
        await db.delete(helpCategoryOrderTable);
        res.json({ order: [] });
        return;
      }
      const values = order.map((category, idx) => ({ category, position: idx }));
      await db
        .insert(helpCategoryOrderTable)
        .values(values)
        .onConflictDoUpdate({
          target: helpCategoryOrderTable.category,
          set: { position: sql`excluded.position` },
        });
      // Remove any categories no longer in the list
      await db
        .delete(helpCategoryOrderTable)
        .where(notInArray(helpCategoryOrderTable.category, order));
      req.log.info({ count: order.length }, "updated help category order");
      res.json({ order });
    } catch (err) {
      req.log.error({ err }, "set help category order failed");
      res.status(500).json({ error: "Failed to update category order" });
    }
  },
);

router.post(
  "/admin/help-articles/images",
  requireAuth,
  requireOwner,
  (req, res, next) => {
    imageUpload.single("file")(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Upload error" });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    try {
      const ext = path.extname(file.originalname).toLowerCase() || mimeToExt(file.mimetype);
      const filePath = `help-articles/${randomUUID()}${ext}`;
      await objectStorageService.uploadPublicObject(filePath, file.buffer, file.mimetype);
      req.log.info({ filePath, size: file.size }, "help article image uploaded");
      res.json({ url: `/api/storage/public-objects/${filePath}` });
    } catch (err) {
      req.log.error({ err }, "help article image upload failed");
      res.status(500).json({ error: "Upload failed" });
    }
  },
);

const SEED_ARTICLES = [
  { slug: "welcome-to-sunday-studio", title: "Welcome to Sunday Studio", category: "Getting Started", body: "Sunday Studio is an AI-powered planning companion built for pastors and worship leaders who want to prepare richer services in less time. Whether you're crafting a full Sunday order of worship, writing a sermon from scratch, or searching for songs that resonate with your text, Sunday Studio puts thoughtful, theologically grounded assistance right inside your workflow.\n\n## What you can do here\n\n**Plan complete services.** The Service Builder takes your Scripture passage or theme and generates a full order of worship — songs, liturgical moments, a sermon title, and transitions — shaped around your church's voice and calendar.\n\n**Build sermons with structure.** The Sermon Builder is a three-panel workspace that walks you through Study, Big Idea, Outline, Manuscript, Applications, Illustrations, and Worship Integration — each section generated on demand so you stay in control of the pace.\n\n**Generate individual elements.** Need a call to worship for Wednesday night? A speaking moment for the offering? A devotional for your staff meeting? The single-purpose generators in the sidebar handle these in seconds.\n\n**Save and organise everything.** Every AI output you keep lands in your Library, searchable and reusable for future planning.\n\n## Finding your way around\n\nThe sidebar on the left is your primary navigation. At the top you'll find your most-used destinations: Dashboard, Service Builder, Sermon Builder, and the Generator tools. Toward the bottom are the Library, Resources, and your Church Profile. The gear icon takes you to Settings.\n\nThe **Dashboard** is your home base — a quick look at recent services and shortcuts to your most common tasks.\n\n## A good first step\n\nBefore generating anything, visit your **Church Profile** (the church icon in the sidebar). Filling in your denomination, congregation size, worship style, and pastor's name takes about five minutes and makes every AI output significantly more relevant to your community. The AI reads your profile before generating anything, so this small investment pays off in every session.\n\nIf you have any questions, browse the other articles in this Help Center or reach out through the Settings page." },
  { slug: "setting-up-your-church-profile", title: "Setting Up Your Church Profile", category: "Getting Started", body: "Your Church Profile is the foundation of everything Sunday Studio generates. Before the AI writes a single word, it reads your profile so that every song suggestion, sermon outline, and liturgical element is shaped by your church's identity rather than a generic template.\n\n## How to find it\n\nClick the **church building icon** in the sidebar, or navigate to /church directly. The page opens a simple form you can update any time.\n\n## What to fill in\n\n**Church name and location.** These appear in generated content when it references your congregation by name.\n\n**Denomination or tradition.** This shapes theological language, liturgical assumptions, and the kinds of illustrations the AI reaches for. A Reformed Baptist church and a charismatic Pentecostal church should sound quite different — and with your denomination filled in, they will.\n\n**Congregation size.** Small, medium, and large congregations have different cultures and needs. This helps the AI pitch its suggestions appropriately.\n\n**Worship style.** Contemporary, traditional, blended, liturgical — your style influences song choices, the formality of language in liturgy, and how the AI frames spoken transitions.\n\n**Pastor's name.** When the AI drafts a speaking moment or sermon opener, it can address your congregation as if you're speaking rather than in generic third-person voice.\n\n**Additional context.** There's a free-text field for anything else that matters — your church's values statement, a recurring series theme, notes about your worship team's size or instrumentation, or the season of the church calendar you're in. This field is read verbatim, so the more specific you are, the more tailored the output.\n\n## Why it matters\n\nEvery generation request — service plans, song lists, sermon content, liturgy — is preceded by a church context block that the AI uses to personalise its output. Leaving the profile blank means you'll receive well-written but generic content. Filling it in means you'll receive content that sounds like it came from someone who knows your church.\n\n## Keeping it current\n\nUpdate your profile when your context changes: a new sermon series, a different liturgical season, a change in pastoral staff, or a seasonal emphasis like Advent or Lent. You can update it as often as you like — changes take effect immediately for all subsequent generations." },
  { slug: "your-dashboard", title: "Your Dashboard", category: "Getting Started", body: "The Dashboard is the first thing you see after signing in, and it's designed to get you back into your work quickly — without scrolling through lists or hunting for what you were doing last week.\n\n## What's on the Dashboard\n\n**Recent service plans.** Your most recently saved services appear here with their title, date, and a quick link to open them. This makes it easy to pick up a plan you started earlier in the week or review something from last Sunday.\n\n**Quick-action buttons.** Prominent shortcuts let you jump straight to the Service Builder, Sermon Builder, or any of the generators without navigating through the sidebar.\n\n**At-a-glance context.** The Dashboard reflects your actual activity rather than static links, so it becomes more useful the more you use Sunday Studio.\n\n## Using the Dashboard as a launchpad\n\nMany pastors find it helpful to open Sunday Studio on Monday or Tuesday and use the Dashboard to orient the week's planning. A typical flow might look like this:\n\n1. **Open a sermon** you started last week and continue from where you left off.\n2. **Start a new service plan** from the Service Builder shortcut.\n3. **Browse the Library** for a devotional you saved last month that might fit this week's theme.\n\n## Navigating from here\n\nThe sidebar is always available. If the Dashboard doesn't show a shortcut you need, look to the left — the full navigation is one click away. The bottom of the sidebar holds links to your Library, Resources, Help Center, and Settings.\n\n## A note on loading\n\nThe Dashboard pulls live data each time you open it, so it always reflects your most recent saves. If you just created a new service plan, give it a moment to appear — a quick refresh will show it.\n\n## Making it a habit\n\nThe most effective way to use the Dashboard is as a weekly ritual. Open Sunday Studio at the same time each week — Monday morning after the weekend, or Tuesday once the dust has settled — and let the Dashboard orient your planning session. See what's already saved, identify what still needs to be done, and use the quick links to move straight into the work. Over time, this rhythm transforms scattered planning into a calm, consistent process." },
  { slug: "understanding-the-ai", title: "How the AI Works", category: "Getting Started", body: "Sunday Studio uses AI to generate draft content — sermons, service plans, songs, liturgy, and more. This article explains how that works in plain terms so you know what to expect and how to get the best results.\n\n## It reads your context first\n\nBefore generating anything, the AI reads your **Church Profile**. Your denomination, worship style, congregation size, pastor's name, and any additional notes are sent alongside every request. This is why filling in your profile makes such a meaningful difference — the AI isn't guessing about your church, it's working from what you've told it.\n\n## It generates drafts, not final products\n\nEverything the AI produces is a starting point, not a finished product. A sermon outline might nail your theological arc but suggest an illustration that doesn't quite fit your congregation — that's your cue to swap it. A song suggestion might be exactly right or slightly off-tempo for your set — you decide. Think of the AI as a well-read, fast-working associate who brings you strong first drafts.\n\n## It doesn't fabricate sources\n\nSunday Studio is designed with scholarly integrity in mind. The Sermon Builder is instructed never to fabricate commentary quotes or attribute opinions to scholars unless it has a verified source. If you've attached resources from the Resource Library, the AI can reference them. If scholarly sources are enabled in Settings, the AI consults public-domain commentaries. In every case, it's honest about the limits of what it knows.\n\n## It improves with specificity\n\nThe more context you give, the better the output. A Service Builder request with a Scripture passage, a theme sentence, and a note about the season you're in will produce a much richer plan than a bare keyword. Similarly, the Sermon Builder produces stronger content when the context sidebar has your passage, series title, and any initial thoughts.\n\n## It doesn't remember between sessions\n\nThe AI doesn't carry memory from one session to the next on its own. Your Church Profile is the persistent memory it has access to — which is another reason to keep it current and detailed.\n\n## You are always in control\n\nThe AI never saves anything without your action. Generated content sits on screen until you explicitly save it to your Library or a service plan. You can regenerate, ignore, or edit anything it produces." },
  { slug: "building-a-service-plan", title: "Building a Service Plan", category: "Service Planning", body: "The Service Builder generates a complete order of worship from a Scripture passage or theme — songs, liturgical elements, a sermon title, and spoken transitions — all shaped around your church's voice.\n\n## Getting started\n\nNavigate to **Service Builder** in the sidebar. You'll see a form where you can enter:\n\n- **Scripture passage** — the primary text for the service (e.g. \"John 15:1-17\" or \"Romans 8:28-39\")\n- **Theme or title** — a brief phrase capturing the heart of the message\n- **Any additional notes** — seasonal context, a special occasion, or a note about your worship team\n\nThe more context you give, the more tailored the result. Even a one-line note like \"Advent, second Sunday, theme of hope\" meaningfully shapes the output.\n\n## Reading the generated plan\n\nOnce the AI generates your plan, you'll see a structured order of worship with named slots: Gathering Song, Call to Worship, Worship Set, Scripture Reading, Sermon, Offering, Response Song, and so on. Each slot includes a title or song suggestion and a brief body note.\n\nTake a moment to read through the whole plan before making changes. The AI builds it as a coherent arc — the song choices, the liturgical language, and the spoken transitions are designed to work together.\n\n## Adjusting the plan\n\nYou can edit any slot's title or body text directly. If a song suggestion doesn't fit your repertoire, simply type in a different song. If the call to worship feels too formal for your congregation, rewrite it in your own voice.\n\nSlots can also be replaced with saved sermons or library items using the Slot Picker. See the *Swapping Slots with Saved Content* article for details.\n\n## Saving the plan\n\nWhen you're satisfied, click **Save**. The plan is stored under **Services** in the sidebar and can be opened, edited, printed, or shared at any time.\n\n## Tips for best results\n\n- Run the Service Builder **early in the week** so you have time to review and adjust.\n- Fill in your Church Profile before running your first generation — it makes the output immediately more relevant.\n- If the first result doesn't feel quite right, try adding a note in the context field and generate again." },
  { slug: "editing-a-saved-service", title: "Editing a Saved Service", category: "Service Planning", body: "Once a service plan is saved, it lives in **Services** in the sidebar and can be opened and edited any time before Sunday.\n\n## Opening a saved plan\n\nClick **Services** in the sidebar to see a list of all your plans. Each entry shows the plan title and the date it was saved. Click any plan to open it in the Service Detail view.\n\n## Editing slot content\n\nEvery slot in the plan has an editable title and body text. Click into either field to make changes. Edits are saved when you click the **Save** button or navigate away — so make sure to save before closing the tab.\n\nYou can also:\n\n- **Rename the slot** — useful when the AI gave it a generic label and you want something more specific to your service.\n- **Rewrite the body text** — the AI's suggestion is a starting point; feel free to replace it with your own language.\n\n## Replacing a slot with saved content\n\nCertain slot types support linking to a saved item. Look for the link icon on a slot to open the **Slot Picker**, which lets you browse your Library and Sermon Archive and swap the slot for a saved item.\n\n## Reordering slots\n\nDrag slots to reorder them. The order you set here is the order that appears in the print view.\n\n## Printing or exporting\n\nWhen the plan is ready, click the **Print** button to open a clean print view. This view is formatted for bulletins — titles are prominent, body text is legible, and navigation chrome is hidden. Use your browser's print dialog to print or save as PDF.\n\n## Deleting a plan\n\nAt the bottom of the Service Detail view there is a **Delete** option. Deleting a plan is permanent, so take a moment to confirm before proceeding. Linked sermon or library items are not affected — only the service plan itself is removed." },
  { slug: "linking-sermons-to-services", title: "Linking Sermons to Service Plans", category: "Service Planning", body: "Sunday Studio connects your sermon preparation to your service planning through a feature called **Build Service from Sermon**. Instead of starting your order of worship from scratch, you can let the Sermon Builder's Worship Integration output seed the full plan.\n\n## How it works\n\nWhen you finish the **Worship Integration** tab in the Sermon Builder, the AI suggests songs, a call to worship, a response, and transitional moments — all tied directly to your sermon's Big Idea. At that point, a **Build Service from Sermon** button appears.\n\nClicking it does three things:\n\n1. **Composes a full service plan** from the Worship Integration content, including all the suggested songs and liturgical moments.\n2. **Creates a sermon slot** in the plan and links it back to your saved sermon.\n3. **Saves the plan** to your Services list, where you can open, edit, and print it.\n\n## The linked pill\n\nOn any service plan, a slot that is linked to a sermon or library item shows a small **bronze pill** next to its title. This is a visual reminder that the slot's content comes from a specific saved item. Hovering the pill shows the linked item's title.\n\nLinked slots retain a snapshot of the content at the time of linking — so if you later edit the sermon, the service plan keeps its original version. You can re-link at any time to pull in updated content.\n\n## Reverse lookup\n\nIf you want to see which service plans reference a particular sermon, open the sermon in the Sermon Builder and look for the **Linked Services** section. Similarly, from the Library, a linked item shows which plans have pulled it in.\n\n## When to use this feature\n\n**Build Service from Sermon** is most useful when the sermon is the anchor of your planning — which it usually is. Write the sermon first, work through the Worship Integration tab, then let the AI compose the service around it. The result is a plan where every element is theologically connected to the Word you're preaching." },
  { slug: "slot-picker", title: "Swapping Slots with Saved Content", category: "Service Planning", body: "The Slot Picker lets you replace any compatible slot in a service plan with a saved sermon or library item. This is useful when you've already prepared content elsewhere and want to pull it directly into the service.\n\n## Opening the Slot Picker\n\nIn the Service Detail view, slots that support linking show a **link icon** next to the title. Clicking it opens the Slot Picker modal.\n\n## What you can link\n\nNot every slot type supports linking — slots like Offering or Announcements are generic enough that they rarely point to a specific saved item. Supported slot types include:\n\n- **Sermon** — links to a saved sermon from your Sermon Archive\n- **Song** — links to a saved song from your Library\n- **Liturgy** — links to a saved call to worship, responsive reading, or other liturgical item\n- **Speaking moment** — links to a saved speaking moment or transition\n\nThe link icon is only shown on slots where linking makes sense.\n\n## Browsing and selecting\n\nThe Slot Picker shows your Library and Sermon Archive, filtered to the relevant kind for each slot. You can search by title and click any result to select it.\n\nOnce selected, the slot's title updates to match the linked item, and a **bronze pill** appears next to the title as a visual indicator. The slot body is also updated with a snapshot of the linked item's content.\n\n## Unlinking a slot\n\nClick the bronze pill on a linked slot to unlink it. The slot reverts to its previous title and body, and the link indicator disappears. You can then edit the slot manually or open the Slot Picker again to choose a different item.\n\n## Content snapshots\n\nLinking creates a snapshot — the slot stores the title and body from the linked item at the moment of linking. If you later edit the original sermon or library item, the service plan keeps its snapshot. Re-open the Slot Picker and re-link to pull in the updated content." },
  { slug: "printing-a-service", title: "Printing or Sharing a Service Plan", category: "Service Planning", body: "Sunday Studio includes a print view for your service plans that produces clean, bulletin-ready output you can print or save as a PDF.\n\n## Opening the print view\n\nFrom the Service Detail page, click the **Print** button or printer icon in the header. This opens a separate print-optimised view of the plan in a new browser tab.\n\n## What the print view includes\n\nThe print view shows:\n\n- The service plan title\n- Each slot's label and title (e.g. \"Opening Song — Great Is Thy Faithfulness\")\n- Body text for each slot, formatted for readability\n- The date the plan was saved\n\nNavigation elements, editing controls, and the sidebar are hidden in the print view so nothing extraneous appears on the printed page.\n\n## Printing to paper\n\nUse your browser's print dialog (Ctrl/Cmd + P) to send the page to your printer. Most printers will render the page cleanly in black and white. If you find the layout cramped, try setting the paper size to Letter and the margins to Narrow in the print dialog.\n\n## Saving as PDF\n\nIn the browser print dialog, choose **Save as PDF** as the destination instead of a physical printer. This creates a PDF you can save, share via email, or send to a team member.\n\n## Sharing with your team\n\nOnce you have a PDF, you can share it by email or through any messaging platform your team uses. If your team uses a church management or planning tool, the PDF can be uploaded there as well.\n\n## Tips\n\n- Review the service plan completely before printing — it's easier to change a slot title before printing than after.\n- If you'd like the plan to include your church's name or logo, add those details to the plan title or the top slot's body text before printing." },
  { slug: "sermon-builder-overview", title: "Sermon Builder Overview", category: "Sermon Builder", body: "The Sermon Builder is Sunday Studio's most comprehensive tool — a three-panel workspace that walks you from initial study all the way through a complete sermon manuscript and worship integration plan.\n\n## The three-panel layout\n\n**Left panel: Context sidebar.** This is where you set up the sermon before generating anything. Enter your Scripture passage, series title, any thematic notes, and the week's date. You can also attach resources from your Resource Library here. The AI reads everything in this panel before generating each tab.\n\n**Centre: Tab rail.** Seven tabs run across the top of the centre panel:\n\n- **Study** — key themes, cross-references, cultural and historical background\n- **Big Idea** — a single-sentence central proposition\n- **Outline** — a structured sermon outline built from the Big Idea\n- **Manuscript** — a full preaching draft\n- **Applications** — practical takeaways for your congregation\n- **Illustrations** — story-based illustrations tied to the sermon's themes\n- **Worship Integration** — song and liturgy suggestions connected to the Big Idea\n\n**Right panel: Output area.** Generated content appears here. You can read, edit, copy, and regenerate each tab independently.\n\n## Starting a new sermon\n\nClick **New Sermon** in the Sermon Builder or navigate to /sermons/new. Fill in at least the Scripture passage and a working title in the context sidebar. Then click **Generate** on the Study tab to begin.\n\n## Working through the tabs\n\nThe tabs are designed to build on each other. A typical flow:\n\n1. Generate **Study** to ground yourself in the text.\n2. Use the **Big Idea** tab to crystallise the central message.\n3. Build the **Outline** from the Big Idea.\n4. Draft the **Manuscript** once the outline feels right.\n5. Generate **Applications** and **Illustrations** to complete the sermon.\n6. Finish with **Worship Integration** to connect the sermon to the service.\n\n## Saving your work\n\nSermons are saved automatically each time you generate a tab. You can also save manually at any time. All your sermons appear in the **Sermon Archive** under the Sermons menu in the sidebar." },
  { slug: "sermon-study-tab", title: "The Study Tab", category: "Sermon Builder", body: "The Study tab is the recommended starting point in the Sermon Builder. It grounds your preparation in the biblical text before any other generation takes place.\n\n## What the Study tab generates\n\nWhen you click **Generate** on the Study tab, the AI reads your Scripture passage (and any context notes in the sidebar) and produces a structured study document that includes:\n\n- **Key themes** — the dominant theological ideas at work in the passage\n- **Cross-references** — related Scripture passages that illuminate the text\n- **Historical and cultural background** — context about the world in which the passage was written\n- **Linguistic notes** — observations on key terms, their meaning, and their significance\n- **Interpretive questions** — open questions worth sitting with as you develop the sermon\n\n## Why start here\n\nGenerating Study first gives every subsequent tab a richer foundation. When the AI produces a Big Idea or an Outline, it draws on the themes and cross-references surfaced in the Study output. Starting with Study — rather than jumping straight to Outline or Manuscript — typically produces more theologically coherent downstream content.\n\n## Using scholarly sources\n\nIf you have scholarly sources enabled in **Settings**, the AI silently consults bundled public-domain commentaries (like Matthew Henry) before generating the Study output. A \"Sources consulted\" footer at the bottom of the Study output shows which commentaries were referenced.\n\n## Editing study notes\n\nThe Study output is fully editable. Many pastors use it as a personal study document — adding their own annotations, highlighting the cross-references they want to follow up, or deleting sections that aren't relevant. You can also regenerate at any time if you want a fresh set of observations.\n\n## Attaching resources\n\nIf you've uploaded commentary excerpts or personal notes to your Resource Library, attach them to the sermon via the context sidebar before generating Study. The AI will incorporate those resources into its analysis, and they'll be referenced throughout the sermon if relevant." },
  { slug: "sermon-big-idea-and-outline", title: "Big Idea & Outline", category: "Sermon Builder", body: "The Big Idea and Outline tabs are the structural heart of the Sermon Builder. Together they define the single governing thought of your sermon and the framework that delivers it.\n\n## The Big Idea tab\n\nThe Big Idea is a single declarative sentence that captures what the sermon is about and what it calls the congregation to believe, feel, or do. It's the kind of sentence Haddon Robinson called the \"homiletical idea\" — the one thing every part of the sermon serves.\n\nWhen you click **Generate** on the Big Idea tab, the AI reads your passage, your study notes (if generated), and any context you've added in the sidebar, and proposes a Big Idea sentence.\n\n**Editing the Big Idea.** The generated sentence is a strong starting point, but the Big Idea is ultimately yours. Edit it until it sounds like your voice and captures exactly what you want your congregation to leave with. The more specific the Big Idea, the stronger the Outline and Manuscript will be — so invest time here.\n\n## The Outline tab\n\nOnce you have a Big Idea you're happy with, the Outline tab builds a sermon structure from it. Click **Generate** and the AI produces a multi-point outline where each movement of the sermon flows from and returns to the Big Idea.\n\nA typical outline includes:\n\n- An introduction that raises the need the Big Idea addresses\n- Two to four main points that develop the Big Idea exegetically\n- A conclusion that calls the congregation to respond\n\n**Editing the Outline.** Outlines are editable. You can rename points, reorder them, add sub-points, or delete sections that don't serve the sermon.\n\n## The relationship between these tabs\n\nA clear Big Idea makes the Outline stronger. A strong Outline makes the Manuscript richer. Spending an extra ten minutes refining the Big Idea before generating the Outline is usually the highest-leverage investment in the Sermon Builder workflow." },
  { slug: "sermon-manuscript", title: "Writing Your Manuscript", category: "Sermon Builder", body: "The Manuscript tab produces a full preaching draft — a complete, word-for-word text of the sermon based on your passage, Big Idea, and Outline.\n\n## When to generate the Manuscript\n\nGenerate the Manuscript after you have a Big Idea and Outline you're satisfied with. The AI builds the manuscript by working through each point in your outline, so a well-structured outline produces a well-structured draft.\n\nIf you generate the Manuscript without a prior outline, the AI will construct its own internal structure. The result is still usable, but starting from an approved outline gives you more control over the sermon's shape.\n\n## What the Manuscript includes\n\nA generated manuscript typically includes:\n\n- An **introduction** that hooks the congregation and raises the sermon's central question\n- **Developed main points**, each with biblical exposition, illustration space, and application\n- **Transitions** between points that remind the listener of the Big Idea\n- A **conclusion** with a call to action or response\n\nThe AI writes in a warm, pastoral voice informed by your church profile. It does not fabricate specific illustrations or attribute quotes to scholars.\n\n## Streaming generation\n\nThe Manuscript is one of the longer generation tasks. The text appears progressively as the AI writes it — you'll see paragraphs appear in real time.\n\n## Editing your draft\n\nThe manuscript is fully editable. Most preachers use it as a first draft and revise extensively — sharpening language, adding personal illustrations, cutting sections that feel weak, and adjusting length. The AI produces solid structure and theological substance; you bring your own voice, stories, and pastoral sensitivity.\n\n## Saving\n\nThe manuscript is saved automatically when generation completes and whenever you make edits. There is no separate \"save manuscript\" step — changes persist as long as you're logged in." },
  { slug: "sermon-applications-and-illustrations", title: "Applications & Illustrations", category: "Sermon Builder", body: "Two of the most practically useful tabs in the Sermon Builder are Applications and Illustrations — they give you concrete material to make the sermon land with your congregation.\n\n## The Applications tab\n\nApplications are the \"so what?\" of the sermon — specific, actionable responses the congregation can take in response to the text. Good applications are concrete enough to picture, relevant enough to matter this week, and varied enough to speak to different life situations in the room.\n\nWhen you click **Generate** on the Applications tab, the AI reads your passage, Big Idea, and any context notes, and produces a list of practical applications. These are grouped by life context — relationships, work, family, faith practices — so you can choose the ones that best fit your congregation's current season.\n\n**Using applications in the manuscript.** You can copy any application from this tab and paste it directly into the relevant point in your Manuscript.\n\n## The Illustrations tab\n\nIllustrations are brief, story-based examples that make abstract theological truths concrete. The Illustrations tab generates a set of story hooks — scenarios, historical moments, or everyday situations — tied to the themes of your passage.\n\n**Important note:** The AI generates **story hooks and scenarios**, not fully sourced stories. These are starting points that you fill in with your own research, experience, or verified sources. The AI does not fabricate specific people, dates, or quotations.\n\n## Regenerating\n\nBoth tabs support regeneration. If the first set of applications feels generic or the illustrations don't resonate, click **Generate** again.\n\n## Saving to the Library\n\nIndividual applications and illustrations can be saved to your Library for later use across different sermons and series." },
  { slug: "sermon-worship-integration", title: "Worship Integration", category: "Sermon Builder", body: "The Worship Integration tab is where the Sermon Builder connects to your full service plan. It produces song and liturgy suggestions woven around your sermon's Big Idea, so that every part of the service speaks with one voice.\n\n## What Worship Integration generates\n\nWhen you click **Generate** on the Worship Integration tab, the AI produces:\n\n- **Song suggestions** for each moment in the service — opener, gathering set, response, and sending — selected for their thematic connection to the Big Idea\n- **A call to worship** drawn from the sermon's passage or theme\n- **A sending benediction** that echoes the sermon's central call\n- **Transitional notes** for spoken moments between elements\n\nIf you have a Song Repertoire set up in your Library, the AI biases its song suggestions toward songs your congregation already knows.\n\n## Using \"Build Service from Sermon\"\n\nAt the bottom of the Worship Integration output, you'll find a **Build Service from Sermon** button. Clicking it:\n\n1. Takes the song and liturgy suggestions from this tab\n2. Composes a full order of worship around them\n3. Creates a linked sermon slot in the service plan\n4. Saves the plan directly to your Services list\n\nThis is the fastest way to move from a finished sermon to a complete service plan.\n\n## When to generate Worship Integration\n\nMost pastors find it most useful to generate Worship Integration after the Big Idea is solid — even before the full manuscript is complete. The Big Idea is what shapes the worship arc, so you don't need a finished sermon to build a theologically integrated service plan." },
  { slug: "song-assistant", title: "Song Assistant", category: "AI Generators", body: "The Song Assistant helps you find songs that fit your Scripture passage, theme, or season — drawing from a broad knowledge of contemporary worship and hymns, and optionally filtering to songs your congregation already knows.\n\n## Getting started\n\nNavigate to **Generators → Songs** in the sidebar. You'll see a form where you can enter:\n\n- **Scripture passage or theme** — what the service is about (e.g. \"Psalm 23\" or \"God's faithfulness in suffering\")\n- **Service moment** — where in the service the songs will be used (Opening, Response, Communion, Sending, etc.)\n- **Additional notes** — tempo, mood, instrumentation, or any other guidance\n\n## The Repertoire control\n\nThe Song Assistant has a three-state control for how it uses your Song Repertoire:\n\n**Prefer (default).** The AI deliberately mixes familiar repertoire songs with strong new discoveries when both are available. This is the best setting when you want a balanced blend of songs your team knows and songs worth exploring.\n\n**Strict.** The AI only suggests songs from your repertoire. Use this when your team needs to work exclusively from songs they already know. Strict mode is only available when you have at least one song in your repertoire.\n\n**Off.** The AI excludes songs already in your repertoire and suggests songs outside that list. Use this when you're intentionally exploring new material or planning a special service.\n\n## Reading the results\n\nEach suggested song shows its title, artist, and a brief note explaining why it fits the theme or moment. Songs that are already in your repertoire are marked with a star indicator.\n\n## Saving songs\n\nClick **Save to Library** on any song to add it to your Library. From there it can be linked to a service plan slot or referenced in future planning sessions. You can also star a song from the results to add it directly to your repertoire." },
  { slug: "song-repertoire", title: "Managing Your Song Repertoire", category: "AI Generators", body: "Your Song Repertoire is a list of songs your congregation knows and sings regularly. When you build it out, the Song Assistant and Service Builder can prefer these familiar songs in their suggestions — making it easier to plan services around what your worship team already plays.\n\n## Where to find the Repertoire\n\nNavigate to **Library** in the sidebar and click the **Our Repertoire** tab. This shows all songs you've marked as part of your repertoire, sorted alphabetically.\n\n## Adding songs one at a time\n\nUse the **Add a song** form at the top of the Repertoire tab. Enter the song title and optionally the artist, then click Add. The song is immediately added to your repertoire and available to the Song Assistant.\n\n## Pasting a bulk list\n\nIf you have an existing song list, use the **Paste a list** button. This opens a modal where you can paste lines of text in any of these formats: Title, Title - Artist, or Title — Artist. The system parses each line, deduplicates against songs already in your repertoire, and adds only the new ones.\n\n## Starring songs from the Library\n\nAny song in your Library can be starred to add it to your repertoire. Click the star icon on any song card to toggle its repertoire status.\n\n## How the Repertoire affects generation\n\nWhen you use the Song Assistant with **Prefer**, **Off**, or **Strict** mode, the AI receives the relevant repertoire context before generating suggestions. **Prefer** mixes familiar and new songs when both are viable. **Off** excludes exact title matches from your repertoire. **Strict** only returns songs that appear in your repertoire.\n\nThe Service Builder and the Sermon Builder's Worship Integration tab always use Prefer mode automatically.\n\n## Removing songs\n\nTo remove a song from your repertoire, click the star again on its Library card to unstar it. The song remains in your Library as a saved item — only its repertoire flag is cleared." },
  { slug: "liturgy-generator", title: "Liturgy Generator", category: "AI Generators", body: "The Liturgy Generator creates calls to worship, responsive readings, prayers of confession, affirmations of faith, benedictions, and other liturgical elements — tailored to your passage, season, and congregation.\n\n## Getting started\n\nNavigate to **Generators → Liturgy** in the sidebar. The form asks for:\n\n- **Scripture passage or theme** — the anchor for the liturgical piece\n- **Type of liturgical element** — call to worship, prayer, responsive reading, benediction, etc.\n- **Tone and style** — formal or conversational, ancient or contemporary\n- **Any additional notes** — seasonal context, a specific liturgical occasion\n\n## What the generator produces\n\nThe output is a formatted liturgical text ready to use as written or as a starting point for your own revision. Responsive readings include clear Leader/People formatting. Prayers are structured with opening, body, and close. Calls to worship are designed to be heard aloud.\n\nThe AI writes in a voice informed by your church profile — so a traditionally liturgical church and a contemporary evangelical church will receive stylistically different outputs even for the same passage.\n\n## Editing the output\n\nThe generated text is fully editable. Many pastors keep the structure and Scripture language but adjust phrasing to match the rhythm of their own speech.\n\n## Saving to the Library\n\nClick **Save to Library** to store the liturgical element. Saved liturgy items can be linked to service plan slots, browsed in the Library, or recalled in future seasons when the same passage or theme comes around again.\n\n## Seasonal liturgy\n\nThe Liturgy Generator is particularly useful for seasons like Advent, Lent, Holy Week, and Easter. Include the season in your context notes for output that reflects the appropriate liturgical register." },
  { slug: "speaking-moment-generator", title: "Speaking Moment Generator", category: "AI Generators", body: "The Speaking Moment Generator creates brief spoken scripts for the transitions, announcements, and pastoral addresses that hold a service together — the moments between the music and the message.\n\n## What it's for\n\nEvery service has moments that require a few words from the pastor or worship leader: welcoming the congregation, introducing the offering, transitioning from worship into the sermon, or closing with a sending word. The Speaking Moment Generator gives you a well-crafted first draft for any of these moments in seconds.\n\n## Getting started\n\nNavigate to **Generators → Speaking Moment** in the sidebar. The form asks for:\n\n- **The type of moment** — welcome, offering intro, sermon intro, transition, closing send, or custom\n- **Scripture or theme** — the thread you want the moment to connect to\n- **Length** — a brief note (one or two paragraphs) or a longer address\n- **Tone** — warm and conversational, celebratory, reflective, etc.\n\n## Typical use cases\n\n- **Welcome and greeting** — A warm, specific opening that acknowledges the congregation and sets the service's emotional tone.\n- **Offering introduction** — A few sentences that give the offering theological context rather than treating it as an administrative moment.\n- **Sermon intro bridge** — A transitional paragraph that lands from the final worship song and opens into the sermon.\n- **Congregational instruction** — A brief explanation of a liturgical practice for visitors.\n- **Sending and dismissal** — A brief, energising close that sends the congregation into the week.\n\n## Editing and using the output\n\nThe generated script is yours to use as written, edit freely, or treat as a structural prompt for something you'd rather say in your own words. Save it to the Library to reuse or adapt in future services." },
  { slug: "devotional-generator", title: "Devotional Generator", category: "AI Generators", body: "The Devotional Generator creates short, focused devotionals for staff meetings, mid-week gatherings, small group openers, personal reflection, or any context where you need a brief, grounded word.\n\n## Getting started\n\nNavigate to **Generators → Devotional** in the sidebar. The form asks for:\n\n- **Scripture passage** — the text for the devotional\n- **Setting or audience** — staff meeting, small group, personal devotion, prayer meeting, youth group, etc.\n- **Theme or focus** — an optional clarifying note about what aspect of the passage to emphasise\n- **Length** — short (a few paragraphs) or medium (a full page)\n\n## What a devotional includes\n\nA generated devotional typically includes:\n\n- An **opening observation** that enters the passage from an angle relevant to the setting\n- A **brief exposition** of one or two key verses\n- A **reflection prompt or application** — something to sit with or act on\n- A **closing prayer or benediction**\n\nThe length and formality are calibrated to the setting you specify.\n\n## Saving and reusing\n\nDevotionals are saved to your Library when you click **Save**. From the Library, you can browse them by kind, search by keyword, or link them to a service plan's devotional slot.\n\nDevotionals are also useful as seed material for longer sermons — if a brief devotional on a passage resonates, you can paste its insight into the Sermon Builder's context sidebar and let the AI build from there.\n\n## A note on brevity\n\nDevotionals are intentionally brief by design. The goal is a few minutes of focused reflection, not a full sermon. If you find the output feels too compressed, try requesting a medium-length devotional or adding a note asking for more depth on a particular point." },
  { slug: "resource-library", title: "Resource Library", category: "Resources", body: "The Resource Library is where you store commentary excerpts, personal notes, and outside research that the Sermon Builder's AI can read during generation. It's the bridge between your own study and the AI's output.\n\n## What goes in the Resource Library\n\nThe Resource Library is designed for **textual sources** — not files, not links, but actual text that you want the AI to be able to read. Common uses include:\n\n- Excerpts from commentaries you own (copied and pasted in)\n- Personal exegetical notes from prior study\n- Quotes from theologians or preachers you want to engage with\n- Cross-referenced material from other sermons or series\n\n## Adding a resource\n\nNavigate to **Resources** in the sidebar. Click **Add Resource** and fill in:\n\n- **Title** — the name of the source (e.g. \"Spurgeon on Psalm 23\")\n- **Author** — optional, but helpful for tracking sources\n- **Excerpt** — the actual text you want the AI to read\n\n## Attaching resources to a sermon\n\nAdding a resource to the library doesn't automatically make the AI read it. You need to **attach** it to a specific sermon via the Sermon Builder's context sidebar. In the sidebar, look for the **Resources** section and select the resources you want the AI to consult for this sermon.\n\nOnce attached, the AI reads the resource excerpt during each generation step and may reference it in the Study, Big Idea, Outline, or Manuscript outputs.\n\n## Scholarly integrity\n\nSunday Studio's AI safety rules prevent it from generating fabricated commentary quotes. If a resource excerpt contains a quotation you want to include in the sermon, copy it manually from the resource into the manuscript — the AI will not invent quotations on your behalf." },
  { slug: "scholarly-sources", title: "Scholarly Sources", category: "Resources", body: "Sunday Studio includes a library of bundled public-domain commentaries that the Sermon Builder can consult silently when preparing sermon content. These are classic works whose copyright has expired, made available to pastors as a free scholarly layer beneath every generation.\n\n## What's included\n\nThe initial release includes **Matthew Henry's Concise Commentary** — a complete, chapter-by-chapter commentary covering all 66 books of the Bible. Henry (1662–1714) was a Nonconformist minister whose commentary remains one of the most widely read in evangelical history. Additional commentaries are in preparation for future releases.\n\n## How the AI uses them\n\nWhen the Sermon Builder generates the Study tab, it silently looks up commentary material for your passage from whichever sources you've enabled. This material is used to **inform** the AI's analysis — it grounds the output in established interpretation rather than the model's own reasoning alone.\n\nAt the bottom of the Study tab output, a **\"Sources consulted\"** footer shows which commentaries were referenced for your passage.\n\n## Enabling and disabling sources\n\nGo to **Settings** (the gear icon in the sidebar) and scroll to the **Scholarly Sources** section. Each available source has a toggle. You can turn sources on or off individually — changes take effect immediately for subsequent generations.\n\nBy default, Matthew Henry's Concise Commentary is enabled.\n\n## When to turn sources off\n\nSources are always optional. You might turn them off if:\n\n- You're working from a passage where the commentary's perspective doesn't align with your tradition\n- You're preparing a devotional or speaking moment where scholarly background isn't needed\n- You want to experience the AI's output without any scholarly influence for comparison\n\nYou can turn them back on at any time." },
  { slug: "your-library", title: "Your Library", category: "Library", body: "The Library is where every piece of AI-generated content you choose to save ends up — songs, liturgy, speaking moments, devotionals, applications, illustrations, and more. Think of it as your creative filing cabinet, searchable and organised by type.\n\n## What's in the Library\n\nThe Library holds **outputs from the AI generators** that you've explicitly saved. Nothing lands here automatically — you always choose to save. This keeps the Library from becoming cluttered with drafts you didn't intend to keep.\n\nItems are organised by kind: Songs, Liturgy, Speaking moments, Devotionals, Applications, Illustrations, and Other.\n\n## Browsing and searching\n\nAt the top of the Library page, a tab bar lets you filter by kind. Each tab shows only that type of saved item. You can also use the search field to find items by title or content keyword.\n\n## The Repertoire tab\n\nSongs saved to the Library have a special sub-category: the **Our Repertoire** tab. Songs starred as part of your repertoire appear here, sorted alphabetically. See *Managing Your Song Repertoire* for details.\n\n## Using Library items\n\nFrom the Library, you can:\n\n- **Link a saved item to a service plan slot** via the Slot Picker in the Service Detail view\n- **Copy the text** to paste into a manuscript, email, or bulletin\n- **Delete items** you no longer need (permanent — there is no trash)\n\n## The difference between Library and Resource Library\n\nThe **Library** stores AI-generated outputs — content the AI wrote that you've chosen to keep.\n\nThe **Resource Library** stores text sources you bring in yourself — commentary excerpts, personal notes, outside research — for the AI to read during generation.\n\nThese are two separate places with two different purposes. The Library is your output archive. The Resource Library is your input archive." },
  { slug: "settings-and-billing", title: "Settings & Billing", category: "Account & Settings", body: "The Settings page is where you manage your account, configure scholarly sources, and access billing. Navigate there via the gear icon at the bottom of the sidebar or at /settings.\n\n## Account information\n\nThe top section of Settings shows your name and email address as registered with your account. If you need to update your email, use the account management link provided in that section.\n\n## Scholarly Sources\n\nThe **Scholarly Sources** panel lists the bundled public-domain commentaries available in Sunday Studio. Each source has a toggle — flip it on to include that commentary in Sermon Builder generations, flip it off to exclude it.\n\nBy default, Matthew Henry's Concise Commentary is enabled. As new commentaries are added to the library, they'll appear here with their own toggle. Changes take effect immediately for all subsequent generations.\n\nSee the *Scholarly Sources* article for more detail on what these sources are and how the AI uses them.\n\n## Managing your subscription\n\nSunday Studio is a subscription service. The **Billing** section of Settings shows your current plan and links to the billing portal where you can:\n\n- View your current plan and renewal date\n- Update your payment method\n- Download past invoices\n- Cancel your subscription\n\n## Trial accounts\n\nIf you're in a free trial, the Settings page shows how many days remain. Trial accounts have access to all features — nothing is held back during the trial period. When the trial ends, you'll need a paid subscription to continue generating content.\n\n## Signing out\n\nClick **Sign out** at the bottom of the Settings page to end your session. Your data remains saved in your account — signing out doesn't delete anything." },
] as const;

router.post(
  "/admin/help-articles/seed",
  requireAuth,
  requireOwner,
  async (req: Request, res: Response) => {
    try {
      let inserted = 0;
      let skipped = 0;
      for (const article of SEED_ARTICLES) {
        const result = await db
          .insert(helpArticlesTable)
          .values({ ...article, published: true })
          .onConflictDoNothing({ target: helpArticlesTable.slug })
          .returning({ id: helpArticlesTable.id });
        if (result.length > 0) inserted++;
        else skipped++;
      }
      req.log.info({ inserted, skipped }, "seeded help articles");
      res.json({ inserted, skipped, total: SEED_ARTICLES.length });
    } catch (err) {
      req.log.error({ err }, "seed help articles failed");
      res.status(500).json({ error: "Failed to seed help articles" });
    }
  },
);

router.put(
  "/admin/help-articles/article-order",
  requireAuth,
  requireOwner,
  async (req: Request, res: Response) => {
    try {
      const parsed = z
        .object({ category: z.string().min(1), ids: z.array(z.number().int()).min(1) })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid request body" });
        return;
      }
      const { category, ids } = parsed.data;
      // Write each article's new position; ignore ids that don't belong to this category
      await db.transaction(async (tx) => {
        for (let i = 0; i < ids.length; i++) {
          await tx
            .update(helpArticlesTable)
            .set({ position: i })
            .where(
              sql`${helpArticlesTable.id} = ${ids[i]} AND ${helpArticlesTable.category} = ${category}`,
            );
        }
      });
      res.json({ category, ids });
    } catch (err) {
      req.log.error({ err }, "admin set help article order failed");
      res.status(500).json({ error: "Failed to save article order" });
    }
  },
);

router.put(
  "/admin/help-articles/:id",
  requireAuth,
  requireOwner,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id ?? ""), 10);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid article id" });
        return;
      }
      const parsed = helpArticleBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const [article] = await db
        .update(helpArticlesTable)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(helpArticlesTable.id, id))
        .returning();
      if (!article) {
        res.status(404).json({ error: "Article not found" });
        return;
      }
      res.json(article);
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "23505"
      ) {
        res.status(409).json({ error: "A help article with that slug already exists" });
        return;
      }
      req.log.error({ err }, "admin update help article failed");
      res.status(500).json({ error: "Failed to update help article" });
    }
  },
);

router.delete(
  "/admin/help-articles/:id",
  requireAuth,
  requireOwner,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id ?? ""), 10);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid article id" });
        return;
      }
      const [deleted] = await db
        .delete(helpArticlesTable)
        .where(eq(helpArticlesTable.id, id))
        .returning({ id: helpArticlesTable.id });
      if (!deleted) {
        res.status(404).json({ error: "Article not found" });
        return;
      }
      res.status(204).end();
    } catch (err) {
      req.log.error({ err }, "admin delete help article failed");
      res.status(500).json({ error: "Failed to delete help article" });
    }
  },
);

export default router;
