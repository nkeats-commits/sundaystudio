import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  CARD_CHECKOUT_PAYMENT_OPTIONS,
  buildCardRequiredTrialOptions,
  CARD_REQUIRED_TRIAL_TERMS,
  isCardBackedTrialSubscription,
  isCurrentCardBackedTrialSubscription,
  isConfirmedTrialCheckout,
  extendedTrialEnd,
  isTrialEnrollmentEligible,
  shouldStartCardTrial,
  reusableEnrollmentCheckoutUrl,
  type CheckoutSessionForEnrollment,
  type TrialingSubscription,
} from "./trialEnrollment";

const start = Math.floor(Date.now() / 1000) - 60 * 60;
const baseSubscription: TrialingSubscription = {
  id: "sub_trial",
  customer: "cus_user",
  status: "trialing",
  trial_start: start,
  trial_end: start + 14 * 24 * 60 * 60,
  default_payment_method: "pm_card",
  metadata: { userId: "user-1", trialEnrollment: "required_card" },
};
const baseSession: CheckoutSessionForEnrollment = {
  id: "cs_trial",
  url: "https://checkout.stripe.test/session",
  status: "complete",
  mode: "subscription",
  customer: "cus_user",
  subscription: "sub_trial",
  payment_status: "no_payment_required",
  metadata: { userId: "user-1", trialEnrollment: "required_card" },
};

test("only pending accounts are eligible for their card-backed trial", () => {
  assert.equal(isTrialEnrollmentEligible("pending"), true);
  assert.equal(isTrialEnrollmentEligible("enrolled"), false);
  assert.equal(isTrialEnrollmentEligible("expired"), false);
  assert.equal(shouldStartCardTrial("enrollment_required", "pending"), true);
  assert.equal(shouldStartCardTrial("expired", "pending"), false);
  assert.equal(shouldStartCardTrial("canceled", "pending"), false);
  assert.equal(shouldStartCardTrial("active", "pending"), false);
  assert.equal(shouldStartCardTrial("enrollment_required", "expired"), false);
});

test("Stripe Checkout terms require a card and defer the recurring $9.99 charge for 14 days", () => {
  assert.equal(CARD_CHECKOUT_PAYMENT_OPTIONS.payment_method_collection, "always");
  assert.deepEqual(CARD_CHECKOUT_PAYMENT_OPTIONS.payment_method_types, ["card"]);
  const options = buildCardRequiredTrialOptions("user-1");
  assert.equal(options.subscription_data.trial_period_days, 14);
  assert.deepEqual(options.metadata, {
    userId: "user-1",
    trialEnrollment: "required_card",
  });
  assert.match(CARD_REQUIRED_TRIAL_TERMS, /card is required/i);
  assert.match(CARD_REQUIRED_TRIAL_TERMS, /will not be charged today/i);
  assert.match(CARD_REQUIRED_TRIAL_TERMS, /\$9\.99\/month.*after the trial/i);
  assert.match(CARD_REQUIRED_TRIAL_TERMS, /cancel before then/i);
});

test("Stripe trial is valid only when it is trialing, has a payment method, and lasts 14 days", () => {
  assert.equal(isCardBackedTrialSubscription(baseSubscription), true);
  assert.equal(
    isCardBackedTrialSubscription({
      ...baseSubscription,
      default_payment_method: null,
    }),
    false,
  );
  assert.equal(
    isCardBackedTrialSubscription({ ...baseSubscription, status: "incomplete" }),
    false,
  );
  assert.equal(
    isCardBackedTrialSubscription({
      ...baseSubscription,
      trial_end: start + 13 * 24 * 60 * 60,
    }),
    false,
  );
  assert.equal(
    isCardBackedTrialSubscription({
      ...baseSubscription,
      trial_start: start - 15 * 24 * 60 * 60,
      trial_end: start - 24 * 60 * 60,
    }),
    false,
  );
});

