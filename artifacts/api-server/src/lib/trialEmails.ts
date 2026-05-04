/**
 * Trial lifecycle email cron.
 *
 * Sends two emails per user (idempotent — each fires at most once):
 *   1. Day-11 reminder  — "3 days left in your trial"
 *   2. Day-14 expiry    — "Your trial has ended"
 *
 * Both queries skip users who already have a Stripe subscription row
 * (active or trialing) so paying customers are never emailed.
 *
 * Schedule: called once at boot (to catch any missed sends) then every 24 h.
 */

import { sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { isNull, isNotNull, and, lte, gte, gt } from "drizzle-orm";
import { logger } from "./logger";
import { getResendClient } from "./emailClient";
import {
  trialReminderHtml,
  trialReminderText,
  trialExpiredHtml,
  trialExpiredText,
} from "./emailTemplates";

const TRIAL_DAYS = 14;
const REMINDER_DAY = 11; // send reminder on day 11 (3 days before expiry)
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns the canonical pricing URL for this deployment.
 * Uses REPLIT_DOMAINS in production; falls back to localhost in dev.
 */
function getPricingUrl(): string {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) {
    return `https://${domains.split(",")[0]}/pricing`;
  }
  return "https://worshipflow.app/pricing";
}

/**
 * Returns true if this user has an active/trialing Stripe subscription.
 * Soft-fails to false (allow email) if stripe schema doesn't exist yet.
 */
async function hasActiveStripeSubscription(stripeCustomerId: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT id FROM stripe.subscriptions
      WHERE customer = ${stripeCustomerId}
        AND status IN ('active', 'trialing')
      LIMIT 1
    `);
    return (result.rows.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function runTrialEmailCron(): Promise<void> {
  const cronLog = logger.child({ cron: "trialEmails" });
  cronLog.info("Trial email cron starting");

  const resend = await getResendClient(cronLog);
  if (!resend) {
    cronLog.warn("Resend not configured — skipping trial emails");
    return;
  }

  const pricingUrl = getPricingUrl();
  const now = new Date();

  // ── Reminder: users whose trial entered day 11 but haven't been reminded ──
  const reminderWindowStart = new Date(now.getTime() - (REMINDER_DAY + 1) * DAY_MS);
  const reminderWindowEnd = new Date(now.getTime() - REMINDER_DAY * DAY_MS);

  const reminderCandidates = await db
    .select()
    .from(usersTable)
    .where(
      and(
        isNull(usersTable.trialReminderSentAt),
        isNotNull(usersTable.email),
        lte(usersTable.trialStartedAt, reminderWindowEnd),
        gte(usersTable.trialStartedAt, reminderWindowStart),
      ),
    );

  cronLog.info({ count: reminderCandidates.length }, "Reminder candidates found");

  for (const user of reminderCandidates) {
    if (!user.email) continue;

    // Skip paying users
    if (user.stripeCustomerId && (await hasActiveStripeSubscription(user.stripeCustomerId))) {
      cronLog.info({ userId: user.id }, "Skipping reminder — user has active subscription");
      continue;
    }

    try {
      await resend.client.emails.send({
        from: resend.fromEmail,
        to: user.email,
        subject: "Your WorshipFlow trial ends in 3 days",
        html: trialReminderHtml({ firstName: user.firstName, pricingUrl }),
        text: trialReminderText({ firstName: user.firstName, pricingUrl }),
      });

      await db
        .update(usersTable)
        .set({ trialReminderSentAt: now })
        .where(sql`id = ${user.id}`);

      cronLog.info({ userId: user.id, email: user.email }, "Trial reminder sent");
    } catch (err) {
      cronLog.error({ err, userId: user.id }, "Failed to send trial reminder");
    }
  }

  // ── Expired: users whose trial passed day 14 but haven't received expiry email ──
  const expiredWindowStart = new Date(now.getTime() - (TRIAL_DAYS + 1) * DAY_MS);
  const expiredWindowEnd = new Date(now.getTime() - TRIAL_DAYS * DAY_MS);

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

  cronLog.info({ count: expiredCandidates.length }, "Expiry candidates found");

  for (const user of expiredCandidates) {
    if (!user.email) continue;

    // Skip paying users
    if (user.stripeCustomerId && (await hasActiveStripeSubscription(user.stripeCustomerId))) {
      cronLog.info({ userId: user.id }, "Skipping expiry email — user has active subscription");
      continue;
    }

    try {
      await resend.client.emails.send({
        from: resend.fromEmail,
        to: user.email,
        subject: "Your WorshipFlow trial has ended",
        html: trialExpiredHtml({ firstName: user.firstName, pricingUrl }),
        text: trialExpiredText({ firstName: user.firstName, pricingUrl }),
      });

      await db
        .update(usersTable)
        .set({ trialExpiredEmailSentAt: now })
        .where(sql`id = ${user.id}`);

      cronLog.info({ userId: user.id, email: user.email }, "Trial expiry email sent");
    } catch (err) {
      cronLog.error({ err, userId: user.id }, "Failed to send trial expiry email");
    }
  }

  cronLog.info("Trial email cron complete");
}
