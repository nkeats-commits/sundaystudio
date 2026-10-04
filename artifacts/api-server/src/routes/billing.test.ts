process.env.NODE_ENV = "test";

import assert from "node:assert/strict";
import { mock, test } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";

const accessStateHarness: {
  state: unknown;
  error: Error | null;
} = {
  state: { kind: "trial", daysLeft: 7, trialEndsAt: "2026-10-11T00:00:00.000Z" },
  error: null,
};

mock.module("../lib/getAccessState", {
  namedExports: {
    getAccessState: async () => {
      if (accessStateHarness.error) throw accessStateHarness.error;
      return accessStateHarness.state;
    },
    TRIAL_DAYS: 14,
  },
});

const { default: billingRouter } = await import("./billing");

function makeApp() {
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, { log: { error: () => undefined } });
    next();
  });
  app.use("/api", billingRouter);
  return app;
}

async function startServer() {
  const server = makeApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test("GET /api/billing/status returns verified access states for an authenticated user", async () => {
  const { base, close } = await startServer();
  try {
    for (const state of [
      { kind: "trial", daysLeft: 7, trialEndsAt: "2026-10-11T00:00:00.000Z" },
      { kind: "active", currentPeriodEnd: "2026-11-03T00:00:00.000Z" },
      { kind: "trialing", currentPeriodEnd: "2026-10-17T00:00:00.000Z" },
      { kind: "enrollment_required" },
      { kind: "expired", trialEndedAt: "2026-09-20T00:00:00.000Z" },
    ]) {
      accessStateHarness.state = state;
      accessStateHarness.error = null;
      const response = await fetch(`${base}/api/billing/status`, {
        headers: { "x-test-user-id": "billing-status-user" },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { state, trialDays: 14 });
    }
  } finally {
    await close();
  }
});

test("GET /api/billing/status returns a temporary error and no access state when verification fails", async () => {
  accessStateHarness.error = new Error("database unavailable");
  const { base, close } = await startServer();
  try {
    const response = await fetch(`${base}/api/billing/status`, {
      headers: { "x-test-user-id": "billing-status-user" },
    });
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 503);
    assert.deepEqual(body, {
      error: "Unable to verify billing status. Please retry.",
    });
    assert.equal("state" in body, false);
  } finally {
    accessStateHarness.error = null;
    await close();
  }
});