test("only the matching active card-backed Stripe trial can be extended", () => {
  const effectiveTrialEnd = new Date(baseSubscription.trial_end! * 1000);
  const input = {
    subscription: baseSubscription,
    customerId: "cus_user",
    trialStartedAt: new Date(baseSubscription.trial_start! * 1000),
    trialEndsAt: effectiveTrialEnd,
    now: start * 1000,
  };

  assert.equal(isCurrentCardBackedTrialSubscription(input), true);
  assert.equal(
    isCurrentCardBackedTrialSubscription({
      ...input,
      subscription: { ...baseSubscription, status: "active" },
    }),
    false,
  );
  assert.equal(
    isCurrentCardBackedTrialSubscription({
      ...input,
      subscription: { ...baseSubscription, default_payment_method: null },
    }),
    false,
  );
  assert.equal(
    isCurrentCardBackedTrialSubscription({
      ...input,
      subscription: { ...baseSubscription, customer: "cus_other" },
    }),
    false,
  );
  assert.equal(
    isCurrentCardBackedTrialSubscription({
      ...input,
      trialStartedAt: new Date((baseSubscription.trial_start! - 1) * 1000),
    }),
    false,
  );
  assert.equal(
    isCurrentCardBackedTrialSubscription({
      ...input,
      trialEndsAt: new Date((baseSubscription.trial_end! + 1) * 1000),
    }),
    false,
  );
  assert.equal(
    isCurrentCardBackedTrialSubscription({
      ...input,
      now: baseSubscription.trial_end! * 1000,
    }),
    false,
  );
});

test("extension adds the selected days to a future Stripe trial end only", () => {
  assert.equal(extendedTrialEnd(start + 14 * 24 * 60 * 60, 7, start * 1000),
    start + 21 * 24 * 60 * 60);
  assert.equal(extendedTrialEnd(start, 14, start * 1000), null);
});

test("only the signed-in user's completed, card-backed Stripe trial is confirmed", () => {
  const input = {
    session: baseSession,
    subscription: baseSubscription,
    userId: "user-1",
    customerId: "cus_user",
  };
  assert.equal(isConfirmedTrialCheckout(input), true);
  assert.equal(
    isConfirmedTrialCheckout({
      ...input,
      session: { ...baseSession, status: "open" },
    }),
    false,
  );
  assert.equal(
    isConfirmedTrialCheckout({
      ...input,
      session: { ...baseSession, payment_status: "unpaid" },
    }),
    false,
  );
  assert.equal(
    isConfirmedTrialCheckout({
      ...input,
      session: { ...baseSession, status: "expired" },
    }),
    false,
  );
  assert.equal(
    isConfirmedTrialCheckout({
      ...input,
      session: {
        ...baseSession,
        metadata: { ...baseSession.metadata, userId: "another-user" },
      },
    }),
    false,
  );
  assert.equal(
    isConfirmedTrialCheckout({
      ...input,
      subscription: { ...baseSubscription, default_payment_method: null },
    }),
    false,
  );
});

test("retries reuse only an open enrollment session for this user and Stripe customer", () => {
  const openSession = {
    ...baseSession,
    id: "cs_open",
    status: "open",
    subscription: null,
    payment_status: "unpaid",
  };
  const otherUser = {
    ...openSession,
    id: "cs_other",
    metadata: { userId: "another-user", trialEnrollment: "required_card" },
  };
  const expired = { ...openSession, id: "cs_expired", status: "expired" };
  assert.equal(
    reusableEnrollmentCheckoutUrl(
      [otherUser, expired, openSession],
      "user-1",
      "cus_user",
    ),
    openSession.url,
  );
  assert.equal(
    reusableEnrollmentCheckoutUrl([otherUser], "user-1", "cus_user"),
    null,
  );
});

test("migration backfills active cardless trials as pending and expired trials as ineligible", () => {
  const migration = readFileSync(
    new URL("../../../../lib/db/drizzle/0016_require_card_before_trial.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /ALTER COLUMN "trial_started_at" DROP DEFAULT/);
  assert.match(migration, /ALTER COLUMN "trial_started_at" DROP NOT NULL/);
  assert.match(
    migration,
    /WHEN "trial_started_at" \+ interval '14 days' > NOW\(\) THEN 'pending'\s+ELSE 'expired'/,
  );
  assert.match(migration, /WHERE "trial_started_at" IS NOT NULL/);
  assert.doesNotMatch(migration, /stripe\.subscriptions/);
});