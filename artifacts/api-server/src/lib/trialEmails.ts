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
 * Trialing Stripe subscriptions are expected here: their confirmed trial
 * start anchors the countdown. Only converted active subscribers are skipped.
 *
 * Schedule: called once at boot (to catch any missed sends) then every 24 h.
 */

import { sql } from "drizzle-orm";
import { db, usersTable, libraryItemsTable, servicePlansTable, sermonsTable } from "@workspace/db";
import { isNull, isNotNull, and, lte, gt, eq } from "drizzle-orm";
import { logger } from "./logger";
import { EVENTS } from "./eventRegistry";
import { recordTrialEvent, trialDayWindow } from "./trialAnalytics";

const TRIAL_DAYS = 14;
const MIDPOINT_DAY = 7;
const REMINDER_DAY = 11; // fire trial_expiring on day 11 (3 days before expiry)
const FINAL_REMINDER_DAY = 13;

/**
 * Returns true if we should skip the event for this user.
 *
 * Fail-closed: if the user has a stripeCustomerId but the subscription
 * lookup fails for any reason (schema missing, DB hiccup, etc.), we skip
 * the event rather than risk targeting an active subscriber.
 */
async function shouldSkipEvent(user: { stripeCustomerId: string | null }): Promise<boolean> {
  if (!user.stripeCustomerId) return false;

  try {
    const result = await db.execute(sql`
      SELECT id FROM stripe.subscriptions
      WHERE customer = ${user.stripeCustomerId}
        AND status = 'active'
      LIMIT 1
    `);
    // Converted active subscriber → skip
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
  const midpointWindow = trialDayWindow(now, MIDPOINT_DAY);
  const midpointCandidates = await db.select().from(usersTable).where(and(
    eq(usersTable.trialEnrollmentStatus, "enrolled"),
    isNull(usersTable.trialMidpointEmailSentAt),
    isNotNull(usersTable.email),
    lte(usersTable.trialStartedAt, midpointWindow.endInclusive),
    gt(usersTable.trialStartedAt, midpointWindow.startExclusive),
  ));
  for (const user of midpointCandidates) {
    try {
      await fireEmailEvent(user, EVENTS.TRIAL_MIDPOINT, "trialMidpointEmailSentAt");
    } catch (err) {
      cronLog.error({ err, userId: user.id }, "Failed to fire trial_midpoint event");
    }
  }

  // ── trial_final_reminder: final, respectful reminder on day 13 ──────────
  const finalWindow = trialDayWindow(now, FINAL_REMINDER_DAY);
  const finalCandidates = await db.select().from(usersTable).where(and(
    eq(usersTable.trialEnrollmentStatus, "enrolled"),
    isNull(usersTable.trialFinalReminderEmailSentAt),
    isNotNull(usersTable.email),
    lte(usersTable.trialStartedAt, finalWindow.endInclusive),
    gt(usersTable.trialStartedAt, finalWindow.startExclusive),
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
  const reminderWindow = trialDayWindow(now, REMINDER_DAY);

  const reminderCandidates = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.trialEnrollmentStatus, "enrolled"),
        isNull(usersTable.trialReminderSentAt),
        isNotNull(usersTable.email),
         lte(usersTable.trialStartedAt, reminderWindow.endInclusive),
         gt(usersTable.trialStartedAt, reminderWindow.startExclusive),
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
  const expiredWindow = trialDayWindow(now, TRIAL_DAYS);

  const expiredCandidates = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.trialEnrollmentStatus, "enrolled"),
        isNull(usersTable.trialExpiredEmailSentAt),
        isNotNull(usersTable.email),
         lte(usersTable.trialStartedAt, expiredWindow.endInclusive),
         gt(usersTable.trialStartedAt, expiredWindow.startExclusive),
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
