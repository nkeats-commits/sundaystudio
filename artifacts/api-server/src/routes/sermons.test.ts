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
  type Sermon,
  sermonExportsTable,
  sermonResourcesTable,
  sermonsTable,
  trialEventsTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import sermonsRouter from "./sermons";
import generateSermonRouter from "./generateSermon";
import { jobManager } from "../lib/jobManager";
import { GenerateSermonStudyResponse } from "@workspace/api-zod";
import {
  renderSermonAsMarkdown,
  renderSermonAsText,
  renderSmallGroupHandoutMarkdown,
  renderSmallGroupHandoutText,
  renderSmallGroupHandoutEmail,
} from "../lib/sermonExport";

const exportReferenceCases = [
  { name: "single", references: ["Romans 8:1"] },
  { name: "multiple", references: ["Romans 8:1", "Romans 8:2", "John 3:16"] },
  { name: "empty", references: [] },
  { name: "legacy omitted", references: undefined },
];

function exportStudy(references?: string[]): NonNullable<Sermon["study"]> {
  return {
    context: "Passage context.",
    crossReferences: ["Psalm 23:1"],
    wordStudies: [{
      term: "grace",
      originalWord: "χάρις",
      transliteration: "charis",
      language: "Greek",
      strongsNumber: "G5485",
      definition: "God's gracious gift.",
      significance: "Grace grounds the message.",
      ...(references === undefined ? {} : { references }),
    }],
  };
}

for (const [format, render] of [
  ["markdown", renderSermonAsMarkdown],
  ["text", renderSermonAsText],
  ["small-group-handout", renderSmallGroupHandoutMarkdown],
  ["small-group-text", renderSmallGroupHandoutText],
  ["small-group-email", renderSmallGroupHandoutEmail],
] as const) {
  for (const { name, references } of exportReferenceCases) {
    test(`sermon export ${format} preserves ${name} word-study references`, () => {
      const sermon = {
        title: "Grace",
        passage: "Romans 8:1-2",
        study: exportStudy(references),
      } as Sermon;
      const content = render(sermon);
      assert.match(content, /Word Studies/);
      assert.match(content, /grace\n/);
      assert.match(content, /χάρις \(charis\) — Greek — G5485/);
      assert.ok(content.includes("God's gracious gift."));
      assert.ok(content.includes("Grace grounds the message."));
      if (references?.length) {
        const label = format === "markdown" || format === "small-group-handout"
          ? "**Source verses:** "
          : "Source verses: ";
        assert.ok(content.includes(label + references.join(", ")));
        assert.equal(content.match(/Source verses:/g)?.length, 1);
        assert.doesNotMatch(content, /Source verses:[^\n]*Psalm 23:1/);
      } else {
        assert.doesNotMatch(content, /Source verses:/);
      }
      assert.doesNotMatch(content, /undefined|null/);
    });
  }

  test(`sermon export ${format} handles a study without word studies`, () => {
    const content = render({
      title: "Legacy sermon",
      study: { context: "Passage context." },
    } as Sermon);
    assert.doesNotMatch(content, /Word Studies|Source verses:/);
  });
}

async function seedTrialUser(uid: string) {
  const now = new Date();
  await db.insert(usersTable).values({
    id: uid,
    trialEnrollmentStatus: "enrolled",
    trialStartedAt: now,
    trialEndsAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
  }).onConflictDoNothing();
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
  await db.delete(trialEventsTable).where(eq(trialEventsTable.userId, uid));
  await db.delete(sermonExportsTable).where(eq(sermonExportsTable.userId, uid));
  await db.delete(sermonsTable).where(eq(sermonsTable.userId, uid));
  await db
    .delete(sermonResourcesTable)
    .where(eq(sermonResourcesTable.userId, uid));
  await db.delete(usersTable).where(eq(usersTable.id, uid));
}

async function waitForTrialEvents(uid: string, expectedCount: number) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const rows = await db
      .select({ id: trialEventsTable.id })
      .from(trialEventsTable)
      .where(eq(trialEventsTable.userId, uid));
    if (rows.length >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`Expected ${expectedCount} trial events for the export requests.`);
}

