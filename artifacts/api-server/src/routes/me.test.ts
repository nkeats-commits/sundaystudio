/**
 * Regression coverage for church profile updates and onboarding state.
 *
 * Uses the test-only auth header bypass and the real Postgres database, like
 * the other authenticated route tests in this package.
 */
process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  churchProfilesTable,
  usersTable,
} from "@workspace/db";
import meRouter from "./me";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", meRouter);
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
  return `test-user-me-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function cleanup(uid: string) {
  await db.delete(churchProfilesTable).where(eq(churchProfilesTable.userId, uid));
  await db.delete(usersTable).where(eq(usersTable.id, uid));
}

test("PUT /api/me/church preserves omitted profile fields but honors explicit clears", async () => {
  const uid = userId();
  await cleanup(uid);
  await db.insert(usersTable).values({ id: uid });
  await db.insert(churchProfilesTable).values({
    userId: uid,
    churchName: "Grace Community Church",
    leaderName: "Pastor Jane Smith",
    denomination: "ACNA",
    theology: "Reformed",
    location: "Austin, TX",
    averageAttendance: 250,
    musicStyle: "Modern worship",
    traditions: "Communion every week",
    leaderRole: "Lead Pastor",
    toneDescription: "Warm and direct",
    missionStatement: "To know Christ and make Him known",
    focusAreas: ["Discipleship", "Missions"],
  });
  const { base, close } = await startServer();

  try {
    const abbreviatedSave = await fetch(`${base}/api/me/church`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": uid,
      },
      body: JSON.stringify({
        churchName: "Grace Community Church",
        leaderName: "Pastor Jane Smith",
        leaderRole: "Lead Pastor",
        denomination: "ACNA",
        musicStyle: "Modern worship",
        theology: "Reformed",
      }),
    });

    assert.equal(abbreviatedSave.status, 200);
    const preserved = (await abbreviatedSave.json()) as Record<string, unknown>;
    assert.equal(preserved.location, "Austin, TX");
    assert.equal(preserved.averageAttendance, 250);
    assert.equal(preserved.traditions, "Communion every week");
    assert.equal(preserved.toneDescription, "Warm and direct");
    assert.equal(preserved.missionStatement, "To know Christ and make Him known");
    assert.deepEqual(preserved.focusAreas, ["Discipleship", "Missions"]);

    const fullProfileClear = await fetch(`${base}/api/me/church`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": uid,
      },
      body: JSON.stringify({
        churchName: "Grace Community Church",
        leaderName: "Pastor Jane Smith",
        location: "",
        averageAttendance: null,
        traditions: "",
        toneDescription: "",
        missionStatement: "",
        focusAreas: [],
      }),
    });

    assert.equal(fullProfileClear.status, 200);
    const cleared = (await fullProfileClear.json()) as Record<string, unknown>;
    assert.equal(cleared.location, "");
    assert.equal(cleared.averageAttendance, null);
    assert.equal(cleared.traditions, "");
    assert.equal(cleared.toneDescription, "");
    assert.equal(cleared.missionStatement, "");
    assert.deepEqual(cleared.focusAreas, []);
  } finally {
    await close();
    await cleanup(uid);
  }
});

test("concurrent first profile saves resolve to one complete persisted profile", async () => {
  const uid = userId();
  await cleanup(uid);
  await db.insert(usersTable).values({ id: uid });
  const { base, close } = await startServer();

  try {
    const [first, second] = await Promise.all([
      fetch(`${base}/api/me/church`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": uid,
        },
        body: JSON.stringify({
          churchName: "Grace Community Church",
          leaderName: "Pastor Jane Smith",
          location: "Austin, TX",
        }),
      }),
      fetch(`${base}/api/me/church`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": uid,
        },
        body: JSON.stringify({
          churchName: "Grace Community Church",
          leaderName: "Pastor Jane Smith",
          missionStatement: "To know Christ and make Him known",
        }),
      }),
    ]);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);

    const [persisted] = await db
      .select()
      .from(churchProfilesTable)
      .where(eq(churchProfilesTable.userId, uid));
    assert.equal(persisted.churchName, "Grace Community Church");
    assert.equal(persisted.leaderName, "Pastor Jane Smith");
    assert.equal(persisted.location, "Austin, TX");
    assert.equal(
      persisted.missionStatement,
      "To know Christ and make Him known",
    );

    const [user] = await db
      .select({ onboardingCompletedAt: usersTable.onboardingCompletedAt })
      .from(usersTable)
      .where(eq(usersTable.id, uid));
    assert.ok(user.onboardingCompletedAt);
  } finally {
    await close();
    await cleanup(uid);
  }
});

test("GET /api/me reconciles a usable profile with a missing onboarding marker", async () => {
  const uid = userId();
  await cleanup(uid);
  const [user] = await db.insert(usersTable).values({ id: uid }).returning();
  await db.insert(churchProfilesTable).values({
    userId: uid,
    churchName: "Grace Community Church",
    leaderName: "Pastor Jane Smith",
  });
  const { base, close } = await startServer();

  try {
    const response = await fetch(`${base}/api/me`, {
      headers: { "x-test-user-id": uid },
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      onboardingCompletedAt: string;
    };
    assert.equal(body.onboardingCompletedAt, user.createdAt.toISOString());

    const [reconciled] = await db
      .select({ onboardingCompletedAt: usersTable.onboardingCompletedAt })
      .from(usersTable)
      .where(and(eq(usersTable.id, uid), isNull(usersTable.onboardingCompletedAt)));
    assert.equal(reconciled, undefined);
  } finally {
    await close();
    await cleanup(uid);
  }
});