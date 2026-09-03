/**
 * Regression coverage for the dashboard summary response.
 *
 * The endpoint should return card-safe recent services rather than complete
 * service-plan documents. The seeded rows also verify that the summary counts
 * and activation state remain data-driven.
 */
process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import {
  db,
  libraryItemsTable,
  sermonsTable,
  servicePlansTable,
  usersTable,
} from "@workspace/db";
import dashboardRouter from "./dashboard";

function makeApp() {
  const app = express();
  app.use("/api", dashboardRouter);
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
  return `test-user-dashboard-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function cleanup(uid: string) {
  await db.delete(servicePlansTable).where(eq(servicePlansTable.userId, uid));
  await db.delete(libraryItemsTable).where(eq(libraryItemsTable.userId, uid));
  await db.delete(sermonsTable).where(eq(sermonsTable.userId, uid));
  await db.delete(usersTable).where(eq(usersTable.id, uid));
}

test("GET /api/dashboard returns card-safe recent services and summary counts", async () => {
  const uid = userId();
  await cleanup(uid);
  await db.insert(usersTable).values({ id: uid });
  await db.insert(servicePlansTable).values({
    userId: uid,
    title: "Easter Sunday",
    scripture: "John 20:1-18",
    theme: "Hope",
    season: "Easter",
    serviceDate: new Date("2026-04-05T15:00:00.000Z"),
    content: {
      order: [
        {
          id: "song-1",
          kind: "song",
          title: "Christ Is Risen",
          body: "A large service-plan body that must not be sent to dashboard cards.",
        },
      ],
    },
  });
  await db.insert(sermonsTable).values({ userId: uid, title: "The Empty Tomb" });
  await db.insert(libraryItemsTable).values({
    userId: uid,
    kind: "song",
    title: "Christ Is Risen",
    content: { artist: "Matt Maher" },
  });

  const { base, close } = await startServer();
  try {
    const response = await fetch(`${base}/api/dashboard`, {
      headers: { "x-test-user-id": uid },
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      recentServices: Record<string, unknown>[];
      servicesThisMonth: number;
      librarySize: number;
      totalServices: number;
      trial: {
        activated: boolean;
        daysLeft: number | null;
        trialEndsAt: string | null;
        servicePlans: number;
        sermons: number;
        libraryItems: number;
      };
    };

    assert.equal(body.servicesThisMonth, 1);
    assert.equal(body.librarySize, 1);
    assert.equal(body.totalServices, 1);
    assert.deepEqual(body.trial, {
      isActive: true,
      daysLeft: body.trial.daysLeft,
      trialEndsAt: body.trial.trialEndsAt,
      activated: true,
      servicePlans: 1,
      sermons: 1,
      libraryItems: 1,
    });
    assert.deepEqual(Object.keys(body.recentServices[0] ?? {}).sort(), [
      "id",
      "scripture",
      "season",
      "serviceDate",
      "theme",
      "title",
    ]);
    assert.equal(body.recentServices[0]?.title, "Easter Sunday");
    assert.equal(body.recentServices[0]?.content, undefined);
  } finally {
    await close();
    await cleanup(uid);
  }
});