test("POST /api/sermons/:id/export saves word-study source verses in every format", async () => {
  const uid = userId();
  await seedTrialUser(uid);
  const { base, close } = await startServer();
  try {
    for (const { references } of exportReferenceCases) {
      const [sermon] = await db.insert(sermonsTable).values({
        userId: uid,
        title: "Grace",
        passage: "Romans 8:1-2",
        study: exportStudy(references),
      }).returning();
      for (const format of ["markdown", "text", "small-group-handout", "small-group-email"]) {
        const res = await fetch(`${base}/api/sermons/${sermon.id}/export`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-test-user-id": uid },
          body: JSON.stringify({ format }),
        });
        const text = await res.text();
        assert.equal(res.status, 200, text);
        const body = JSON.parse(text) as { format: string; content: string; sermonId: number };
        assert.equal(body.format, format);
        assert.equal(body.sermonId, sermon.id);
        assert.ok(body.content.includes("God's gracious gift."));
        if (references?.length) {
          assert.ok(body.content.includes(references.join(", ")));
          assert.match(body.content, /Source verses:/);
        } else {
          assert.doesNotMatch(body.content, /Source verses:/);
        }
      }
    }
    // The endpoint intentionally records analytics after its response.
    // Wait for those writes before cleanup deletes the user row.
    await waitForTrialEvents(
      uid,
      exportReferenceCases.length * 4,
    );
  } finally {
    await close();
    await cleanup(uid);
  }
});

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

test("POST /api/sermons/preview-resources rejects non-owned ids and unknown source ids", async () => {
  const uid = userId();
  const otherUid = `${uid}-other`;
  await cleanup(uid);
  await cleanup(otherUid);
  await seedTrialUser(uid);
  await seedTrialUser(otherUid);

  // Resource owned by a different user — preview must refuse to surface it.
  const [foreign] = await db
    .insert(sermonResourcesTable)
    .values([{ userId: otherUid, title: "Cross-tenant", relatedPassage: "", excerpt: "x" }])
    .returning();

  const { base, close } = await startServer();
  try {
    const ownership = await fetch(`${base}/api/sermons/preview-resources`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user-id": uid },
      body: JSON.stringify({
        passage: "John 3:16",
        excludedResourceIds: [foreign.id],
      }),
    });
    assert.equal(ownership.status, 400);

    const unknownSource = await fetch(`${base}/api/sermons/preview-resources`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user-id": uid },
      body: JSON.stringify({
        passage: "John 3:16",
        excludedSourceIds: ["not-a-real-source"],
      }),
    });
    assert.equal(unknownSource.status, 400);
  } finally {
    await close();
    await cleanup(uid);
    await cleanup(otherUid);
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
        refineInstruction: "Keep the word study grounded in the passage.",
        existingContent: {
          wordStudies: [
            {
              term: "grace",
              originalWord: "χάρις",
              transliteration: "charis",
              language: "Greek",
              strongsNumber: "G5485",
              definition: "Grace.",
              significance: "It matters.",
            },
          ],
        },
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
    assert.match(capturedPrompt, /"references": \["string", \.\.\.\]/);
    assert.match(capturedPrompt, /exact verse citations from the supplied primary or secondary sermon passage/);
    assert.match(capturedPrompt, /Do not use cross-references, commentary citations, dictionary\/lexicon references/);
    assert.match(capturedPrompt, /"references": \[\]/);
    assert.match(capturedPrompt, /This rule also applies when refining existing study content/);

    const missingReferences = GenerateSermonStudyResponse.safeParse({
      wordStudies: [
        {
          term: "grace",
          originalWord: "χάρις",
          transliteration: "charis",
          language: "Greek",
          strongsNumber: "G5485",
          definition: "Grace.",
          significance: "It matters.",
        },
      ],
    });
    assert.equal(missingReferences.success, false);

    const groundedStudy = GenerateSermonStudyResponse.safeParse({
      wordStudies: [
        {
          term: "grace",
          originalWord: "χάρις",
          transliteration: "charis",
          language: "Greek",
          strongsNumber: "G5485",
          definition: "Grace.",
          significance: "It matters.",
          references: ["Romans 8:1"],
        },
      ],
    });
    assert.equal(groundedStudy.success, true);
  } finally {
    stub.mock.restore();
    await close();
    await cleanup(uid);
  }
});
