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
import { db, usersTable } from "@workspace/db";
import { isNull, isNotNull, and, lte, gt } from "drizzle-orm";
import { logger } from "./logger";
import { trackEvent } from "./emailClient";
import { EVENTS } from "./eventRegistry";

const TRIAL_DAYS = 14;
const REMINDER_DAY = 11; // fire trial_expiring on day 11 (3 days before expiry)
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
      const delivered = await trackEvent(EVENTS.TRIAL_EXPIRING, user.id, user.email, {
        firstName: user.firstName,
        trialStartedAt: user.trialStartedAt?.toISOString(),
      }, cronLog);

      if (delivered) {
        await db
          .update(usersTable)
          .set({ trialReminderSentAt: now })
          .where(sql`id = ${user.id}`);
        cronLog.info({ userId: user.id, email: user.email }, "trial_expiring event fired");
      } else {
        cronLog.warn({ userId: user.id }, "trial_expiring delivery failed — stamp not set, will retry next run");
      }
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
      const delivered = await trackEvent(EVENTS.TRIAL_EXPIRED, user.id, user.email, {
        firstName: user.firstName,
        trialStartedAt: user.trialStartedAt?.toISOString(),
      }, cronLog);

      if (delivered) {
        await db
          .update(usersTable)
          .set({ trialExpiredEmailSentAt: now })
          .where(sql`id = ${user.id}`);
        cronLog.info({ userId: user.id, email: user.email }, "trial_expired event fired");
      } else {
        cronLog.warn({ userId: user.id }, "trial_expired delivery failed — stamp not set, will retry next run");
      }
    } catch (err) {
      cronLog.error({ err, userId: user.id }, "Failed to fire trial_expired event");
    }
  }

  cronLog.info("Trial event cron complete");
}
