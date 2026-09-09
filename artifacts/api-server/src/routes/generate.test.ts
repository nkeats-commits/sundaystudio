process.env.NODE_ENV = "test";

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { db, libraryItemsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import generateRouter from "./generate";
import { jobManager } from "../lib/jobManager";

async function seedTrialUser(uid: string) {
  await db.insert(usersTable).values({ id: uid }).onConflictDoNothing();
}

function userId() {
  return `test-user-song-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function cleanup(uid: string) {
  await db.delete(libraryItemsTable).where(eq(libraryItemsTable.userId, uid));
  await db.delete(usersTable).where(eq(usersTable.id, uid));
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", generateRouter);
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

test("song generation prompt reflects Prefer, Off, and Strict with a seeded repertoire", async () => {
  const uid = userId();
  await cleanup(uid);
  await seedTrialUser(uid);
  await db.insert(libraryItemsTable).values([
    {
      userId: uid,
      kind: "song",
      title: "Amazing Grace",
      content: {},
      tags: [],
      isRepertoire: true,
    },
    {
      userId: uid,
      kind: "song",
      title: "Great Is Thy Faithfulness",
      content: {},
      tags: [],
      isRepertoire: true,
    },
  ]);

  const prompts: string[] = [];
  const stub = mock.method(
    jobManager,
    "start",
    (opts: { prompt: string }) => {
      prompts.push(opts.prompt);
      return "test-song-job-id";
    },
  );
  const { base, close } = await startServer();

  try {
    for (const mode of ["prefer", "off", "strict"] as const) {
      const response = await fetch(`${base}/api/generate/songs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": uid,
        },
        body: JSON.stringify({
          theme: "faithfulness",
          count: 4,
          repertoireMode: mode,
        }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { jobId: "test-song-job-id" });
    }
  } finally {
    stub.mock.restore();
    await close();
    await cleanup(uid);
  }

  assert.equal(prompts.length, 3);
  assert.match(prompts[0]!, /Repertoire mode: Prefer/);
  assert.match(prompts[0]!, /deliberate mix of both groups/);
  assert.match(prompts[1]!, /Repertoire mode: Off/);
  assert.match(prompts[1]!, /Amazing Grace/);
  assert.match(prompts[1]!, /do not suggest any song whose title matches/);
  assert.match(prompts[2]!, /Repertoire mode: Strict/);
  assert.match(prompts[2]!, /Hard rule: every entry/);
});
