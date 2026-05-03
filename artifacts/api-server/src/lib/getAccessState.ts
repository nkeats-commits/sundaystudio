import { sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const TRIAL_DAYS = 14;

/**
 * The single union type used everywhere we need to know whether a user is
 * allowed to use the paid features (AI generators, mutations, etc.).
 *
 * Discriminated by `kind` so consumers can switch over it without a bunch
 * of boolean flags.
 */
export type AccessState =
  | { kind: "trial"; daysLeft: number; trialEndsAt: string }
  | { kind: "active"; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean }
  | { kind: "trialing"; currentPeriodEnd: string | null }
  | { kind: "past_due"; currentPeriodEnd: string | null }
  | { kind: "canceled" }
  | { kind: "expired"; trialEndedAt: string };

/** True iff the state allows the user to perform paid actions right now. */
export function isAccessAllowed(state: AccessState): boolean {
  return (
    state.kind === "trial" ||
    state.kind === "active" ||
    state.kind === "trialing"
  );
}

/**
 * Compute the user's billing access state.
 *
 * Source of truth, in order:
 *   1. Active / trialing / past_due / canceled subscription mirrored into
 *      the `stripe.subscriptions` table by stripe-replit-sync.
 *   2. Otherwise, the local 14-day trial window from `users.trial_started_at`.
 *
 * If the `stripe` schema doesn't exist yet (Stripe integration not connected)
 * we fall back silently to the local trial — the app still works for trial
 * users; only paid-state features are unreachable.
 */
export async function getAccessState(userId: string): Promise<AccessState> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    // Should never happen — requireAuth upserts before calling us — but be
    // defensive: treat unknown users as expired.
    return { kind: "expired", trialEndedAt: new Date(0).toISOString() };
  }

  // Look up the most-recent subscription row, if Stripe is connected and the
  // user has a customer id.
  if (user.stripeCustomerId) {
    try {
      const result = await db.execute(sql`
        SELECT id, status, current_period_end, cancel_at_period_end
        FROM stripe.subscriptions
        WHERE customer = ${user.stripeCustomerId}
        ORDER BY created DESC
        LIMIT 1
      `);
      const row = result.rows[0] as
        | {
            id: string;
            status: string;
            current_period_end: number | string | Date | null;
            cancel_at_period_end: boolean | null;
          }
        | undefined;

      if (row) {
        const periodEndIso = toIsoFromUnixOrDate(row.current_period_end);
        switch (row.status) {
          case "active":
            return {
              kind: "active",
              currentPeriodEnd: periodEndIso,
              cancelAtPeriodEnd: !!row.cancel_at_period_end,
            };
          case "trialing":
            return { kind: "trialing", currentPeriodEnd: periodEndIso };
          case "past_due":
          case "unpaid":
            return { kind: "past_due", currentPeriodEnd: periodEndIso };
          case "canceled":
          case "incomplete_expired":
            // Stripe state takes precedence: a real canceled subscription
            // is canonical regardless of where the local trial clock sits.
            return { kind: "canceled" };
          case "incomplete":
          case "paused":
            // Treat as past_due (no access) — explicit, not silent allow.
            return { kind: "past_due", currentPeriodEnd: periodEndIso };
          default:
            // Unknown future statuses: be conservative, no access.
            return { kind: "past_due", currentPeriodEnd: periodEndIso };
        }
      }
    } catch (err) {
      // stripe schema missing or DB hiccup — fall through to local trial.
      // We deliberately don't surface this; trial users can still work.
      void err;
    }
  }

  // No active subscription — compute trial state from the local clock.
  const trialStart = user.trialStartedAt ?? user.createdAt;
  const trialEndMs =
    new Date(trialStart).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  if (now < trialEndMs) {
    const daysLeft = Math.max(
      0,
      Math.ceil((trialEndMs - now) / (24 * 60 * 60 * 1000)),
    );
    return {
      kind: "trial",
      daysLeft,
      trialEndsAt: new Date(trialEndMs).toISOString(),
    };
  }
  // No real Stripe subscription row was found above (only a customer record
  // may exist from an abandoned checkout).  Treat the user as a plain
  // trial-expired user — `canceled` is reserved for actual canceled
  // subscriptions in `stripe.subscriptions`.
  return {
    kind: "expired",
    trialEndedAt: new Date(trialEndMs).toISOString(),
  };
}

function toIsoFromUnixOrDate(
  v: number | string | Date | null | undefined,
): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") {
    // Stripe stores period_end as unix seconds.
    return new Date(v * 1000).toISOString();
  }
  // Could be an ISO string or a numeric string.
  const n = Number(v);
  if (!Number.isNaN(n) && n > 0 && n < 1e12) {
    return new Date(n * 1000).toISOString();
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
