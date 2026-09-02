/**
 * Trial lifecycle event cron.
 *
 * Fires two Resend Automations events per user (idempotent — each fires at
 * most once), replacing the previous direct email.send() calls.
 * Resend Automation workflows handle the actual email delivery.
 *
 *   1. Day-11 → `trial_expiring`  ("3 days left in your trial")
 *   2. Day-14 → `trial_expired`   ("Your trial has ended")
 *
 * Both queries skip users who already have a Stripe subscription row
 * (active or trialing) so paying customers are never targeted.
 *
 * Schedule: called once at boot (to catch any missed sends) then every 24 h.
 */

import { sql } from "drizzle-orm";
import { db, usersTable, libraryItemsTable, servicePlansTable, sermonsTable } from "@workspace/db";
import { isNull, isNotNull, and, lte, gt, eq } from "drizzle-orm";
import { logger } from "./logger";
import { EVENTS } from "./eventRegistry";
import { recordTrialEvent } from "./trialAnalytics";

const TRIAL_DAYS = 14;
const MIDPOINT_DAY = 7;
const REMINDER_DAY = 11; // fire trial_expiring on day 11 (3 days before expiry)
const FINAL_REMINDER_DAY = 13;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns true if we should skip the event for this user.
 *
 * Fail-closed: if the user has a stripeCustomerId but the subscription
 * lookup fails for any reason (schema missing, DB hiccup, etc.), we skip
 * the event rather than risk targeting an active subscriber.
 */
async function shouldSkipEvent(user: { stripeCustomerId: string | null }): Promise<boolean> {
  if (!user.stripeCustomerId) return false; // no Stripe record → free trial, fire event

  try {
    const result = await db.execute(sql`
      SELECT id FROM stripe.subscriptions
      WHERE customer = ${user.stripeCustomerId}
        AND status IN ('active', 'trialing')
      LIMIT 1
    `);
    // Active/trialing subscriber → skip
    return (result.rows.length ?? 0) > 0;
  } catch {
    // Stripe schema missing or DB error → fail-closed, skip the event
    return true;
  }
}

