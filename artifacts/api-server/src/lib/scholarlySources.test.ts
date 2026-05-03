/**
 * Lightweight smoke tests for the passage-ref parser and registry. We don't
 * have vitest wired up at the workspace yet — this file is a `node --test`
 * script using node's built-in test runner so it works with no deps.
 *
 * Run with: `node --import tsx --test artifacts/api-server/src/lib/scholarlySources.test.ts`
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePassageRef,
  lookupCommentary,
  listRegisteredSources,
  isRegisteredSource,
  DEFAULT_ENABLED_SOURCE_IDS,
} from "./scholarlySources";

test("parsePassageRef: simple chapter:verse", () => {
  assert.deepEqual(parsePassageRef("Romans 8:28"), [
    { book: "romans", chapter: 8 },
  ]);
});

test("parsePassageRef: range within one chapter", () => {
  assert.deepEqual(parsePassageRef("John 3:16-21"), [
    { book: "john", chapter: 3 },
  ]);
});

test("parsePassageRef: whole chapter", () => {
  assert.deepEqual(parsePassageRef("Romans 8"), [
    { book: "romans", chapter: 8 },
  ]);
});

test("parsePassageRef: numbered book", () => {
  assert.deepEqual(parsePassageRef("1 John 4:7-21"), [
    { book: "1 john", chapter: 4 },
  ]);
});

test("parsePassageRef: comma-separated verse continuation stays in same chapter", () => {
  // Regression: "Romans 8:28, 29" used to read "29" as chapter 29.
  assert.deepEqual(parsePassageRef("Romans 8:28, 29"), [
    { book: "romans", chapter: 8 },
  ]);
  // Multi-segment verse continuation.
  assert.deepEqual(parsePassageRef("John 3:16, 17, 18"), [
    { book: "john", chapter: 3 },
  ]);
  // A bare number after a SEMICOLON-separated chapter ref is still treated
  // as a verse continuation of that chapter (consistent behaviour).
  assert.deepEqual(parsePassageRef("Romans 8:28; 12:1, 2"), [
    { book: "romans", chapter: 8 },
    { book: "romans", chapter: 12 },
  ]);
});

test("parsePassageRef: numbered book without space", () => {
  assert.deepEqual(parsePassageRef("1Cor 13"), [
    { book: "1 corinthians", chapter: 13 },
  ]);
});

test("parsePassageRef: abbreviation", () => {
  assert.deepEqual(parsePassageRef("Ps 23"), [{ book: "psalms", chapter: 23 }]);
});

test("parsePassageRef: multi-segment with same book continuation", () => {
  assert.deepEqual(parsePassageRef("Romans 8:28; 12:1"), [
    { book: "romans", chapter: 8 },
    { book: "romans", chapter: 12 },
  ]);
});

test("parsePassageRef: chapter range expands", () => {
  assert.deepEqual(parsePassageRef("John 14-15"), [
    { book: "john", chapter: 14 },
    { book: "john", chapter: 15 },
  ]);
});

test("parsePassageRef: cross-chapter verse range", () => {
  assert.deepEqual(parsePassageRef("Romans 8:28-9:3"), [
    { book: "romans", chapter: 8 },
    { book: "romans", chapter: 9 },
  ]);
});

test("parsePassageRef: Song of Songs", () => {
  assert.deepEqual(parsePassageRef("Song of Songs 2:1"), [
    { book: "song of songs", chapter: 2 },
  ]);
});

test("parsePassageRef: empty / garbage", () => {
  assert.deepEqual(parsePassageRef(""), []);
  assert.deepEqual(parsePassageRef(null), []);
  assert.deepEqual(parsePassageRef("Twelfth book 99"), []);
});

test("registry: only sources with populated book corpora are registered", () => {
  const sources = listRegisteredSources();
  // v1 ships book JSON only for matthew-henry-concise. Manifest-only stubs
  // are explicitly skipped by the loader so users never see no-op toggles.
  assert.ok(sources.length >= 1, `expected ≥1 source, got ${sources.length}`);
  assert.ok(sources.every((s) => s.id && s.title && s.license));
  assert.ok(
    sources.some((s) => s.id === "matthew-henry-concise"),
    "matthew-henry-concise must be registered",
  );
  // Stub sources must NOT appear in the registry until their corpora ship.
  for (const stub of [
    "barnes-notes",
    "keil-delitzsch",
    "jamieson-fausset-brown",
    "pulpit-commentary",
    "john-gill",
    "adam-clarke",
  ]) {
    assert.ok(
      !isRegisteredSource(stub),
      `${stub} should be excluded (manifest-only)`,
    );
  }
});

test("registry: defaults are all registered", () => {
  assert.ok(DEFAULT_ENABLED_SOURCE_IDS.length > 0, "defaults must not be empty");
  for (const id of DEFAULT_ENABLED_SOURCE_IDS) {
    assert.ok(isRegisteredSource(id), `default ${id} not in registry`);
  }
});

test("lookupCommentary: hits Matthew Henry on Romans 8", () => {
  const hits = lookupCommentary(["matthew-henry-concise"], ["Romans 8:28"]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].sourceId, "matthew-henry-concise");
  assert.equal(hits[0].chapter, 8);
  assert.equal(hits[0].bookCanonical, "romans");
  assert.ok(hits[0].text.length > 0);
});

test("lookupCommentary: returns nothing for sources excluded from registry", () => {
  // barnes-notes is manifest-only and skipped by the loader, so even if a
  // stale preference row references it, lookupCommentary must yield 0.
  const hits = lookupCommentary(["barnes-notes"], ["Romans 8:28"]);
  assert.equal(hits.length, 0);
});

test("lookupCommentary: gracefully ignores unknown source ids", () => {
  const hits = lookupCommentary(
    ["nonexistent-source", "matthew-henry-concise"],
    ["John 3:16"],
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].sourceId, "matthew-henry-concise");
});

test("lookupCommentary: respects maxHits cap", () => {
  const hits = lookupCommentary(
    ["matthew-henry-concise"],
    ["John 1; John 3; John 14; John 15"],
    2,
  );
  assert.equal(hits.length, 2);
});
