import { getStripeSync } from "./stripeClient";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { trackEvent } from "./emailClient";
import { EVENTS } from "./eventRegistry";
import { logger } from "./logger";

/**
 * Stripe subscription statuses that indicate the subscription was NOT active.
 * A transition FROM one of these statuses TO active/trialing is a reactivation.
 */
const INACTIVE_STATUSES = new Set([
  "canceled",
  "past_due",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
]);

/**
 * Parses a raw Stripe event buffer and fires the appropriate Resend
 * Automations tracking event. Runs best-effort — never throws.
 *
 * subscription_reactivated fires for two distinct Stripe paths:
 *   1. Status transition: previous_attributes.status ∈ INACTIVE_STATUSES
 *      AND new status is active/trialing.
 *   2. Un-cancel: previous_attributes.cancel_at_period_end === true AND
 *      object.cancel_at_period_end === false while status is active/trialing.
 *      (Most common path — user clicks "Keep subscription" before period end.)
 */
async function fireSubscriptionEvent(payload: Buffer): Promise<void> {
  let stripeType: string | undefined;
  let customerId: string | undefined;
  let newStatus: string | undefined;
  let previousStatus: string | undefined;
  let newCancelAtPeriodEnd: boolean | undefined;
  let previousCancelAtPeriodEnd: boolean | undefined;

  try {
    const event = JSON.parse(payload.toString()) as {
      type?: string;
      data?: {
        object?: {
          customer?: string;
          status?: string;
          cancel_at_period_end?: boolean;
        };
        previous_attributes?: {
          status?: string;
          cancel_at_period_end?: boolean;
        };
      };
    };
    stripeType = event.type;
    customerId = event.data?.object?.customer;
    newStatus = event.data?.object?.status;
    previousStatus = event.data?.previous_attributes?.status;
    newCancelAtPeriodEnd = event.data?.object?.cancel_at_period_end;
    previousCancelAtPeriodEnd = event.data?.previous_attributes?.cancel_at_period_end;
  } catch {
    return; // malformed payload — ignore
  }

  const eventMap: Record<string, string> = {
    "customer.subscription.created": EVENTS.SUBSCRIPTION_STARTED,
    "customer.subscription.deleted": EVENTS.SUBSCRIPTION_CANCELED,
  };

  let eventName = stripeType ? eventMap[stripeType] : undefined;

  if (!eventName && stripeType === "customer.subscription.updated") {
    const isActiveOrTrialing = newStatus === "active" || newStatus === "trialing";

    // Path 1: explicit status transition from an inactive state.
    const isStatusReactivation =
      isActiveOrTrialing &&
      previousStatus !== undefined &&
      INACTIVE_STATUSES.has(previousStatus);

    // Path 2: user reversed a pending cancellation (cancel_at_period_end true→false)
    // while the subscription was already active/trialing.
    const isUncancelReactivation =
      isActiveOrTrialing &&
      previousCancelAtPeriodEnd === true &&
      newCancelAtPeriodEnd === false;

    if (isStatusReactivation || isUncancelReactivation) {
      eventName = EVENTS.SUBSCRIPTION_REACTIVATED;
    }
  }

  if (!eventName || !customerId) return;

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.stripeCustomerId, customerId))
      .limit(1);

    if (!user?.email) return;

    await trackEvent(eventName, user.id, user.email, {
      customerId,
      stripeEvent: stripeType,
      previousStatus,
      newStatus,
      previousCancelAtPeriodEnd,
      newCancelAtPeriodEnd,
    }, logger);
  } catch (err) {
    logger.warn({ err, eventName, customerId }, "Subscription event tracking failed");
  }
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
          "Received type: " +
          typeof payload +
          ". This usually means express.json() parsed the body before reaching this handler. " +
          "FIX: Ensure webhook route is registered BEFORE app.use(express.json()).",
      );
    }
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // Fire Resend Automations event for subscription lifecycle changes.
    void fireSubscriptionEvent(payload);
  }
}