export async function runTrialEmailCron(): Promise<void> {
  const cronLog = logger.child({ cron: "trialEmails" });
  cronLog.info("Trial event cron starting");

  const now = new Date();
  const usageContext = async (userId: string) => {
    const [[{ value: servicePlans = 0 } = {}], [{ value: sermons = 0 } = {}], [{ value: libraryItems = 0 } = {}]] =
      await Promise.all([
        db.select({ value: sql<number>`count(*)` }).from(servicePlansTable).where(sql`user_id = ${userId}`),
        db.select({ value: sql<number>`count(*)` }).from(sermonsTable).where(sql`user_id = ${userId}`),
        db.select({ value: sql<number>`count(*)` }).from(libraryItemsTable).where(sql`user_id = ${userId}`),
      ]);
    return {
      servicePlans: Number(servicePlans),
      sermons: Number(sermons),
      libraryItems: Number(libraryItems),
    };
  };

  const fireEmailEvent = async (
    user: typeof reminderCandidates[number],
    eventName: string,
    stamp: "trialMidpointEmailSentAt" | "trialFinalReminderEmailSentAt" | "trialReminderSentAt" | "trialExpiredEmailSentAt",
  ) => {
    if (!user.email || (await shouldSkipEvent(user))) return;
    const deliveredContext = await usageContext(user.id);
    const delivered = await recordTrialEvent(user.id, eventName, {
      firstName: user.firstName,
      trialStartedAt: user.trialStartedAt?.toISOString(),
      pricingPath: "/pricing",
      workflowPath: deliveredContext.servicePlans > 0 ? "/services" : "/dashboard",
      ...deliveredContext,
    }, cronLog);
    if (delivered) {
      await db.update(usersTable).set({ [stamp]: now }).where(eq(usersTable.id, user.id));
    } else {
      cronLog.warn({ userId: user.id, eventName }, "trial email delivery failed — stamp not set");
    }
  };

  // ── trial_midpoint: value recap around day 7 ─────────────────────────────
  const midpointEnd = new Date(now.getTime() - MIDPOINT_DAY * DAY_MS);
  const midpointStart = new Date(now.getTime() - (MIDPOINT_DAY + 1) * DAY_MS);
  const midpointCandidates = await db.select().from(usersTable).where(and(
    isNull(usersTable.trialMidpointEmailSentAt),
    isNotNull(usersTable.email),
    lte(usersTable.trialStartedAt, midpointEnd),
    gt(usersTable.trialStartedAt, midpointStart),
  ));
  for (const user of midpointCandidates) {
    try {
      await fireEmailEvent(user, EVENTS.TRIAL_MIDPOINT, "trialMidpointEmailSentAt");
    } catch (err) {
      cronLog.error({ err, userId: user.id }, "Failed to fire trial_midpoint event");
    }
  }

  // ── trial_final_reminder: final, respectful reminder on day 13 ──────────
  const finalEnd = new Date(now.getTime() - FINAL_REMINDER_DAY * DAY_MS);
  const finalStart = new Date(now.getTime() - (FINAL_REMINDER_DAY + 1) * DAY_MS);
  const finalCandidates = await db.select().from(usersTable).where(and(
    isNull(usersTable.trialFinalReminderEmailSentAt),
    isNotNull(usersTable.email),
    lte(usersTable.trialStartedAt, finalEnd),
    gt(usersTable.trialStartedAt, finalStart),
  ));
  for (const user of finalCandidates) {
    try {
      await fireEmailEvent(user, EVENTS.TRIAL_FINAL_REMINDER, "trialFinalReminderEmailSentAt");
    } catch (err) {
      cronLog.error({ err, userId: user.id }, "Failed to fire trial_final_reminder event");
    }
  }

  // ── trial_expiring: users whose trial is on day 11 (started 11–12 days ago) ──
  // Idempotency is guaranteed by the trialReminderSentAt stamp.
  const reminderWindowEnd = new Date(now.getTime() - REMINDER_DAY * DAY_MS);
  const reminderWindowStart = new Date(now.getTime() - (REMINDER_DAY + 1) * DAY_MS);

  const reminderCandidates = await db
    .select()
    .from(usersTable)
    .where(
      and(
        isNull(usersTable.trialReminderSentAt),
        isNotNull(usersTable.email),
        lte(usersTable.trialStartedAt, reminderWindowEnd),
        gt(usersTable.trialStartedAt, reminderWindowStart),
      ),
    );

  cronLog.info({ count: reminderCandidates.length }, "trial_expiring candidates found");

  for (const user of reminderCandidates) {
    if (!user.email) continue;

    // Skip paying users (fail-closed: skip on lookup error)
    if (await shouldSkipEvent(user)) {
      cronLog.info({ userId: user.id }, "Skipping trial_expiring — user has active subscription");
      continue;
    }

    try {
      await fireEmailEvent(user, EVENTS.TRIAL_EXPIRING, "trialReminderSentAt");
      cronLog.info({ userId: user.id, email: user.email }, "trial_expiring event fired");
    } catch (err) {
      cronLog.error({ err, userId: user.id }, "Failed to fire trial_expiring event");
    }
  }

  // ── trial_expired: users whose trial ended on day 14 (started 14–15 days ago) ──
  // Idempotency is guaranteed by the trialExpiredEmailSentAt stamp.
  const expiredWindowEnd = new Date(now.getTime() - TRIAL_DAYS * DAY_MS);
  const expiredWindowStart = new Date(now.getTime() - (TRIAL_DAYS + 1) * DAY_MS);

  const expiredCandidates = await db
    .select()
    .from(usersTable)
    .where(
      and(
        isNull(usersTable.trialExpiredEmailSentAt),
        isNotNull(usersTable.email),
        lte(usersTable.trialStartedAt, expiredWindowEnd),
        gt(usersTable.trialStartedAt, expiredWindowStart),
      ),
    );

  cronLog.info({ count: expiredCandidates.length }, "trial_expired candidates found");

  for (const user of expiredCandidates) {
    if (!user.email) continue;

    // Skip paying users (fail-closed: skip on lookup error)
    if (await shouldSkipEvent(user)) {
      cronLog.info({ userId: user.id }, "Skipping trial_expired — user has active subscription");
      continue;
    }

    try {
      await fireEmailEvent(user, EVENTS.TRIAL_EXPIRED, "trialExpiredEmailSentAt");
      cronLog.info({ userId: user.id, email: user.email }, "trial_expired event fired");
    } catch (err) {
      cronLog.error({ err, userId: user.id }, "Failed to fire trial_expired event");
    }
  }

  cronLog.info("Trial event cron complete");
}
