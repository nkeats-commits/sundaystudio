import assert from "node:assert/strict";
import test, { mock } from "node:test";
import type { TrialingSubscription } from "./trialEnrollment";

const DAY_SECONDS = 24 * 60 * 60;
const userId = "legacy-trial-user";
const customerId = "cus_legacy_trial";
const trialStart = Math.floor(Date.now() / 1000) - 2 * DAY_SECONDS;

type SubscriptionRow = {
  id: string;
  status: string;
  current_period_end: number | null;
  cancel_at_period_end: boolean | null;
};

let user = {
  id: userId,
  stripeCustomerId: customerId,
  trialStartedAt: null as Date | null,
  trialEndsAt: null as Date | null,
  trialEnrollmentStatus: "pending" as "pending" | "enrolled" | "expired",
  createdAt: new Date(Date.now() - 90 * DAY_SECONDS * 1000),
};
let subscriptionRow: SubscriptionRow = {
  id: "sub_legacy_trial",
  status: "trialing",
  current_period_end: trialStart + 14 * DAY_SECONDS,
  cancel_at_period_end: false,
};
let liveSubscription: TrialingSubscription = {
  id: subscriptionRow.id,
  customer: customerId,
  status: "trialing",
  trial_start: trialStart,
  trial_end: trialStart + 14 * DAY_SECONDS,
  default_payment_method: "pm_saved_card",
  metadata: {},
};
const retrievedSubscriptionIds: string[] = [];
const enrollmentUpdates: Array<Record<string, unknown>> = [];

const db = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => [user],
      }),
    }),
  }),
  execute: async () => ({ rows: [subscriptionRow] }),
  update: () => ({
    set: (values: Record<string, unknown>) => {
      enrollmentUpdates.push(values);
      return {
        where: () => ({
          returning: async () => [{ id: userId }],
        }),
      };
    },
  }),
};

mock.module("@workspace/db", {
  namedExports: {
    db,
    usersTable: {
      id: "users.id",
      stripeCustomerId: "users.stripe_customer_id",
      trialStartedAt: "users.trial_started_at",
      trialEndsAt: "users.trial_ends_at",
      trialEnrollmentStatus: "users.trial_enrollment_status",
      trialEnrollmentSessionId: "users.trial_enrollment_session_id",
      createdAt: "users.created_at",
    },
  },
});
mock.module("drizzle-orm", {
  namedExports: {
    and: () => ({}),
    eq: () => ({}),
    sql: () => ({}),
  },
});
mock.module(new URL("./stripeClient.ts", import.meta.url).href, {
  namedExports: {
    getUncachableStripeClient: async () => ({
      subscriptions: {
        retrieve: async (id: string) => {
          retrievedSubscriptionIds.push(id);
          return liveSubscription;
        },
      },
    }),
  },
});
mock.module(new URL("./trialAnalytics.ts", import.meta.url).href, {
  namedExports: { recordTrialEvent: async () => true },
});

const { getAccessState, isAccessAllowed } = await import("./getAccessState");

function makeTrial(
  overrides: Partial<TrialingSubscription> = {},
): TrialingSubscription {
  return {
    id: subscriptionRow.id,
    customer: customerId,
    status: "trialing",
    trial_start: trialStart,
    trial_end: trialStart + 14 * DAY_SECONDS,
    default_payment_method: "pm_saved_card",
    metadata: {},
    ...overrides,
  };
}

function resetFixtures() {
  user = {
    id: userId,
    stripeCustomerId: customerId,
    trialStartedAt: null,
    trialEndsAt: null,
    trialEnrollmentStatus: "pending",
    createdAt: new Date(Date.now() - 90 * DAY_SECONDS * 1000),
  };
  subscriptionRow = {
    id: "sub_legacy_trial",
    status: "trialing",
    current_period_end: trialStart + 14 * DAY_SECONDS,
    cancel_at_period_end: false,
  };
  liveSubscription = makeTrial();
  retrievedSubscriptionIds.length = 0;
  enrollmentUpdates.length = 0;
}

test("adopts only a live, card-backed legacy Stripe trial and preserves paid access", async (t) => {
  await t.test("persists Stripe's confirmed trial start for a valid 14-day trial", async () => {
    resetFixtures();
    const state = await getAccessState(userId);

    assert.equal(state.kind, "trial");
    assert.equal(isAccessAllowed(state), true);
    assert.deepEqual(retrievedSubscriptionIds, [subscriptionRow.id]);
    assert.equal(enrollmentUpdates.length, 1);
    assert.equal(
      (enrollmentUpdates[0]?.trialStartedAt as Date).getTime(),
      trialStart * 1000,
    );
    assert.equal(enrollmentUpdates[0]?.trialEnrollmentStatus, "enrolled");
    assert.equal(
      (enrollmentUpdates[0]?.trialEndsAt as Date).getTime(),
      (trialStart + 14 * DAY_SECONDS) * 1000,
    );
    if (state.kind === "trial") {
      assert.equal(
        state.trialEndsAt,
        new Date((trialStart + 14 * DAY_SECONDS) * 1000).toISOString(),
      );
    }
  });

  const blockedTrials: Array<{
    label: string;
    subscription: TrialingSubscription;
  }> = [
    {
      label: "cardless",
      subscription: makeTrial({ default_payment_method: null }),
    },
    {
      label: "expired",
      subscription: makeTrial({
        trial_start: trialStart - 15 * DAY_SECONDS,
        trial_end: trialStart - DAY_SECONDS,
      }),
    },
    {
      label: "associated with another customer",
      subscription: makeTrial({ customer: "cus_someone_else" }),
    },
    {
      label: "with an invalid trial duration",
      subscription: makeTrial({ trial_end: trialStart + 13 * DAY_SECONDS }),
    },
  ];

  for (const { label, subscription } of blockedTrials) {
    await t.test(`${label} trial remains blocked`, async () => {
      resetFixtures();
      liveSubscription = subscription;
      const state = await getAccessState(userId);

      assert.deepEqual(state, { kind: "enrollment_required" });
      assert.equal(isAccessAllowed(state), false);
      assert.deepEqual(retrievedSubscriptionIds, [subscriptionRow.id]);
      assert.equal(enrollmentUpdates.length, 0);
    });
  }

  await t.test("existing paid subscriptions remain active", async () => {
    resetFixtures();
    subscriptionRow = { ...subscriptionRow, status: "active" };

    const state = await getAccessState(userId);

    assert.equal(state.kind, "active");
    assert.equal(isAccessAllowed(state), true);
    assert.deepEqual(retrievedSubscriptionIds, []);
    assert.equal(enrollmentUpdates.length, 0);
  });

  await t.test("a stale trialing mirror cannot extend access past the saved end", async () => {
    resetFixtures();
    user = {
      ...user,
      trialStartedAt: new Date(trialStart * 1000),
      trialEndsAt: new Date(Date.now() - 1000),
      trialEnrollmentStatus: "enrolled",
    };

    const state = await getAccessState(userId);

    assert.equal(state.kind, "expired");
    assert.equal(isAccessAllowed(state), false);
    assert.equal(enrollmentUpdates.length, 0);
  });
});