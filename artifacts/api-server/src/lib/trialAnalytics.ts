import { and, eq, isNull } from "drizzle-orm";
import { db, trialEventsTable, usersTable } from "@workspace/db";
import { EVENTS } from "./eventRegistry";
import { trackEvent } from "./emailClient";
import type { Logger } from "pino";
import { TRIAL_DAYS } from "./getAccessState";

const DAY_MS = 24 * 60 * 60 * 1000;

const RESEND_TRACKED_EVENTS = new Set<string>([
  EVENTS.TRIAL_STARTED,
  EVENTS.TRIAL_ACTIVATED,
  EVENTS.TRIAL_ACTIVATION_HANDOFF,
  EVENTS.TRIAL_MIDPOINT,
  EVENTS.TRIAL_EXPIRING,
  EVENTS.TRIAL_FINAL_REMINDER,
  EVENTS.TRIAL_EXPIRED,
  EVENTS.SUBSCRIPTION_STARTED,
  EVENTS.SUBSCRIPTION_CANCELED,
  EVENTS.SUBSCRIPTION_REACTIVATED,
  EVENTS.UPGRADE_PROMPT_SHOWN,
  EVENTS.UPGRADE_PROMPT_CLICKED,
  EVENTS.CHECKOUT_STARTED,
]);

export function trialDay(trialStartedAt: Date | string | null | undefined): number {
  if (!trialStartedAt) return 1;
  const elapsed = Date.now() - new Date(trialStartedAt).getTime();
  return Math.max(1, Math.min(TRIAL_DAYS + 1, Math.floor(elapsed / DAY_MS) + 1));
}

/**
 * Returns the timestamp window used by lifecycle jobs for a trial-day event.
 *
 * The lower bound is exclusive and the upper bound is inclusive. This keeps
 * the query stable at exact day boundaries while preserving the existing
 * "started N–N+1 days ago" cron semantics.
 */
export function trialDayWindow(
  now: Date,
  day: number,
): { startExclusive: Date; endInclusive: Date } {
  if (!Number.isInteger(day) || day < 1 || day > TRIAL_DAYS) {
    throw new RangeError(`Trial day must be an integer from 1 to ${TRIAL_DAYS}`);
  }
  return {
    startExclusive: new Date(now.getTime() - (day + 1) * DAY_MS),
    endInclusive: new Date(now.getTime() - day * DAY_MS),
  };
}

/**
 * Records a conversion event locally and mirrors it to Resend when the event
 * belongs in lifecycle automation. Never lets analytics break the primary UX.
 */
export async function recordTrialEvent(
  userId: string,
  eventName: string,
  context: Record<string, unknown> = {},
  log?: Logger,
): Promise<boolean> {
  try {
    const [user] = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        trialStartedAt: usersTable.trialStartedAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) return false;

    const day = trialDay(user.trialStartedAt);
    await db.insert(trialEventsTable).values({
      userId,
      eventName,
      trialDay: day,
      context,
    });

    if (RESEND_TRACKED_EVENTS.has(eventName)) {
      return await trackEvent(
        eventName,
        user.id,
        user.email,
        {
          trialDay: day,
          trialStartedAt: user.trialStartedAt?.toISOString(),
          ...context,
        },
        log,
      );
    }
    return true;
  } catch (err) {
    (log ?? console).warn?.({ err, userId, eventName }, "trial analytics event failed");
    return false;
  }
}

/**
 * Claims the activation milestone once, then records both the durable funnel
 * event and the lifecycle handoff. The atomic claim prevents duplicate
 * messages if a user saves from two tabs at once.
 */
export async function recordActivationOnce(
  userId: string,
  context: Record<string, unknown> = {},
  log?: Logger,
): Promise<void> {
  try {
    const [claimed] = await db
      .update(usersTable)
      .set({ trialActivationEventFiredAt: new Date() })
      .where(
        and(
          eq(usersTable.id, userId),
          isNull(usersTable.trialActivationEventFiredAt),
        ),
      )
      .returning({ id: usersTable.id });
    if (!claimed) return;
    await recordTrialEvent(userId, EVENTS.TRIAL_ACTIVATED, context, log);
    await recordTrialEvent(userId, EVENTS.TRIAL_ACTIVATION_HANDOFF, context, log);
  } catch (err) {
    (log ?? console).warn?.({ err, userId }, "trial activation tracking failed");
  }
}