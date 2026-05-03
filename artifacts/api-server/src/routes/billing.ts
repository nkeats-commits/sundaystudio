import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  getUncachableStripeClient,
  isStripeConfigured,
} from "../lib/stripeClient";
import { getAccessState, TRIAL_DAYS } from "../lib/getAccessState";

const router: IRouter = Router();

const PRODUCT_NAME = "WorshipFlow Pro";

function originFromReq(req: import("express").Request): string {
  // Prefer the public Replit domain in production; fall back to the request
  // host so local/dev still works through the shared proxy.
  const replitDomains = process.env["REPLIT_DOMAINS"];
  if (replitDomains) {
    const first = replitDomains.split(",")[0];
    if (first) return `https://${first}`;
  }
  const host = req.get("host") ?? "localhost";
  return `${req.protocol}://${host}`;
}

/**
 * Resolve the monthly Stripe price id for our single product.
 *
 * Preferred source: the `STRIPE_PRICE_ID` environment variable, which the
 * seed script prints on success. This avoids any provisioning race against
 * the stripe-replit-sync webhook backfill.
 *
 * Fallback: query the local mirror by product name. Useful in dev right
 * after seeding, before an admin has set the env var.
 */
async function getMonthlyPriceId(): Promise<string | null> {
  const fromEnv = process.env["STRIPE_PRICE_ID"]?.trim();
  if (fromEnv) return fromEnv;
  try {
    const result = await db.execute(sql`
      SELECT pr.id AS price_id
      FROM stripe.prices pr
      JOIN stripe.products p ON p.id = pr.product
      WHERE p.active = true
        AND pr.active = true
        AND p.name = ${PRODUCT_NAME}
        AND pr.recurring->>'interval' = 'month'
      ORDER BY pr.created DESC
      LIMIT 1
    `);
    const row = result.rows[0] as { price_id?: string } | undefined;
    return row?.price_id ?? null;
  } catch {
    return null;
  }
}

/** GET /api/billing/status — used by the client `useSubscriptionStatus` hook. */
router.get("/billing/status", requireAuth, async (req, res) => {
  const state = await getAccessState(req.userId!);
  res.json({ state, trialDays: TRIAL_DAYS });
});

/** POST /api/billing/checkout-session — opens Stripe Checkout in subscription mode. */
router.post("/billing/checkout-session", requireAuth, async (req, res) => {
  if (!(await isStripeConfigured())) {
    res
      .status(503)
      .json({ error: "Billing is not configured yet. Try again shortly." });
    return;
  }

  // Guard: don't let an already-subscribed user create another subscription.
  // Direct them to the billing portal to manage the existing one instead.
  const currentState = await getAccessState(req.userId!);
  if (
    currentState.kind === "active" ||
    currentState.kind === "trialing" ||
    currentState.kind === "past_due"
  ) {
    res.status(409).json({
      error:
        "You already have an active subscription. Use the billing portal to manage it.",
    });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const priceId = await getMonthlyPriceId();
  if (!priceId) {
    res
      .status(503)
      .json({
        error:
          "Subscription plan is not yet provisioned. An admin needs to run the billing seed script.",
      });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();

    // Reuse-or-create the customer.  We persist the id on `users` so we
    // never create duplicate customers for the same Clerk user.
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name:
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await db
        .update(usersTable)
        .set({ stripeCustomerId: customerId })
        .where(eq(usersTable.id, user.id));
    }

    // If the local trial is still running, honor the remainder by passing
    // `trial_end` so Stripe defers the first charge until the trial would
    // have ended.  Past that point, no Stripe-side trial — charge now.
    const trialStart = user.trialStartedAt ?? user.createdAt;
    const trialEndMs =
      new Date(trialStart).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
    const trialEndUnix = Math.floor(trialEndMs / 1000);
    const nowUnix = Math.floor(Date.now() / 1000);
    const subscriptionData =
      trialEndUnix > nowUnix + 60 ? { trial_end: trialEndUnix } : undefined;

    const origin = originFromReq(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      ...(subscriptionData ? { subscription_data: subscriptionData } : {}),
      success_url: `${origin}/billing?status=success`,
      cancel_url: `${origin}/pricing?status=canceled`,
      allow_promotion_codes: true,
    });

    res.json({ url: session.url });
  } catch (err) {
    req.log.error({ err }, "Failed to create Stripe checkout session");
    res.status(500).json({ error: "Failed to start checkout" });
  }
});

/** POST /api/billing/portal-session — opens the Stripe Customer Portal. */
router.post("/billing/portal-session", requireAuth, async (req, res) => {
  if (!(await isStripeConfigured())) {
    res
      .status(503)
      .json({ error: "Billing is not configured yet. Try again shortly." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);
  if (!user?.stripeCustomerId) {
    res
      .status(400)
      .json({ error: "No Stripe customer for this account yet." });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const origin = originFromReq(req);
    const portal = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${origin}/billing`,
    });
    res.json({ url: portal.url });
  } catch (err) {
    req.log.error({ err }, "Failed to create Stripe portal session");
    res.status(500).json({ error: "Failed to open billing portal" });
  }
});

export default router;
