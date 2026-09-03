import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVE_TRIAL_CHARGE_COPY,
  ACTIVE_TRIAL_SUBSCRIBE_COPY,
  claimTrialNudge,
  getPricingReturnContext,
  pricingPathWithReturnTo,
  trialBannerCopy,
  TRIAL_NUDGE_TOAST_OPTIONS,
} from "./trialConversion";

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

test("trial nudges are capped per action in the session and per day across sessions", () => {
  const session = storage();
  const local = storage();
  const first = {
    userId: "user-1",
    nudgeKey: "service-plan",
    today: "2026-09-02",
    sessionStorage: session,
    localStorage: local,
  };

  assert.equal(claimTrialNudge(first), true);
  assert.equal(claimTrialNudge(first), false);
  assert.equal(
    claimTrialNudge({ ...first, sessionStorage: storage() }),
    false,
  );
  assert.equal(
    claimTrialNudge({
      ...first,
      today: "2026-09-03",
      sessionStorage: storage(),
    }),
    true,
  );
  assert.equal(
    claimTrialNudge({ ...first, nudgeKey: "library-save" }),
    true,
  );
});

test("trial nudge storage failures fail open and the toast remains dismissible", () => {
  const unavailable = {
    getItem: () => {
      throw new Error("storage unavailable");
    },
    setItem: () => {
      throw new Error("storage unavailable");
    },
  };
  assert.equal(
    claimTrialNudge({
      userId: "user-1",
      nudgeKey: "service-plan",
      today: "2026-09-02",
      sessionStorage: unavailable,
      localStorage: unavailable,
    }),
    true,
  );
  assert.equal(TRIAL_NUDGE_TOAST_OPTIONS.closeButton, true);
  assert.equal(TRIAL_NUDGE_TOAST_OPTIONS.duration, 10_000);
});

test("pricing return context preserves safe paths and falls back safely", () => {
  assert.deepEqual(
    getPricingReturnContext("/pricing?returnTo=%2Fservices%2F42%3Ftab%3Dplan"),
    {
      returnTo: "/services/42?tab=plan",
      hasReturnContext: true,
      returnLabel: "where you were planning",
    },
  );
  assert.deepEqual(
    getPricingReturnContext("/pricing?returnTo=https%3A%2F%2Fevil.example"),
    {
      returnTo: "/dashboard",
      hasReturnContext: true,
      returnLabel: "dashboard",
    },
  );
  assert.equal(
    pricingPathWithReturnTo("/services/42", "?tab=plan"),
    "/pricing?returnTo=%2Fservices%2F42%3Ftab%3Dplan",
  );
});

test("active-trial pricing copy communicates deferred billing", () => {
  assert.equal(trialBannerCopy(null), "Your trial is active");
  assert.equal(trialBannerCopy(1), "1 day left in your trial");
  assert.equal(trialBannerCopy(8), "8 days left in your trial");
  assert.equal(
    ACTIVE_TRIAL_SUBSCRIBE_COPY,
    "Subscribe — billing starts when your trial ends",
  );
  assert.equal(
    ACTIVE_TRIAL_CHARGE_COPY.heading("No date"),
    "No charge until No date",
  );
  assert.match(
    ACTIVE_TRIAL_CHARGE_COPY.description,
    /first \$9\.99 charge.*Cancel before then/,
  );
});