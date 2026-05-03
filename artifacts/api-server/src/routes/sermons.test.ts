/**
 * Integration tests for the Sermons HTTP endpoints introduced in task #71:
 *
 *   - POST /api/sermons/preview-resources
 *       Server mirror of the "Drawing on N resources" panel. Must include
 *       library rows whose related passage matches the sermon, must respect
 *       per-sermon excludes, and must report legacy mode iff the sermon
 *       carries pre-task-71 attachedResourceIds.
 *
 *   - POST /api/generate/sermon-study
 *       Generation must succeed even when the client sends NO `resources[]`
 *       payload — the server now derives them from the user's library +
 *       enabled public-domain commentaries. To avoid making real LLM calls
 *       we stub `runStructuredCompletion` and assert the merged context that
 *       reaches it.
 *
 * Auth uses the test-only `x-test-user-id` header bypass in
 * `middlewares/requireAuth.ts`, gated by NODE_ENV=test.
 *
 * Run with: `pnpm --filter @workspace/api-server run test`
 */
process.env.NODE_ENV = "test";

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import {
  db,
  sermonResourcesTable,
  sermonsTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import sermonsRouter from "./sermons";
import generateSermonRouter from "./generateSermon";
import { jobManager } from "../lib/jobManager";

async function seedTrialUser(uid: string) {
  await db.insert(usersTable).values({ id: uid }).onConflictDoNothing();
}

function makeApp() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use("/api", sermonsRouter);
  app.use("/api", generateSermonRouter);
  return app;
}

