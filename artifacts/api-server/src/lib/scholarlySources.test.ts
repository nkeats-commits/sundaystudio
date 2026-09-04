/**
 * Lightweight smoke tests for the passage-ref parser and registry. We don't
 * have vitest wired up at the workspace yet — this file is a `node --test`
 * script using node's built-in test runner so it works with no deps.
 *
 * Run with: `node --import tsx --test artifacts/api-server/src/lib/scholarlySources.test.ts`
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
  // The first three shipped batches provide ten task-relevant sources. Later
  // batches may add more, so assert the floor rather than an exact total.
  assert.ok(sources.length >= 10, `expected ≥10 sources, got ${sources.length}`);
  assert.ok(sources.every((s) => s.id && s.title && s.license));
  for (const required of [
    "matthew-henry-concise",
    "jamieson-fausset-brown",
    "barnes-notes",
    "pulpit-commentary",
    "adam-clarke",
    "john-gill",
    "keil-delitzsch",
    "matthew-poole",
    "wesley-explanatory-notes",
    "ellicott-english-readers",
    "joseph-benson",
    "john-trapp",
    "thomas-scott",
  ]) {
    assert.ok(
      sources.some((s) => s.id === required),
      `${required} must be registered`,
    );
  }
});

test("registry: defaults are all registered", () => {
  assert.deepEqual(
    DEFAULT_ENABLED_SOURCE_IDS,
    ["matthew-henry-concise"],
    "new commentary bundles must remain opt-in",
  );
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
  // Defense against a future re-ingest silently dropping content. These are
  // the hand-verified upstream totals: Barnes omits four chapters, Gill omits
  // twelve Chronicles chapters, and K&D is OT-only with two Chronicles gaps.
  // If these numbers drift downward without a corresponding upstream change,
  // something is wrong.
  // Note: matthew-henry-concise is intentionally excluded — its existing
  // file inventory uses `song-of-solomon.json` while the passage parser
  // canonicalizes "Song of Solomon" to "song of songs", so a strict 66/66
  // probe falls one book short. That's a pre-existing condition unrelated to
  // this batch and tracked separately.
  const expectations: Record<string, { books: number; chapters: number }> = {
    "jamieson-fausset-brown": { books: 66, chapters: 1189 },
    "barnes-notes": { books: 66, chapters: 1185 },
    "pulpit-commentary": { books: 66, chapters: 1189 },
    "adam-clarke": { books: 66, chapters: 1189 },
    "john-gill": { books: 66, chapters: 1177 },
    "keil-delitzsch": { books: 39, chapters: 927 },
    "matthew-poole": { books: 66, chapters: 1189 },
    "wesley-explanatory-notes": { books: 66, chapters: 1175 },
    "ellicott-english-readers": { books: 64, chapters: 1158 },
    "joseph-benson": { books: 66, chapters: 1186 },
    "john-trapp": { books: 65, chapters: 1186 },
    "thomas-scott": { books: 1, chapters: 149 },
  };
  const CANONICAL_BOOKS: ReadonlyArray<readonly [string, number]> = [
    ["Genesis", 50], ["Exodus", 40], ["Leviticus", 27], ["Numbers", 36],
    ["Deuteronomy", 34], ["Joshua", 24], ["Judges", 21], ["Ruth", 4],
    ["1 Samuel", 31], ["2 Samuel", 24], ["1 Kings", 22], ["2 Kings", 25],
    ["1 Chronicles", 29], ["2 Chronicles", 36], ["Ezra", 10],
    ["Nehemiah", 13], ["Esther", 10], ["Job", 42], ["Psalms", 150],
    ["Proverbs", 31], ["Ecclesiastes", 12], ["Song of Solomon", 8],
    ["Isaiah", 66], ["Jeremiah", 52], ["Lamentations", 5], ["Ezekiel", 48],
    ["Daniel", 12], ["Hosea", 14], ["Joel", 3], ["Amos", 9],
    ["Obadiah", 1], ["Jonah", 4], ["Micah", 7], ["Nahum", 3],
    ["Habakkuk", 3], ["Zephaniah", 3], ["Haggai", 2], ["Zechariah", 14],
    ["Malachi", 4], ["Matthew", 28], ["Mark", 16], ["Luke", 24],
    ["John", 21], ["Acts", 28], ["Romans", 16], ["1 Corinthians", 16],
    ["2 Corinthians", 13], ["Galatians", 6], ["Ephesians", 6],
    ["Philippians", 4], ["Colossians", 4], ["1 Thessalonians", 5],
    ["2 Thessalonians", 3], ["1 Timothy", 6], ["2 Timothy", 4],
    ["Titus", 3], ["Philemon", 1], ["Hebrews", 13], ["James", 5],
    ["1 Peter", 5], ["2 Peter", 3], ["1 John", 5], ["2 John", 1],
    ["3 John", 1], ["Jude", 1], ["Revelation", 22],
  ];
  for (const [sourceId, expected] of Object.entries(expectations)) {
    const src = listRegisteredSources().find((s) => s.id === sourceId);
    assert.ok(src, `${sourceId} not registered`);
    // listRegisteredSources doesn't surface chapter counts directly, so probe
    // every canonical chapter. A miss on any expected chapter fails loud.
    const SAMPLE_BOOKS = CANONICAL_BOOKS.map(([book]) => `${book} 1:1`);
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

    let chapterHits = 0;
    for (const [book, chapterCount] of CANONICAL_BOOKS) {
      for (let chapter = 1; chapter <= chapterCount; chapter++) {
        const hits = lookupCommentary([sourceId], [`${book} ${chapter}`]);
        if (hits.length === 1) chapterHits++;
      }
    }
    assert.equal(
      chapterHits,
      expected.chapters,
      `${sourceId}: expected ${expected.chapters} chapters, got ${chapterHits}`,
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

test("lookupCommentary: each batch-2 source returns a hit on covered passages", () => {
  const passages: Record<string, string> = {
    "adam-clarke": "Romans 8:28",
    "john-gill": "Romans 8:28",
    "keil-delitzsch": "Genesis 1:1",
  };
  for (const [sourceId, passage] of Object.entries(passages)) {
    const hits = lookupCommentary([sourceId], [passage]);
    assert.equal(hits.length, 1, `${sourceId} should hit ${passage}`);
    assert.equal(hits[0].sourceId, sourceId);
    assert.ok(
      hits[0].text.length > 200,
      `${sourceId} excerpt suspiciously short (${hits[0].text.length} chars)`,
    );
  }
});

test("lookupCommentary: each new public-domain source returns clean attributed text", () => {
  for (const sourceId of [
    "matthew-poole",
    "wesley-explanatory-notes",
    "ellicott-english-readers",
    "joseph-benson",
    "john-trapp",
  ]) {
    const hits = lookupCommentary([sourceId], ["Romans 8:28"]);
    assert.equal(hits.length, 1, `${sourceId} should hit Romans 8`);
    assert.equal(hits[0].sourceId, sourceId);
    assert.ok(hits[0].sourceTitle, `${sourceId} must expose a title`);
    assert.ok(hits[0].sourceAuthor, `${sourceId} must expose an author`);
    assert.ok(
      hits[0].text.length > 200,
      `${sourceId} excerpt suspiciously short (${hits[0].text.length} chars)`,
    );
    assert.doesNotMatch(
      hits[0].text,
      /<[^>]+>|javascript:|advertisement|related resources|See note at/i,
      `${sourceId} excerpt contains upstream page artifacts`,
    );
  }
});

test("lookupCommentary: Scott returns clean Psalms-only text with attribution", () => {
  const hits = lookupCommentary(["thomas-scott"], ["Psalms 23:1"]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].sourceId, "thomas-scott");
  assert.equal(hits[0].sourceAuthor, "Thomas Scott");
  assert.ok(hits[0].text.length >= 80);
  assert.doesNotMatch(
    hits[0].text,
    /<[^>]+>|javascript:|advertisement|SermonIndex|Thomas Scott's Explanatory Notes on the Bible/i,
  );
});

test("new commentary corpora contain no upstream placeholders, HTML, or footers", () => {
  const root = join(process.cwd(), "data", "commentaries");
  for (const sourceId of [
    "matthew-poole",
    "wesley-explanatory-notes",
    "ellicott-english-readers",
    "joseph-benson",
    "john-trapp",
    "thomas-scott",
  ]) {
    for (const file of readdirSync(join(root, sourceId))) {
      if (file === "MANIFEST.json" || !file.endsWith(".json")) continue;
      const raw = readFileSync(join(root, sourceId, file), "utf8");
      const parsed = JSON.parse(raw) as {
        chapters: Record<string, { text: string }>;
      };
      const commentaryText = Object.values(parsed.chapters)
        .map((chapter) => chapter.text)
        .join("\n");
      assert.doesNotMatch(
        commentaryText,
        /<[^>]+>|No text from Poole|Used by Permission|Matthew Poole's Commentary|Ellicott's Commentary for English Readers|SermonIndex\.net|Thomas Scott's Explanatory Notes on the Bible/,
        `${sourceId}/${file} contains upstream page artifacts`,
      );
    }
  }
});

test("lookupCommentary: disabled new sources contribute no context", () => {
  const hits = lookupCommentary(["matthew-henry-concise"], ["Romans 8:28"]);
  assert.ok(hits.length > 0);
  assert.ok(
    hits.every(
      (hit) =>
        ![
          "matthew-poole",
          "wesley-explanatory-notes",
          "ellicott-english-readers",
        ].includes(hit.sourceId),
    ),
  );
});

test("lookupCommentary: gracefully ignores unknown source ids", () => {
  const hits = lookupCommentary(
    ["nonexistent-source", "matthew-henry-concise"],
    ["John 3:16"],
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].sourceId, "matthew-henry-concise");
});

test("lookupCommentary: total chars never exceed totalBudgetChars", () => {
  // Even with many chapters, total injected text must stay within ceiling.
  const budget = 900;
  const hits = lookupCommentary(
    ["matthew-henry-concise"],
    ["John 1; John 3; John 14; John 15"],
    budget,
  );
  const totalChars = hits.reduce((sum, h) => sum + h.text.length, 0);
  assert.ok(
    totalChars <= budget,
    `expected total chars ≤ ${budget}, got ${totalChars}`,
  );
});

test("lookupCommentary: last excerpt is trimmed to fit remaining budget, not dropped", () => {
  // Use a budget that fits one full excerpt plus a small slice of a second.
  // With a tiny budget that is definitely less than a single full excerpt,
  // we should still get exactly one hit whose text length equals the budget
  // (rather than being dropped entirely or exceeding the budget).
  const budget = 100;
  const hits = lookupCommentary(
    ["matthew-henry-concise"],
    ["Romans 8:28"],
    budget,
  );
  assert.equal(hits.length, 1, "should still yield one hit when budget is small");
  assert.ok(
    hits[0].text.length <= budget,
    `expected text ≤ ${budget} chars, got ${hits[0].text.length}`,
  );
  assert.ok(hits[0].text.length > 0, "trimmed hit must not be empty");
});

test("lookupCommentary: multiple sources share the budget, total stays bounded", () => {
  const budget = 1200;
  const allSources = [
    "matthew-henry-concise",
    "jamieson-fausset-brown",
    "barnes-notes",
    "pulpit-commentary",
  ];
  const hits = lookupCommentary(allSources, ["Romans 8:28"], budget);
  const totalChars = hits.reduce((sum, h) => sum + h.text.length, 0);
  assert.ok(
    totalChars <= budget,
    `expected total chars ≤ ${budget} across all sources, got ${totalChars}`,
  );
  // At least one source should have contributed.
  assert.ok(hits.length >= 1, "expected at least one hit");
});
