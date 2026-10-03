import test from "node:test";
import assert from "node:assert/strict";
import { TRIAL_DAYS } from "./getAccessState";
import { trialDay, trialDayWindow } from "./trialAnalytics";

const DAY_MS = 24 * 60 * 60 * 1000;

test("trialDay calculates each conversion milestone and clamps outside the trial", () => {
  const now = Date.now();
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    assert.equal(trialDay(new Date(now)), 1);
    assert.equal(trialDay(new Date(now - 6 * DAY_MS - 1)), 7);
    assert.equal(trialDay(new Date(now - 10 * DAY_MS - 1)), 11);
    assert.equal(trialDay(new Date(now - 12 * DAY_MS - 1)), 13);
    assert.equal(trialDay(new Date(now - 13 * DAY_MS - 1)), 14);
    assert.equal(trialDay(new Date(now - TRIAL_DAYS * DAY_MS)), TRIAL_DAYS + 1);
    assert.equal(trialDay(new Date(now + DAY_MS)), 1);
    assert.equal(trialDay(null), 0);
  } finally {
    Date.now = originalNow;
  }
});

test("trialDayWindow covers the day-7, day-11, day-13, and day-14 eligibility windows", () => {
  const now = new Date("2026-09-02T12:00:00.000Z");

  for (const day of [7, 11, 13, 14]) {
    const window = trialDayWindow(now, day);
    assert.equal(
      window.startExclusive.getTime(),
      now.getTime() - (day + 1) * DAY_MS,
    );
    assert.equal(
      window.endInclusive.getTime(),
      now.getTime() - day * DAY_MS,
    );
    assert.equal(
      new Date(window.endInclusive.getTime()).getTime(),
      window.endInclusive.getTime(),
    );
    assert.ok(
      new Date(window.endInclusive.getTime() - 1).getTime() >
        window.startExclusive.getTime(),
    );
  }
});

test("trialDayWindow rejects days outside the trial", () => {
  const now = new Date();
  assert.throws(() => trialDayWindow(now, 0), RangeError);
  assert.throws(() => trialDayWindow(now, TRIAL_DAYS + 1), RangeError);
  assert.throws(() => trialDayWindow(now, 7.5), RangeError);
});