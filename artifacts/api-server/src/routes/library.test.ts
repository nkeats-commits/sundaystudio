/**
 * Integration tests for the Library bulk-import endpoint.
 *
 * Mounts the real `libraryRouter` on a tiny Express app and exercises
 * `POST /api/library/repertoire/bulk-import` against the real Postgres
 * database via DATABASE_URL. Auth is handled by the test-only
 * `x-test-user-id` header bypass in `middlewares/requireAuth.ts`,
 * gated by NODE_ENV=test.
 *
 * Focus: the new optional CSV-import-only fields (key, ccli, notes,
 * arrangementNotes, lastScheduledDate) must round-trip into the song's
 * `content` jsonb so the rest of the app can read them back.
 *
 * Run with: `pnpm --filter @workspace/api-server run test`
 */
process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import {
  db,
  libraryItemsTable,
  sermonResourcesTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import libraryRouter from "./library";
import sermonResourcesRouter from "./sermonResources";

/**
 * Seed a fresh users-table row so `requireActiveAccess` can compute
 * the local 14-day trial state. The test-only requireAuth bypass
 * deliberately skips this upsert, so each test must do it explicitly
 * when hitting an endpoint guarded by `requireActiveAccess`.
 */
async function seedTrialUser(uid: string) {
  await db.insert(usersTable).values({ id: uid }).onConflictDoNothing();
}

function makeApp() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use("/api", libraryRouter);
  app.use("/api", sermonResourcesRouter);
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
  return `test-user-lib-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function cleanup(uid: string) {
  await db.delete(libraryItemsTable).where(eq(libraryItemsTable.userId, uid));
  await db.delete(sermonResourcesTable).where(eq(sermonResourcesTable.userId, uid));
  await db.delete(usersTable).where(eq(usersTable.id, uid));
}

test("POST /api/library/repertoire/bulk-import round-trips all CSV-import fields", async () => {
  const uid = userId();
  await cleanup(uid);
  await seedTrialUser(uid);
  const { base, close } = await startServer();
  try {
    const songs = [
      {
        title: "Here I Am To Worship",
        artist: "Tim Hughes",
        bpm: 76,
        key: "D",
        ccli: "3266032",
        notes: "Often used as a call-to-worship opener.",
        arrangementNotes: "Catalyst arrangement, capo 2",
        lastScheduledDate: "2026-03-29",
        tags: ["Worship", "Light", "Thankfulness"],
      },
      {
        title: "Goodness of God",
        // Test that empty optional fields are NOT stored as empty strings
        // (would later look like real data and confuse filters/UI).
        // lastScheduledDate is OMITTED here rather than sent as "" — the
        // OpenAPI contract enforces an ISO YYYY-MM-DD pattern at the Zod
        // layer, so clients must drop malformed/empty dates rather than
        // pass them through (matches CsvImportModal's normalizeDate
        // behavior, which returns undefined for unparseable strings).
        artist: "",
        key: "  ",
        ccli: "",
        notes: "",
        arrangementNotes: "",
      },
    ];
    const res = await fetch(`${base}/api/library/repertoire/bulk-import`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": uid,
      },
      body: JSON.stringify({ songs }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      added: number;
      skippedDuplicates: number;
      invalidLines: number;
    };
    assert.equal(body.added, 2);
    assert.equal(body.skippedDuplicates, 0);
    assert.equal(body.invalidLines, 0);

    // Read back from the DB and assert each new field landed in `content`.
    const stored = await db
      .select()
      .from(libraryItemsTable)
      .where(eq(libraryItemsTable.userId, uid));
    assert.equal(stored.length, 2);

    const here = stored.find((r) => r.title === "Here I Am To Worship");
    assert.ok(here, "Here I Am To Worship row missing");
    assert.equal(here!.kind, "song");
    assert.equal(here!.isRepertoire, true);
    const c = here!.content as Record<string, unknown>;
    assert.equal(c.artist, "Tim Hughes");
    assert.equal(c.bpm, 76);
    assert.equal(c.key, "D");
    assert.equal(c.ccli, "3266032");
    assert.equal(c.notes, "Often used as a call-to-worship opener.");
    assert.equal(c.arrangementNotes, "Catalyst arrangement, capo 2");
    assert.equal(c.lastScheduledDate, "2026-03-29");
    assert.deepEqual(here!.tags, ["Worship", "Light", "Thankfulness"]);

    const goodness = stored.find((r) => r.title === "Goodness of God");
    assert.ok(goodness, "Goodness of God row missing");
    const gc = goodness!.content as Record<string, unknown>;
    // Empty/whitespace-only optional fields must be dropped entirely so
    // they don't leak through filters or look like real data.
    assert.equal(gc.artist, undefined);
    assert.equal(gc.key, undefined);
    assert.equal(gc.ccli, undefined);
    assert.equal(gc.notes, undefined);
    assert.equal(gc.arrangementNotes, undefined);
    assert.equal(gc.lastScheduledDate, undefined);
  } finally {
    await close();
    await cleanup(uid);
  }
});

test("Bible lookup resources retain provenance and related passages in Sermon Resources", async () => {
  const uid = userId();
  await cleanup(uid);
  await seedTrialUser(uid);
  const { base, close } = await startServer();
  const headers = {
    "content-type": "application/json",
    "x-test-user-id": uid,
  };
  const resources = [
    {
      resourceType: "bible-text",
      title: "John 3:16",
      author: "Public Domain Committee",
      publisher: "King James Version",
      url: "https://example.test/kjv",
      excerpt: "For God so loved the world.",
      notes: "King James Version, public domain",
      relatedPassage: "John 3:16",
      tags: ["Bible Tools", "Bible text"],
    },
    {
      resourceType: "cross-reference",
      title: "John 3:16 cross-references",
      author: "R. A. Torrey",
      publisher: "Treasury of Scripture Knowledge",
      url: "https://example.test/tsk",
      excerpt: "Related passages: Romans 5:8, 1 John 4:9",
      notes: "Treasury of Scripture Knowledge, public domain",
      relatedPassage: "John 3:16",
      tags: ["Bible Tools", "Cross-reference"],
    },
    {
      resourceType: "lexicon",
      title: "love word study",
      author: "James Strong",
      publisher: "Strong's Greek Dictionary",
      url: "https://example.test/strongs",
      excerpt: "ἀγάπη (agapē)\n\nAffection and benevolence.",
      notes: "Strong's Greek Dictionary, public domain",
      relatedPassage: "John 3:16",
      tags: ["Bible Tools", "Lexicon"],
    },
  ];

  try {
    for (const resource of resources) {
      const res = await fetch(`${base}/api/sermon-resources`, {
        method: "POST",
        headers,
        body: JSON.stringify(resource),
      });
      const text = await res.text();
      assert.equal(res.status, 201, text);
      const saved = JSON.parse(text) as Record<string, unknown>;
      assert.equal(saved.resourceType, resource.resourceType);
      assert.equal(saved.publisher, resource.publisher);
      assert.equal(saved.notes, resource.notes);
      assert.equal(saved.relatedPassage, resource.relatedPassage);
    }

    const list = await fetch(`${base}/api/sermon-resources`, {
      headers: { "x-test-user-id": uid },
    });
    assert.equal(list.status, 200);
    const savedResources = (await list.json()) as Array<Record<string, unknown>>;
    assert.equal(savedResources.length, resources.length);
    for (const resource of resources) {
      const saved = savedResources.find((row) => row.resourceType === resource.resourceType);
      assert.ok(saved, `missing ${resource.resourceType} resource`);
      assert.equal(saved!.publisher, resource.publisher);
      assert.equal(saved!.url, resource.url);
      assert.equal(saved!.notes, resource.notes);
      assert.equal(saved!.relatedPassage, resource.relatedPassage);
    }
  } finally {
    await close();
    await cleanup(uid);
  }
});

test("POST /api/library/repertoire/bulk-import dedupes case-insensitively against existing repertoire", async () => {
  const uid = userId();
  await cleanup(uid);
  await seedTrialUser(uid);
  const { base, close } = await startServer();
  try {
    // Seed the user with one existing repertoire song.
    await db.insert(libraryItemsTable).values({
      userId: uid,
      kind: "song",
      title: "Amazing Grace",
      content: {},
      tags: [],
      isRepertoire: true,
    });

    const res = await fetch(`${base}/api/library/repertoire/bulk-import`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": uid,
      },
      body: JSON.stringify({
        songs: [
          { title: "amazing grace" }, // duplicate (case)
          { title: "  Amazing Grace  " }, // duplicate (whitespace)
          { title: "In Christ Alone" }, // new
        ],
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      added: number;
      skippedDuplicates: number;
      invalidLines: number;
    };
    assert.equal(body.added, 1);
    assert.equal(body.skippedDuplicates, 2);

    const stored = await db
      .select()
      .from(libraryItemsTable)
      .where(eq(libraryItemsTable.userId, uid));
    assert.equal(stored.length, 2);
    assert.ok(stored.some((r) => r.title === "Amazing Grace"));
    assert.ok(stored.some((r) => r.title === "In Christ Alone"));
  } finally {
    await close();
    await cleanup(uid);
  }
});

test("POST /api/library/repertoire/bulk-import rejects malformed bodies", async () => {
  const uid = userId();
  await cleanup(uid);
  await seedTrialUser(uid);
  const { base, close } = await startServer();
  try {
    const res = await fetch(`${base}/api/library/repertoire/bulk-import`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": uid,
      },
      body: JSON.stringify({ songs: "not-an-array" }),
    });
    assert.equal(res.status, 400);
  } finally {
    await close();
    await cleanup(uid);
  }
});
