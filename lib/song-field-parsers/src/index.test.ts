/**
 * Canonical unit tests for the shared song field parsers.
 *
 * These tests confirm that the canonical implementations behave identically
 * to what the server OAuth sync and the client CSV importer relied on before
 * unification. If these pass, server and client will produce the same
 * normalized output for any given raw input.
 *
 * Run with: `pnpm --filter @workspace/song-field-parsers run test`
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  coerceBpm,
  normalizePcoDateString,
  parseKeyList,
  splitList,
  dedupeCaseInsensitive,
} from "./index.js";

// ---------------------------------------------------------------------------
// coerceBpm
// ---------------------------------------------------------------------------

test("coerceBpm: valid integer string within range", () => {
  assert.equal(coerceBpm("120"), 120);
  assert.equal(coerceBpm("30"), 30);
  assert.equal(coerceBpm("300"), 300);
});

test("coerceBpm: valid number within range", () => {
  assert.equal(coerceBpm(75), 75);
  assert.equal(coerceBpm(142.7), 143);
});

test("coerceBpm: clamps values outside 30-300", () => {
  assert.equal(coerceBpm(29), null);
  assert.equal(coerceBpm(301), null);
  assert.equal(coerceBpm(0), null);
  assert.equal(coerceBpm(-1), null);
  assert.equal(coerceBpm(1000), null);
});

test("coerceBpm: returns null for missing/non-numeric values", () => {
  assert.equal(coerceBpm(null), null);
  assert.equal(coerceBpm(undefined), null);
  assert.equal(coerceBpm(""), null);
  assert.equal(coerceBpm("abc"), null);
  assert.equal(coerceBpm("fast"), null);
  assert.equal(coerceBpm(NaN), null);
});

// ---------------------------------------------------------------------------
// normalizePcoDateString
// ---------------------------------------------------------------------------

test("normalizePcoDateString: already-ISO dates pass through unchanged", () => {
  assert.equal(normalizePcoDateString("2026-05-03"), "2026-05-03");
  assert.equal(normalizePcoDateString("2025-12-31"), "2025-12-31");
  assert.equal(normalizePcoDateString("2026-01-01"), "2026-01-01");
});

test("normalizePcoDateString: ISO 8601 datetime — extracts date prefix", () => {
  // PCO API format — server path.
  assert.equal(normalizePcoDateString("2024-03-17T07:00:00Z"), "2024-03-17");
  assert.equal(normalizePcoDateString("2025-12-31T23:59:59Z"), "2025-12-31");
});

test("normalizePcoDateString: human-readable PCO CSV dates (local calendar day)", () => {
  // Client CSV path — "May 03, 2026" must yield "2026-05-03" regardless of
  // host timezone. We use local getters, not UTC, so no day shift occurs.
  assert.equal(normalizePcoDateString("May 03, 2026"), "2026-05-03");
  assert.equal(normalizePcoDateString("March 29, 2026"), "2026-03-29");
  assert.equal(normalizePcoDateString("January 1, 2026"), "2026-01-01");
  assert.equal(normalizePcoDateString("December 31, 2025"), "2025-12-31");
});

test("normalizePcoDateString: returns null for missing or unparseable values", () => {
  assert.equal(normalizePcoDateString(null), null);
  assert.equal(normalizePcoDateString(undefined), null);
  assert.equal(normalizePcoDateString(""), null);
  assert.equal(normalizePcoDateString("   "), null);
  assert.equal(normalizePcoDateString("soon"), null);
  assert.equal(normalizePcoDateString("TBD"), null);
  assert.equal(normalizePcoDateString("next week"), null);
});

// ---------------------------------------------------------------------------
// parseKeyList
// ---------------------------------------------------------------------------

test("parseKeyList: comma-separated plain keys", () => {
  assert.deepEqual(parseKeyList("G, A, Bb"), ["G", "A", "Bb"]);
  assert.deepEqual(parseKeyList("C"), ["C"]);
});

test("parseKeyList: strips PCO annotation suffixes", () => {
  // PCO sometimes annotates keys: "F: Original Key, G"
  assert.deepEqual(parseKeyList("F: Original Key, G"), ["F", "G"]);
  assert.deepEqual(parseKeyList("A: Original Key"), ["A"]);
});

test("parseKeyList: deduplicates case-insensitively, preserving first-seen casing", () => {
  assert.deepEqual(parseKeyList("G, g, G#"), ["G", "G#"]);
});

test("parseKeyList: returns empty array for missing/empty input", () => {
  assert.deepEqual(parseKeyList(null), []);
  assert.deepEqual(parseKeyList(undefined), []);
  assert.deepEqual(parseKeyList(""), []);
});

// ---------------------------------------------------------------------------
// splitList
// ---------------------------------------------------------------------------

test("splitList: comma-separated strings", () => {
  assert.deepEqual(splitList("Worship, Praise, Thanksgiving"), [
    "Worship",
    "Praise",
    "Thanksgiving",
  ]);
});

test("splitList: returns empty array for null/undefined/empty", () => {
  assert.deepEqual(splitList(null), []);
  assert.deepEqual(splitList(undefined), []);
  assert.deepEqual(splitList(""), []);
});

// ---------------------------------------------------------------------------
// dedupeCaseInsensitive
// ---------------------------------------------------------------------------

test("dedupeCaseInsensitive: drops case-insensitive duplicates, keeps first-seen casing", () => {
  assert.deepEqual(dedupeCaseInsensitive(["Worship", "worship", "PRAISE"]), [
    "Worship",
    "PRAISE",
  ]);
});
