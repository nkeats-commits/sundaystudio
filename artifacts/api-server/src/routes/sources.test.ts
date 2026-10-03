/**
 * Integration tests for the Scholarly Sources HTTP endpoints.
 *
 * Mounts the real `sourcesRouter` on a tiny Express app and exercises both
 * endpoints against the real Postgres database via `DATABASE_URL`. Auth is
 * handled by the test-only `x-test-user-id` header bypass in
 * `middlewares/requireAuth.ts`, gated by NODE_ENV=test.
 *
 * Run with: `pnpm --filter @workspace/api-server run test`
 */
process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { db, userSourcePreferencesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import sourcesRouter from "./sources";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", sourcesRouter);
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
  return `test-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function cleanup(uid: string) {
  await db
    .delete(userSourcePreferencesTable)
    .where(eq(userSourcePreferencesTable.userId, uid));
}

test("GET /api/sources rejects unauthenticated requests (no bypass header)", async () => {
  const { base, close } = await startServer();
  try {
    // Without the test-only bypass header, requireAuth falls through to
    // Clerk. Clerk middleware is not mounted on this minimal test app, so
    // getAuth throws — manifesting as a 500 here. The important assertion
    // is simply: unauthenticated traffic does NOT receive a 200 with data.
    // (The live server, which has Clerk mounted, returns a clean 401 — see
    // commit message and replit.md for the live-curl verification.)
    const res = await fetch(`${base}/api/sources`);
    assert.notEqual(res.status, 200, "unauthenticated GET must not return 200");
  } finally {
    await close();
  }
});

test("GET /api/sources returns registry + defaults for a fresh user", async () => {
  const uid = userId();
  await cleanup(uid);
  const { base, close } = await startServer();
  try {
    const res = await fetch(`${base}/api/sources`, {
      headers: { "x-test-user-id": uid },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      sources: Array<{ id: string; title: string; license: string }>;
      enabledSourceIds: string[];
      defaults: string[];
    };
    assert.ok(Array.isArray(body.sources) && body.sources.length >= 1);
    assert.ok(
      body.sources.some((s) => s.id === "matthew-henry-concise"),
      "registry must include matthew-henry-concise",
    );
    for (const sourceId of [
      "matthew-poole",
      "wesley-explanatory-notes",
      "ellicott-english-readers",
      "joseph-benson",
      "john-trapp",
      "thomas-scott",
      "augustine-expositions",
      "augustine-john-tractates",
      "luther-galatians",
    ]) {
      assert.ok(
        body.sources.some((s) => s.id === sourceId),
        `registry must include ${sourceId}`,
      );
      assert.ok(
        !body.defaults.includes(sourceId),
        `${sourceId} must remain opt-in`,
      );
    }
    // Fresh user falls back to defaults.
    assert.deepEqual(body.enabledSourceIds, body.defaults);
    assert.ok(body.defaults.includes("matthew-henry-concise"));
  } finally {
    await close();
    await cleanup(uid);
  }
});

test("PUT /api/sources/preferences persists, dedupes, and round-trips", async () => {
  const uid = userId();
  await cleanup(uid);
  const { base, close } = await startServer();
  try {
    const put = await fetch(`${base}/api/sources/preferences`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": uid,
      },
      body: JSON.stringify({
        enabledSourceIds: [
          "matthew-henry-concise",
          "matthew-henry-concise", // dup, must collapse
        ],
      }),
    });
    assert.equal(put.status, 200);
    const putBody = (await put.json()) as { enabledSourceIds: string[] };
    assert.deepEqual(putBody.enabledSourceIds, ["matthew-henry-concise"]);

    // Round-trip: GET returns persisted set, not defaults.
    const get = await fetch(`${base}/api/sources`, {
      headers: { "x-test-user-id": uid },
    });
    const getBody = (await get.json()) as { enabledSourceIds: string[] };
    assert.deepEqual(getBody.enabledSourceIds, ["matthew-henry-concise"]);

    // Toggle off — empty array persists distinctly from defaults.
    const off = await fetch(`${base}/api/sources/preferences`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": uid,
      },
      body: JSON.stringify({ enabledSourceIds: [] }),
    });
    assert.equal(off.status, 200);
    const after = (await (
      await fetch(`${base}/api/sources`, {
        headers: { "x-test-user-id": uid },
      })
    ).json()) as { enabledSourceIds: string[] };
    assert.deepEqual(after.enabledSourceIds, []);
  } finally {
    await close();
    await cleanup(uid);
  }
});

test("PUT /api/sources/preferences rejects unknown source ids", async () => {
  const uid = userId();
  await cleanup(uid);
  const { base, close } = await startServer();
  try {
    const res = await fetch(`${base}/api/sources/preferences`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": uid,
      },
      body: JSON.stringify({
        enabledSourceIds: ["matthew-henry-concise", "totally-fake-source"],
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /totally-fake-source|unknown|invalid|registered/i);
  } finally {
    await close();
    await cleanup(uid);
  }
});

test("PUT /api/sources/preferences rejects malformed bodies", async () => {
  const uid = userId();
  const { base, close } = await startServer();
  try {
    const res = await fetch(`${base}/api/sources/preferences`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": uid,
      },
      body: JSON.stringify({ enabledSourceIds: "not-an-array" }),
    });
    assert.equal(res.status, 400);
  } finally {
    await close();
  }
});

test("POST /api/sources/lookup returns bounded, source-labeled reference results", async () => {
  const uid = userId();
  await cleanup(uid);
  const { base, close } = await startServer();
  try {
    const preferences = await fetch(`${base}/api/sources/preferences`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": uid,
      },
      body: JSON.stringify({
        enabledSourceIds: ["kjv-1769", "tsk-1830", "strongs-1890"],
      }),
    });
    assert.equal(preferences.status, 200);

    const res = await fetch(`${base}/api/sources/lookup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": uid,
      },
      body: JSON.stringify({ passage: "John 3:16", terms: ["love"] }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      translations: Array<{ sourceId: string; attribution: string }>;
      crossReferences: Array<{ sourceId: string; attribution: string }>;
      lexicalEntries: Array<{ sourceId: string; attribution: string }>;
    };
    assert.ok(body.translations.some((hit) => hit.sourceId === "kjv-1769"));
    assert.ok(body.crossReferences.some((hit) => hit.sourceId === "tsk-1830"));
    assert.ok(body.lexicalEntries.some((hit) => hit.sourceId === "strongs-1890"));
    assert.ok(
      [...body.translations, ...body.crossReferences, ...body.lexicalEntries]
        .every((hit) => hit.attribution),
    );
  } finally {
    await close();
    await cleanup(uid);
  }
});