async function startServer() {
  const app = makeApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

function userId() {
  return `test-user-srm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function cleanup(uid: string) {
  await db.delete(sermonsTable).where(eq(sermonsTable.userId, uid));
  await db
    .delete(sermonResourcesTable)
    .where(eq(sermonResourcesTable.userId, uid));
  await db.delete(usersTable).where(eq(usersTable.id, uid));
}

/* -------------------------------------------------------------------------- */
/* /sermons/preview-resources                                                 */
/* -------------------------------------------------------------------------- */

test("POST /api/sermons/preview-resources includes library rows whose passage matches", async () => {
  const uid = userId();
  await cleanup(uid);
  await seedTrialUser(uid);

  // Seed three library rows: one matches by chapter, one is broadly relevant
  // (empty relatedPassage), one is for a different chapter (must NOT appear).
  const [matching, broad, other] = await db
    .insert(sermonResourcesTable)
    .values([
      {
        userId: uid,
        title: "MacArthur on Romans",
        relatedPassage: "Romans 8:28",
        excerpt: "All things work together for good ...",
      },
      {
        userId: uid,
        title: "Pastoral notes — assurance",
        relatedPassage: "",
        excerpt: "Always-relevant notes on assurance.",
      },
      {
        userId: uid,
        title: "Galatians intro",
        relatedPassage: "Galatians 5:22",
        excerpt: "Fruit of the Spirit ...",
      },
    ])
    .returning();

  const { base, close } = await startServer();
  try {
    const res = await fetch(`${base}/api/sermons/preview-resources`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user-id": uid },
      body: JSON.stringify({
        passage: "Romans 8:1-11",
        secondaryPassages: [],
        excludedResourceIds: [],
        excludedSourceIds: [],
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      library: Array<{ id: number; alwaysRelevant: boolean }>;
      legacyMode: boolean;
    };

    const ids = body.library.map((r) => r.id).sort();
    assert.deepEqual(ids, [matching.id, broad.id].sort());
    const broadRow = body.library.find((r) => r.id === broad.id)!;
    assert.equal(broadRow.alwaysRelevant, true);
    const matchRow = body.library.find((r) => r.id === matching.id)!;
    assert.equal(matchRow.alwaysRelevant, false);
    assert.ok(!body.library.some((r) => r.id === other.id));
    assert.equal(body.legacyMode, false);
  } finally {
    await close();
    await cleanup(uid);
  }
});

test("POST /api/sermons/preview-resources honors excludedResourceIds", async () => {
  const uid = userId();
  await cleanup(uid);
  await seedTrialUser(uid);

  const [keep, drop] = await db
    .insert(sermonResourcesTable)
    .values([
      {
        userId: uid,
        title: "Keep me",
        relatedPassage: "Romans 8",
        excerpt: "x",
      },
      {
        userId: uid,
        title: "Drop me",
        relatedPassage: "Romans 8",
        excerpt: "y",
      },
    ])
    .returning();

  const { base, close } = await startServer();
  try {
    const res = await fetch(`${base}/api/sermons/preview-resources`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user-id": uid },
      body: JSON.stringify({
        passage: "Romans 8:1-11",
        excludedResourceIds: [drop.id],
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { library: Array<{ id: number }> };
    const ids = body.library.map((r) => r.id);
    assert.deepEqual(ids, [keep.id]);
  } finally {
    await close();
    await cleanup(uid);
  }
});

test("POST /api/sermons/preview-resources reports legacyMode for pre-task-71 attached lists", async () => {
  const uid = userId();
  await cleanup(uid);
  await seedTrialUser(uid);

  const [legacyRow] = await db
    .insert(sermonResourcesTable)
    .values([
      {
        userId: uid,
        title: "Legacy attached note",
        relatedPassage: "",
        excerpt: "z",
      },
    ])
    .returning();

  const { base, close } = await startServer();
  try {
    const res = await fetch(`${base}/api/sermons/preview-resources`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user-id": uid },
      body: JSON.stringify({
        passage: "John 3:1-21",
        attachedResourceIds: [legacyRow.id],
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      library: Array<{ id: number }>;
      legacyMode: boolean;
    };
    assert.equal(body.legacyMode, true);
    assert.deepEqual(
      body.library.map((r) => r.id),
      [legacyRow.id],
    );
  } finally {
    await close();
    await cleanup(uid);
  }
});

/* -------------------------------------------------------------------------- */
/* /generate/sermon-study without client-supplied resources[]                 */
/* -------------------------------------------------------------------------- */

test("POST /api/generate/sermon-study succeeds with no client resources[]; server merges library + PD", async () => {
  const uid = userId();
  await cleanup(uid);
  await seedTrialUser(uid);

  // Seed one library row that should auto-include via passage match.
  await db.insert(sermonResourcesTable).values([
    {
      userId: uid,
      title: "Stott on Romans 8",
      relatedPassage: "Romans 8",
      excerpt:
        "The Spirit's intercession (vv26-27) underlines our weakness and God's nearness.",
    },
  ]);

  // Stub jobManager.start so we don't kick off a real Anthropic call in the
  // background. We capture the prompt the route would have enqueued and
  // assert the merged library context made it in.
  let capturedPrompt = "";
  const stub = mock.method(
    jobManager,
    "start",
    (opts: { prompt: string }) => {
      capturedPrompt = opts.prompt ?? "";
      return "test-job-id";
    },
  );

  const { base, close } = await startServer();
  try {
    const res = await fetch(`${base}/api/generate/sermon-study`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user-id": uid },
      // Critically: no `resources` field. Pre-task-71 the client supplied it.
      body: JSON.stringify({
        title: "Test sermon",
        passage: "Romans 8:1-11",
        secondaryPassages: [],
        theme: "",
        series: "",
        occasion: "",
        audience: "",
        length: "",
        tone: "",
        style: "",
        depth: "",
        outputFormat: "manuscript",
        pastorNotes: "",
      }),
    });
    const text = await res.text();
    assert.equal(res.status, 200, text);
    const body = JSON.parse(text) as { jobId: string };
    assert.equal(body.jobId, "test-job-id");

    // The merged prompt that would have been enqueued should mention the
    // seeded library row, proving the server-side merge ran without any
    // client `resources[]` payload.
    assert.ok(
      capturedPrompt.includes("Stott on Romans 8"),
      "expected library row title to appear in the merged prompt",
    );
  } finally {
    stub.mock.restore();
    await close();
    await cleanup(uid);
  }
});
