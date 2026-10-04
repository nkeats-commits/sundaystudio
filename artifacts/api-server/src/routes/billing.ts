import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  getUncachableStripeClient,
  isStripeConfigured,
} from "../lib/stripeClient";
import { getAccessState, TRIAL_DAYS } from "../lib/getAccessState";
import { getMonthlyPriceId } from "../lib/getMonthlyPriceId";
import { recordTrialEvent } from "../lib/trialAnalytics";
import { ConfirmBillingCheckoutSessionBody } from "@workspace/api-zod";
import {
  CARD_CHECKOUT_PAYMENT_OPTIONS,
  buildCardRequiredTrialOptions,
  isConfirmedTrialCheckout,
  reusableEnrollmentCheckoutUrl,
  shouldStartCardTrial,
  stripeReferenceId,
  type CheckoutSessionForEnrollment,
  type TrialingSubscription,
} from "../lib/trialEnrollment";
import { confirmTrialEnrollment } from "../lib/confirmTrialEnrollment";

const router: IRouter = Router();

function originFromReq(req: import("express").Request): string {
  // 1. Explicit custom domain (e.g. https://sundaystudio.app) — highest priority.
  const appUrl = process.env["APP_URL"]?.trim();
  if (appUrl) return appUrl.replace(/\/$/, "");
  // 2. Replit-assigned domain in production.
  const replitDomains = process.env["REPLIT_DOMAINS"];
  if (replitDomains) {
    const first = replitDomains.split(",")[0];
    if (first) return `https://${first}`;
  }
  // 3. Local / dev fallback.
  const host = req.get("host") ?? "localhost";
  return `${req.protocol}://${host}`;
}

/** GET /api/billing/status — used by the client `useSubscriptionStatus` hook. */
router.get("/billing/status", requireAuth, async (req, res) => {
  try {
    const state = await getAccessState(req.userId!);
    res.json({ state, trialDays: TRIAL_DAYS });
  } catch (err) {
    req.log.error({ err }, "billing status verification failed");
    res
      .status(503)
      .json({ error: "Unable to verify billing status. Please retry." });
  }
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
  if (["active", "trialing", "past_due"].includes(currentState.kind)) {
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

    const startsTrial = shouldStartCardTrial(
      currentState.kind,
      user.trialEnrollmentStatus,
    );
    const origin = originFromReq(req);

    if (startsTrial && user.trialEnrollmentSessionId) {
      try {
        const prior = await stripe.checkout.sessions.retrieve(
          user.trialEnrollmentSessionId,
          { expand: ["subscription"] },
        );
        const reusableUrl = reusableEnrollmentCheckoutUrl(
          [prior as unknown as CheckoutSessionForEnrollment],
          user.id,
          customerId,
        );
        if (reusableUrl) {
          res.json({ url: reusableUrl });
          return;
        }

        if (prior.status === "complete" && prior.metadata?.trialEnrollment === "required_card") {
          const subscriptionId = stripeReferenceId(prior.subscription);
          const subscription = subscriptionId
            ? typeof prior.subscription === "object" && prior.subscription !== null
              ? prior.subscription
              : await stripe.subscriptions.retrieve(subscriptionId)
            : null;
          if (
            subscription &&
            isConfirmedTrialCheckout({
              session: prior as unknown as CheckoutSessionForEnrollment,
              subscription: subscription as unknown as TrialingSubscription,
              userId: user.id,
              customerId,
            })
          ) {
            await confirmTrialEnrollment(
              user.id,
              customerId,
              subscription as unknown as TrialingSubscription,
              req.log,
            );
            res.json({
              url: `${origin}/billing?status=success&session_id=${encodeURIComponent(prior.id)}`,
            });
            return;
          }
        }
      } catch (err) {
        // A deleted or expired prior Checkout session is safe to replace.
        req.log.info({ err, userId: user.id }, "Replacing stale trial Checkout session");
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      ...CARD_CHECKOUT_PAYMENT_OPTIONS,
      line_items: [{ price: priceId, quantity: 1 }],
      ...(startsTrial
        ? buildCardRequiredTrialOptions(user.id)
        : {
            metadata: { userId: user.id },
            custom_text: {
              submit: {
                message:
                  "Your $9.99/month subscription begins today and renews monthly until canceled.",
              },
            },
          }),
      success_url: `${origin}/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?status=canceled&enrollment=required`,
      allow_promotion_codes: true,
    }, {
      idempotencyKey: startsTrial
        ? `trial-checkout-${user.id}-${customerId}-${user.trialEnrollmentSessionId ?? "first"}`
        : `paid-checkout-${user.id}-${customerId}-${Math.floor(Date.now() / 60_000)}`,
    });

    if (startsTrial) {
      await db
        .update(usersTable)
        .set({ trialEnrollmentSessionId: session.id })
        .where(eq(usersTable.id, user.id));
    }

    void recordTrialEvent(req.userId!, "ss_checkout_started", {
      source: "checkout_session",
      enrollment: startsTrial,
    }, req.log);

    res.json({ url: session.url });
  } catch (err) {
    req.log.error({ err }, "Failed to create Stripe checkout session");
    res.status(500).json({ error: "Failed to start checkout" });
  }
});

