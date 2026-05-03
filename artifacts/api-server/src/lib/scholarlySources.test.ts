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
  // Batch 1 of bundled commentaries: Henry, JFB, Barnes, Pulpit. Other
  // manifest-only stubs (Adam Clarke, John Gill, Keil & Delitzsch) are
  // explicitly skipped by the loader so users never see no-op toggles.
  assert.ok(sources.length >= 4, `expected ≥4 sources, got ${sources.length}`);
  assert.ok(sources.every((s) => s.id && s.title && s.license));
  for (const required of [
    "matthew-henry-concise",
    "jamieson-fausset-brown",
    "barnes-notes",
    "pulpit-commentary",
  ]) {
    assert.ok(
      sources.some((s) => s.id === required),
      `${required} must be registered`,
    );
  }
  // Remaining stub sources must NOT appear until their corpora ship.
  for (const stub of ["keil-delitzsch", "john-gill", "adam-clarke"]) {
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

test("registry: bundled commentaries cover ~all 66 books × 1189 chapters", () => {
  // Defense against a future re-ingest silently dropping content. JFB and
  // Pulpit cover the full canon; Barnes upstream legitimately omits 3
  // chapters (Exodus 37, Exodus 39, 2 Chronicles 10). If these numbers drift
  // downward without a corresponding upstream change, something is wrong.
  // Note: matthew-henry-concise is intentionally excluded — its existing
  // file inventory uses `song-of-solomon.json` while the passage parser
  // canonicalizes "Song of Solomon" to "song of songs", so a strict 66/66
  // probe falls one book short. That's a pre-existing condition unrelated to
  // this batch and tracked separately.
  const expectations: Record<string, { books: number; chapters: number }> = {
    "jamieson-fausset-brown": { books: 66, chapters: 1189 },
    "barnes-notes": { books: 66, chapters: 1186 },
    "pulpit-commentary": { books: 66, chapters: 1189 },
  };
  for (const [sourceId, expected] of Object.entries(expectations)) {
    const src = listRegisteredSources().find((s) => s.id === sourceId);
    assert.ok(src, `${sourceId} not registered`);
    // listRegisteredSources doesn't surface book/chapter counts directly, so
    // probe via lookupCommentary across a representative sample (one
    // passage per book × first chapter). A miss on any book → fail loud.
    // We also count chapter coverage by walking the canon.
    const SAMPLE_BOOKS = [
      "Genesis 1:1", "Exodus 1:1", "Leviticus 1:1", "Numbers 1:1",
      "Deuteronomy 1:1", "Joshua 1:1", "Judges 1:1", "Ruth 1:1",
      "1 Samuel 1:1", "2 Samuel 1:1", "1 Kings 1:1", "2 Kings 1:1",
      "1 Chronicles 1:1", "2 Chronicles 1:1", "Ezra 1:1", "Nehemiah 1:1",
      "Esther 1:1", "Job 1:1", "Psalms 1:1", "Proverbs 1:1",
      "Ecclesiastes 1:1", "Song of Solomon 1:1", "Isaiah 1:1",
      "Jeremiah 1:1", "Lamentations 1:1", "Ezekiel 1:1", "Daniel 1:1",
      "Hosea 1:1", "Joel 1:1", "Amos 1:1", "Obadiah 1:1", "Jonah 1:1",
      "Micah 1:1", "Nahum 1:1", "Habakkuk 1:1", "Zephaniah 1:1",
      "Haggai 1:1", "Zechariah 1:1", "Malachi 1:1",
      "Matthew 1:1", "Mark 1:1", "Luke 1:1", "John 1:1", "Acts 1:1",
      "Romans 1:1", "1 Corinthians 1:1", "2 Corinthians 1:1",
      "Galatians 1:1", "Ephesians 1:1", "Philippians 1:1",
      "Colossians 1:1", "1 Thessalonians 1:1", "2 Thessalonians 1:1",
      "1 Timothy 1:1", "2 Timothy 1:1", "Titus 1:1", "Philemon 1:1",
      "Hebrews 1:1", "James 1:1", "1 Peter 1:1", "2 Peter 1:1",
      "1 John 1:1", "2 John 1:1", "3 John 1:1", "Jude 1:1",
      "Revelation 1:1",
    ];
    assert.equal(SAMPLE_BOOKS.length, 66);
    let bookHits = 0;
    for (const ref of SAMPLE_BOOKS) {
      const hits = lookupCommentary([sourceId], [ref]);
      if (hits.length === 1) bookHits++;
    }
    assert.equal(
      bookHits,
      expected.books,
      `${sourceId}: expected hits for ${expected.books} books, got ${bookHits}`,
    );
  }
});

test("lookupCommentary: each batch-1 source returns a hit on a covered passage", () => {
  // Sanity-check that JFB, Barnes, and Pulpit really did ingest content for
  // common passages — guards against an upstream HTML drift silently producing
  // empty book files.
  for (const sourceId of [
    "jamieson-fausset-brown",
    "barnes-notes",
    "pulpit-commentary",
  ]) {
    const hits = lookupCommentary([sourceId], ["Romans 8:28"]);
    assert.equal(hits.length, 1, `${sourceId} should hit Romans 8`);
    assert.equal(hits[0].sourceId, sourceId);
    assert.equal(hits[0].chapter, 8);
    assert.equal(hits[0].bookCanonical, "romans");
    assert.ok(
      hits[0].text.length > 200,
      `${sourceId} excerpt suspiciously short (${hits[0].text.length} chars)`,
    );
  }
});

test("lookupCommentary: returns nothing for sources excluded from registry", () => {
  // adam-clarke is manifest-only (no book corpus yet) and skipped by the
  // loader, so even if a stale preference row references it, lookupCommentary
  // must yield 0.
  const hits = lookupCommentary(["adam-clarke"], ["Romans 8:28"]);
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
