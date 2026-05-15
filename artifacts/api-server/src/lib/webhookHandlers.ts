import { getStripeSync } from "./stripeClient";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { trackEvent } from "./emailClient";
import { EVENTS } from "./eventRegistry";
import { logger } from "./logger";

/**
 * Parses a raw Stripe event buffer and fires the appropriate Resend
 * Automations tracking event. Runs best-effort — never throws.
 */
async function fireSubscriptionEvent(payload: Buffer): Promise<void> {
  let stripeType: string | undefined;
  let customerId: string | undefined;
  let newStatus: string | undefined;

  try {
    const event = JSON.parse(payload.toString()) as {
      type?: string;
      data?: { object?: { customer?: string; status?: string } };
    };
    stripeType = event.type;
    customerId = event.data?.object?.customer;
    newStatus = event.data?.object?.status;
  } catch {
    return; // malformed payload — ignore
  }

  const eventMap: Record<string, string> = {
    "customer.subscription.created": EVENTS.SUBSCRIPTION_STARTED,
    "customer.subscription.deleted": EVENTS.SUBSCRIPTION_CANCELED,
  };

  let eventName = stripeType ? eventMap[stripeType] : undefined;

  // Reactivation: subscription.updated where status is now active/trialing.
  if (
    !eventName &&
    stripeType === "customer.subscription.updated" &&
    (newStatus === "active" || newStatus === "trialing")
  ) {
    eventName = EVENTS.SUBSCRIPTION_REACTIVATED;
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
