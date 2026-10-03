import { sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { confirmTrialEnrollment } from "./confirmTrialEnrollment";
import { getUncachableStripeClient } from "./stripeClient";
import {
  isCardBackedTrialSubscription,
  stripeReferenceId,
  type TrialingSubscription,
} from "./trialEnrollment";

export const TRIAL_DAYS = 14;

/**
 * The single union type used everywhere we need to know whether a user is
 * allowed to use the paid features (AI generators, mutations, etc.).
 *
 * Discriminated by `kind` so consumers can switch over it without a bunch
 * of boolean flags.
 */
export type AccessState =
  | { kind: "enrollment_required" }
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

export function getLocalTrialAccessState({
  enrollmentStatus,
  trialStartedAt,
  trialEndsAt,
  createdAt,
  now = Date.now(),
}: {
  enrollmentStatus: "pending" | "enrolled" | "expired";
  trialStartedAt: Date | string | null;
  trialEndsAt?: Date | string | null;
  createdAt: Date | string;
  now?: number;
}): AccessState {
  if (enrollmentStatus === "pending") {
    return { kind: "enrollment_required" };
  }

  // An expired status is an explicit ineligibility marker, even if a legacy
  // timestamp is malformed or close to the migration boundary.
  if (enrollmentStatus !== "enrolled" || !trialStartedAt) {
    const priorStart = trialStartedAt ?? createdAt;
    return {
      kind: "expired",
      trialEndedAt: new Date(
        new Date(priorStart).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString(),
    };
  }

  const trialEndMs = trialEndsAt
    ? new Date(trialEndsAt).getTime()
    : new Date(trialStartedAt).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  if (now < trialEndMs) {
    return {
      kind: "trial",
      daysLeft: Math.max(
        0,
        Math.ceil((trialEndMs - now) / (24 * 60 * 60 * 1000)),
      ),
      trialEndsAt: new Date(trialEndMs).toISOString(),
    };
  }
  return {
    kind: "expired",
    trialEndedAt: new Date(trialEndMs).toISOString(),
  };
}

export function getStripeSubscriptionAccessState(
  status: string,
  currentPeriodEnd: string | null,
  cancelAtPeriodEnd: boolean | null,
  enrollmentStatus: "pending" | "enrolled" | "expired",
): AccessState {
  switch (status) {
    case "active":
      // A paid subscriber is not required to re-enter a payment method,
      // regardless of a legacy local trial-enrollment marker.
      return {
        kind: "active",
        currentPeriodEnd,
        cancelAtPeriodEnd: !!cancelAtPeriodEnd,
      };
    case "trialing":
      return enrollmentStatus === "enrolled"
        ? { kind: "trialing", currentPeriodEnd }
        : { kind: "enrollment_required" };
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "paused":
      return { kind: "past_due", currentPeriodEnd };
    case "canceled":
    case "incomplete_expired":
      return { kind: "canceled" };
    default:
      return { kind: "past_due", currentPeriodEnd };
  }
}

/**
 * Compute the user's billing access state.
 *
 * Source of truth, in order:
 *   1. Active / trialing / past_due / canceled subscription mirrored into
 *      the `stripe.subscriptions` table by stripe-replit-sync.
 *   2. Otherwise, a local 14-day window created only after Stripe confirms a
 *      card-backed trial. Pending and expired enrollments never grant access.
 *
 * If the `stripe` schema doesn't exist yet (Stripe integration not connected)
 * we fall back silently to the local trial — the app still works for trial
 * users; only paid-state features are unreachable.
 */
export async function getAccessState(userId: string): Promise<AccessState> {
  const [user] = await db
    .select({
      stripeCustomerId: usersTable.stripeCustomerId,
      trialStartedAt: usersTable.trialStartedAt,
      trialEndsAt: usersTable.trialEndsAt,
      trialEnrollmentStatus: usersTable.trialEnrollmentStatus,
      createdAt: usersTable.createdAt,
    })
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
        if (
          row.status === "trialing" &&
          user.trialEnrollmentStatus === "pending"
        ) {
          // Preserve a pre-migration Stripe trial only when Stripe itself
          // confirms a 14-day trial with a saved payment method. A local
          // cardless trial has no Stripe subscription and cannot pass this.
          try {
            const stripe = await getUncachableStripeClient();
            const liveSubscription = await stripe.subscriptions.retrieve(row.id);
            const subscription =
              liveSubscription as unknown as TrialingSubscription;
            if (
              isCardBackedTrialSubscription(subscription) &&
              stripeReferenceId(subscription.customer) ===
                user.stripeCustomerId
            ) {
              const confirmed = await confirmTrialEnrollment(
                userId,
                user.stripeCustomerId,
                subscription,
              );
              if (confirmed) {
                const trialEndsAt = new Date(subscription.trial_end! * 1000);
                return {
                  kind: "trial",
                  daysLeft: Math.max(
                    0,
                    Math.ceil(
                      (trialEndsAt.getTime() - Date.now()) /
                        (24 * 60 * 60 * 1000),
                    ),
                  ),
                  trialEndsAt: trialEndsAt.toISOString(),
                };
              }
            }
          } catch {
            // If Stripe cannot verify the old subscription, keep access
            // blocked until the user completes a verified enrollment flow.
          }
        }
        if (
          row.status === "trialing" &&
          user.trialEnrollmentStatus === "enrolled"
        ) {
          return getLocalTrialAccessState({
            enrollmentStatus: user.trialEnrollmentStatus,
            trialStartedAt: user.trialStartedAt,
            trialEndsAt: user.trialEndsAt,
            createdAt: user.createdAt,
          });
        }
        if (
          row.status === "incomplete" &&
          user.trialEnrollmentStatus === "enrolled"
        ) {
          const confirmedTrial = getLocalTrialAccessState({
            enrollmentStatus: user.trialEnrollmentStatus,
            trialStartedAt: user.trialStartedAt,
            trialEndsAt: user.trialEndsAt,
            createdAt: user.createdAt,
          });
          if (confirmedTrial.kind === "trial") return confirmedTrial;
        }
        return getStripeSubscriptionAccessState(
          row.status,
          periodEndIso,
          row.cancel_at_period_end,
          user.trialEnrollmentStatus,
        );
      }
    } catch (err) {
      // stripe schema missing or DB hiccup — fall through to local trial.
      // We deliberately don't surface this; trial users can still work.
      void err;
    }
  }

  // No active subscription — compute access from the Stripe-confirmed local
  // trial anchor; the account creation timestamp is never used as a start.
  return getLocalTrialAccessState({
    enrollmentStatus: user.trialEnrollmentStatus,
    trialStartedAt: user.trialStartedAt,
    trialEndsAt: user.trialEndsAt,
    createdAt: user.createdAt,
  });
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