test("POST /api/sources/lookup supports term-only Strong's lookup and rejects empty requests", async () => {
  const uid = userId();
  await cleanup(uid);
  const { base, close } = await startServer();
  try {
    const preferences = await fetch(`${base}/api/sources/preferences`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": uid,
      },
      body: JSON.stringify({ enabledSourceIds: ["strongs-1890"] }),
    });
    assert.equal(preferences.status, 200);

    const termOnly = await fetch(`${base}/api/sources/lookup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": uid,
      },
      body: JSON.stringify({ terms: ["G26"] }),
    });
    assert.equal(termOnly.status, 200);
    const termBody = (await termOnly.json()) as {
      translations: unknown[];
      crossReferences: unknown[];
      lexicalEntries: Array<{
        strongsNumber?: string;
        attribution: string;
        references: string[];
      }>;
    };
    assert.equal(termBody.translations.length, 0);
    assert.equal(termBody.crossReferences.length, 0);
    assert.ok(termBody.lexicalEntries.some((hit) => hit.strongsNumber === "G26"));
    assert.ok(termBody.lexicalEntries.every((hit) => hit.attribution));
    const love = termBody.lexicalEntries.find((hit) => hit.strongsNumber === "G26");
    assert.ok(love);
    assert.ok(love.references.length > 0);
    assert.equal(new Set(love.references).size, love.references.length);
    assert.ok(love.references.every((reference) => /^[1-3]? ?[A-Za-z]+(?: [A-Za-z]+)? \d+:\d+$/.test(reference)));

    const passageWithNoTerms = await fetch(`${base}/api/sources/lookup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": uid,
      },
      body: JSON.stringify({ passage: "John 3:16", terms: [] }),
    });
    assert.equal(passageWithNoTerms.status, 200);

    const empty = await fetch(`${base}/api/sources/lookup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": uid,
      },
      body: JSON.stringify({}),
    });
    assert.equal(empty.status, 400);
  } finally {
    await close();
    await cleanup(uid);
  }
});

test("POST /api/sources/lookup accepts exact selected-word context", async () => {
  const uid = userId();
  await cleanup(uid);
  const { base, close } = await startServer();
  try {
    const preferences = await fetch(`${base}/api/sources/preferences`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-test-user-id": uid },
      body: JSON.stringify({ enabledSourceIds: ["kjv-1769", "strongs-1890"] }),
    });
    assert.equal(preferences.status, 200);
    const res = await fetch(`${base}/api/sources/lookup`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user-id": uid },
      body: JSON.stringify({
        passage: "John 3:16",
        selectedWord: {
          translationSourceId: "kjv-1769",
          reference: "John 3:16",
          tokenIndex: 3,
          tokenText: "loved",
          passageContext: "John 3:16",
        },
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      selectedWordStudy?: {
        status: string;
        tokenText: string;
        candidates: Array<{ strongsNumber?: string }>;
      };
    };
    assert.equal(body.selectedWordStudy?.status, "verified");
    assert.equal(body.selectedWordStudy?.tokenText, "loved");
    assert.ok(body.selectedWordStudy?.candidates.some((candidate) => candidate.strongsNumber === "G25"));
  } finally {
    await close();
    await cleanup(uid);
  }
});
