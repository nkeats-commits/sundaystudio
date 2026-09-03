/**
 * Integration coverage for the authenticated conversion funnel endpoint and
 * the one-time activation milestone. Uses the test-only auth header bypass
 * and the real Postgres database, matching the other route tests.
 */
process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { eq, and } from "drizzle-orm";
import {
  db,
  trialEventsTable,
  usersTable,
} from "@workspace/db";
import { EVENTS } from "../lib/eventRegistry";
import { recordActivationOnce } from "../lib/trialAnalytics";
import trialEventsRouter from "./trialEvents";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", trialEventsRouter);
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

function userId() {
  return `test-user-trial-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function cleanup(uid: string) {
  await db.delete(trialEventsTable).where(eq(trialEventsTable.userId, uid));
  await db.delete(usersTable).where(eq(usersTable.id, uid));
}

test("POST /api/trial-events accepts an authenticated funnel event and persists context", async () => {
  const uid = userId();
  await cleanup(uid);
  await db.insert(usersTable).values({ id: uid });
  const { base, close } = await startServer();

  try {
    const response = await fetch(`${base}/api/trial-events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": uid,
      },
      body: JSON.stringify({
        event: "ss_upgrade_prompt_shown",
        context: { source: "service-plan", daysLeft: 8 },
      }),
    });

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { accepted: true });

    const [event] = await db
      .select()
      .from(trialEventsTable)
      .where(
        and(
          eq(trialEventsTable.userId, uid),
          eq(trialEventsTable.eventName, EVENTS.UPGRADE_PROMPT_SHOWN),
        ),
      );
    assert.ok(event);
    assert.deepEqual(event.context, {
      source: "service-plan",
      daysLeft: 8,
    });
  } finally {
    await close();
    await cleanup(uid);
  }
});

test("POST /api/trial-events rejects invalid funnel events", async () => {
  const uid = userId();
  await cleanup(uid);
  await db.insert(usersTable).values({ id: uid });
  const { base, close } = await startServer();

  try {
    const response = await fetch(`${base}/api/trial-events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": uid,
      },
      body: JSON.stringify({
        event: "ss_trial_activated",
        context: { source: "forged-client-event" },
      }),
    });

    assert.equal(response.status, 400);
    assert.equal(
      (await db
        .select()
        .from(trialEventsTable)
        .where(eq(trialEventsTable.userId, uid))).length,
      0,
    );
  } finally {
    await close();
    await cleanup(uid);
  }
});

test("recordActivationOnce records activation and handoff only once", async () => {
  const uid = userId();
  await cleanup(uid);
  await db.insert(usersTable).values({ id: uid });

  try {
    await recordActivationOnce(uid, { source: "first-service-plan" });
    await recordActivationOnce(uid, { source: "second-tab" });

    const events = await db
      .select()
      .from(trialEventsTable)
      .where(eq(trialEventsTable.userId, uid));
    assert.deepEqual(
      events.map((event) => event.eventName).sort(),
      [EVENTS.TRIAL_ACTIVATED, EVENTS.TRIAL_ACTIVATION_HANDOFF].sort(),
    );
    assert.ok(events.every((event) => event.context.source === "first-service-plan"));

    const [user] = await db
      .select({ activationAt: usersTable.trialActivationEventFiredAt })
      .from(usersTable)
      .where(eq(usersTable.id, uid));
    assert.ok(user?.activationAt);
  } finally {
    await cleanup(uid);
  }
});