/** POST /api/billing/checkout-confirmation — verify Stripe, never the redirect, grants trial access. */
router.post("/billing/checkout-confirmation", requireAuth, async (req, res) => {
  const parsed = ConfirmBillingCheckoutSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid Checkout session ID is required." });
    return;
  }
  if (!(await isStripeConfigured())) {
    res.status(503).json({ error: "Billing is not configured yet. Try again shortly." });
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
  if (!user.stripeCustomerId) {
    res.status(409).json({ error: "This Checkout session is not confirmed for this account." });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(parsed.data.sessionId);
    const subscriptionId = stripeReferenceId(session.subscription);
    if (
      session.status !== "complete" ||
      session.mode !== "subscription" ||
      session.metadata?.userId !== user.id ||
      stripeReferenceId(session.customer) !== user.stripeCustomerId ||
      !subscriptionId
    ) {
      res.status(409).json({ error: "Checkout is not complete for this account yet." });
      return;
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const subscriptionData = subscription as unknown as TrialingSubscription & {
      current_period_end: number | null;
      cancel_at_period_end: boolean;
    };
    const confirmedTrial = isConfirmedTrialCheckout({
      session: session as unknown as CheckoutSessionForEnrollment,
      subscription: subscriptionData,
      userId: user.id,
      customerId: user.stripeCustomerId,
    });

    if (confirmedTrial) {
      const activated = await confirmTrialEnrollment(
        user.id,
        user.stripeCustomerId,
        subscriptionData,
        req.log,
      );
      if (!activated) {
        res.status(409).json({ error: "This account is not eligible for a trial." });
        return;
      }
    } else if (
      subscriptionData.status !== "active" ||
      !subscriptionData.default_payment_method
    ) {
      res.status(409).json({ error: "Stripe has not confirmed a card-backed subscription." });
      return;
    }

    let state;
    if (confirmedTrial) {
      const trialEndsAt = new Date(subscriptionData.trial_end! * 1000);
      state = {
        kind: "trial" as const,
        daysLeft: Math.max(
          0,
          Math.ceil((trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
        ),
        trialEndsAt: trialEndsAt.toISOString(),
      };
    } else {
      state = {
        kind: "active" as const,
        currentPeriodEnd: subscriptionData.current_period_end
          ? new Date(subscriptionData.current_period_end * 1000).toISOString()
          : null,
        cancelAtPeriodEnd: subscriptionData.cancel_at_period_end,
      };
    }
    res.json({ state, trialDays: TRIAL_DAYS });
  } catch (err) {
    req.log.error({ err, userId: user.id }, "Failed to confirm Stripe Checkout");
    res.status(500).json({ error: "Failed to confirm Checkout with Stripe." });
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
