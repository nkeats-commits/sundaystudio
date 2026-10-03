import { and, eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { EVENTS } from "./eventRegistry";
import { recordTrialEvent } from "./trialAnalytics";
import type { Logger } from "pino";
import {
  isCardBackedTrialSubscription,
  stripeReferenceId,
  type TrialingSubscription,
} from "./trialEnrollment";

/**
 * Stores Stripe's confirmed trial_start as the sole trial-clock anchor.
 * The pending→enrolled conditional update is the idempotency boundary shared
 * by Checkout returns and Stripe webhooks.
 */
export async function confirmTrialEnrollment(
  userId: string,
  customerId: string,
  subscription: TrialingSubscription,
  log?: Logger,
): Promise<boolean> {
  if (
    !isCardBackedTrialSubscription(subscription) ||
    stripeReferenceId(subscription.customer) !== customerId
  ) {
    return false;
  }

  const [claimed] = await db
    .update(usersTable)
    .set({
      trialStartedAt: new Date(subscription.trial_start! * 1000),
      trialEndsAt: new Date(subscription.trial_end! * 1000),
      trialEnrollmentStatus: "enrolled",
      trialEnrollmentSessionId: null,
    })
    .where(
      and(
        eq(usersTable.id, userId),
        eq(usersTable.stripeCustomerId, customerId),
        eq(usersTable.trialEnrollmentStatus, "pending"),
      ),
    )
    .returning({ id: usersTable.id });

  if (claimed) {
    await recordTrialEvent(
      userId,
      EVENTS.TRIAL_STARTED,
      {
        source: "stripe_trial_confirmation",
        stripeSubscriptionId: subscription.id,
        trialStartedAt: new Date(subscription.trial_start! * 1000).toISOString(),
        trialEndsAt: new Date(subscription.trial_end! * 1000).toISOString(),
      },
      log,
    );
    return true;
  }

  // Concurrent webhook/return verification may already have claimed the
  // transition. Treat that as confirmed without rewriting the original date.
  const [current] = await db
    .select({ trialEnrollmentStatus: usersTable.trialEnrollmentStatus })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.id, userId),
        eq(usersTable.stripeCustomerId, customerId),
      ),
    )
    .limit(1);
  return current?.trialEnrollmentStatus === "enrolled";
}