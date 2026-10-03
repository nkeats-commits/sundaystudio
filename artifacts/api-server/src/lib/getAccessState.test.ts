import assert from "node:assert/strict";
import test from "node:test";
import {
  getLocalTrialAccessState,
  isAccessAllowed,
  getStripeSubscriptionAccessState,
} from "./getAccessState";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 0, 20);
const createdAt = new Date(now - 90 * DAY_MS);

test("new accounts and migrated cardless trials require payment enrollment", () => {
  for (const trialStartedAt of [null, new Date(now - 2 * DAY_MS)]) {
    const state = getLocalTrialAccessState({
      enrollmentStatus: "pending",
      trialStartedAt,
      createdAt,
      now,
    });
    assert.deepEqual(state, { kind: "enrollment_required" });
    assert.equal(isAccessAllowed(state), false);
  }
});

test("enrolled trial countdown starts from the confirmed Stripe trial date", () => {
  const trialStartedAt = new Date(now - 3 * DAY_MS);
  const state = getLocalTrialAccessState({
    enrollmentStatus: "enrolled",
    trialStartedAt,
    createdAt,
    now,
  });
  assert.equal(state.kind, "trial");
  if (state.kind === "trial") {
    assert.equal(state.daysLeft, 11);
    assert.equal(
      state.trialEndsAt,
      new Date(trialStartedAt.getTime() + 14 * DAY_MS).toISOString(),
    );
  }
  assert.equal(isAccessAllowed(state), true);
});

test("an extended trial uses its saved end without changing its original start", () => {
  const trialStartedAt = new Date(now - 12 * DAY_MS);
  const trialEndsAt = new Date(now + 9 * DAY_MS);
  const state = getLocalTrialAccessState({
    enrollmentStatus: "enrolled",
    trialStartedAt,
    trialEndsAt,
    createdAt,
    now,
  });

  assert.deepEqual(state, {
    kind: "trial",
    daysLeft: 9,
    trialEndsAt: trialEndsAt.toISOString(),
  });
  assert.equal(isAccessAllowed(state), true);
});

test("an extended trial is expired at its saved end date", () => {
  const trialStartedAt = new Date(now - 30 * DAY_MS);
  const trialEndsAt = new Date(now - 1);
  const state = getLocalTrialAccessState({
    enrollmentStatus: "enrolled",
    trialStartedAt,
    trialEndsAt,
    createdAt,
    now,
  });

  assert.deepEqual(state, {
    kind: "expired",
    trialEndedAt: trialEndsAt.toISOString(),
  });
  assert.equal(isAccessAllowed(state), false);
});

test("expired accounts stay ineligible and cannot get another local trial", () => {
  const state = getLocalTrialAccessState({
    enrollmentStatus: "expired",
    trialStartedAt: new Date(now - 2 * DAY_MS),
    createdAt,
    now,
  });
  assert.equal(state.kind, "expired");
  assert.equal(isAccessAllowed(state), false);
});

test("existing active paid subscriptions remain active during migration", () => {
  const state = getStripeSubscriptionAccessState(
    "active",
    new Date(now + 30 * DAY_MS).toISOString(),
    false,
    "pending",
  );
  assert.equal(state.kind, "active");
  assert.equal(isAccessAllowed(state), true);
});

test("unconfirmed Stripe trial subscriptions do not bypass card enrollment", () => {
  const state = getStripeSubscriptionAccessState(
    "trialing",
    new Date(now + 14 * DAY_MS).toISOString(),
    false,
    "pending",
  );
  assert.deepEqual(state, { kind: "enrollment_required" });
  assert.equal(isAccessAllowed(state), false);
});