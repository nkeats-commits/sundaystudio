/**
 * Regression coverage for BibleHub's chapter-page layout.
 *
 * This fixture is intentionally kept as HTML rather than mocked parser input:
 * if BibleHub moves the `.chap`, `.versenum`, or `.verse` elements, this test
 * should fail before an ingest can silently save incomplete excerpts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  diffExactCoverage,
  extractCcelBookContent,
  extractBibleHubExcerpt,
  extractNewAdventExcerpt,
  extractSermonIndexExcerpt,
  KNOWN_EMPTY_UPSTREAM,
} from "./ingestCommentary.js";
import {
  COMMENTARY_VALIDATION_SPECS,
  expectedChapterTotal,
  validateCoverage,
} from "./commentaryValidation.js";

const bibleHubChapterFixture = readFileSync(
  new URL("./fixtures/biblehub-genesis-1.html", import.meta.url),
  "utf8",
);

test("extractBibleHubExcerpt preserves commentary while stripping BibleHub page noise", () => {
  const excerpt = extractBibleHubExcerpt(bibleHubChapterFixture);

  assert.ok(
    excerpt.startsWith(
      "The opening sentence presents creation as the deliberate work of God",
    ),
  );
  assert.match(excerpt, /The light appears in response to the divine word/);
  assert.doesNotMatch(
    excerpt,
    /In the beginning God created|And the earth was without form|And God said, Let there be light/,
  );
  assert.doesNotMatch(
    excerpt,
    /Text Courtesy of Internet Sacred Texts Archive|Related resources|advertisement|Copyright/,
  );
  assert.ok(
    excerpt.length > 1_200,
    `fixture should exercise the long-excerpt path (got ${excerpt.length} characters)`,
  );
  assert.ok(
    excerpt.length <= 1_401,
    `excerpt should stay at the configured cap (got ${excerpt.length} characters)`,
  );
  assert.match(
    excerpt,
    /[a-z)]…$/,
    "a truncated excerpt should end at a word boundary, not in the middle of a word",
  );
});

test("extractBibleHubExcerpt handles Poole's chapter-page shape", () => {
  const excerpt = extractBibleHubExcerpt(
    readFileSync(new URL("./fixtures/biblehub-poole.html", import.meta.url), "utf8"),
  );
  assert.equal(
    excerpt,
    "Matthew Poole explains the passage with concise doctrinal and practical notes.",
  );
  assert.doesNotMatch(
    excerpt,
    /Blessed are|advertisement|Bible Hub|No text from Poole|Used by Permission/,
  );
});

test("extractBibleHubExcerpt handles Ellicott's chapter-page shape", () => {
  const excerpt = extractBibleHubExcerpt(
    readFileSync(
      new URL("./fixtures/biblehub-ellicott.html", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    excerpt,
    "Commentary. Ellicott supplies historical and linguistic context for the passage.",
  );
  assert.doesNotMatch(
    excerpt,
    /In the beginning|related resources|Copyright|Used by Permission/,
  );
});

test("extractBibleHubExcerpt handles Wesley's chapter-page shape", () => {
  const excerpt = extractBibleHubExcerpt(
    readFileSync(new URL("./fixtures/biblehub-wesley.html", import.meta.url), "utf8"),
  );
  assert.equal(
    excerpt,
    "Wesley calls the church to trust the promise and walk in holiness.",
  );
  assert.doesNotMatch(excerpt, /scripture text|navigation|advertisement/);
});

test("extractSermonIndexExcerpt keeps commentary and strips verse/page noise", () => {
  const excerpt = extractSermonIndexExcerpt(
    readFileSync(
      new URL("./fixtures/sermonindex-trapp.html", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    excerpt,
    "Trapp explains the opening verse with concise theological and practical observations for the reader. The second note supplies further explanatory context.",
  );
  assert.doesNotMatch(
    excerpt,
    /Genesis 1:1|Genesis 1:2|In the beginning|without form|navigation|SermonIndex/,
  );
});

test("extractNewAdventExcerpt removes the support banner and publication footer", () => {
  const excerpt = extractNewAdventExcerpt(
    readFileSync(
      new URL("./fixtures/newadvent-psalm.html", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    excerpt,
    "1. The Lord is my Shepherd, and I shall lack nothing. The Lord Jesus Christ is my Shepherd, and I shall lack nothing. 2. He leads me beside the waters of refreshment, where faith receives the gift of grace.",
  );
  assert.doesNotMatch(excerpt, /New Advent|About this page|Source\./);
});

test("extractCcelBookContent keeps nested chapter prose and excludes page navigation", () => {
  const excerpt = extractCcelBookContent(
    readFileSync(
      new URL("./fixtures/ccel-luther-galatians.html", import.meta.url),
      "utf8",
    ),
  );
  assert.match(excerpt, /Stand fast therefore/);
  assert.match(excerpt, /faith receives righteousness freely/);
  assert.match(excerpt, /nested page element/);
  assert.doesNotMatch(excerpt, /Galatians 5/);
});

test("diffExactCoverage rejects both unlisted gaps and stale allowlist entries", () => {
  const result = diffExactCoverage(
    new Set(["genesis 1", "genesis 3"]),
    [{ canonical: "genesis", chapters: 3 }],
    ["genesis 3"],
  );
  assert.deepEqual(result, {
    missing: ["genesis 2"],
    unexpected: ["genesis 3"],
  });
});

test("commentary validation contract keeps documented totals and gaps exact", () => {
  const barnes = COMMENTARY_VALIDATION_SPECS.find(
    (spec) => spec.sourceId === "barnes-notes",
  );
  assert.ok(barnes);
  assert.equal(expectedChapterTotal(barnes), 1185);
  const coverage = validateCoverage(
    barnes,
    new Map([
      ["genesis", Array.from({ length: 50 }, (_, index) => index + 1)],
    ]),
  );
  assert.ok(coverage.missing.includes("exodus 1"));
  assert.ok(coverage.unexpected.length === 0);
});

test("commentary validation contract preserves source-specific excerpt floors", () => {
  assert.equal(
    COMMENTARY_VALIDATION_SPECS.find((spec) => spec.sourceId === "wesley-explanatory-notes")
      ?.minimumExcerptChars,
    100,
  );
  assert.equal(
    COMMENTARY_VALIDATION_SPECS.find((spec) => spec.sourceId === "thomas-scott")
      ?.minimumExcerptChars,
    80,
  );
});

test("Calvin uses exact coverage with its verified upstream gaps", () => {
  const calvin = COMMENTARY_VALIDATION_SPECS.find(
    (spec) => spec.sourceId === "calvin-commentaries",
  );
  assert.ok(calvin);
  assert.equal(calvin.exactCoverage, true);
  assert.equal(expectedChapterTotal(calvin), 817);
  assert.deepEqual(KNOWN_EMPTY_UPSTREAM["calvin-commentaries"], [
    "leviticus 12",
    "jeremiah 52",
    "ezekiel 21",
    "ezekiel 22",
    "ezekiel 23",
    "ezekiel 24",
    "ezekiel 25",
    "ezekiel 26",
    "ezekiel 27",
    "ezekiel 28",
    "ezekiel 29",
    "ezekiel 30",
    "ezekiel 31",
    "ezekiel 32",
    "ezekiel 33",
    "ezekiel 34",
    "ezekiel 35",
    "ezekiel 36",
    "ezekiel 37",
    "ezekiel 38",
    "ezekiel 39",
    "ezekiel 40",
    "ezekiel 41",
    "ezekiel 42",
    "ezekiel 43",
    "ezekiel 44",
    "ezekiel 45",
    "ezekiel 46",
    "ezekiel 47",
    "ezekiel 48",
  ]);
});

test("partial source contracts document their selected edition coverage exactly", () => {
  const augustine = COMMENTARY_VALIDATION_SPECS.find(
    (spec) => spec.sourceId === "augustine-expositions",
  );
  const luther = COMMENTARY_VALIDATION_SPECS.find(
    (spec) => spec.sourceId === "luther-galatians",
  );
  assert.ok(augustine);
  assert.ok(luther);
  assert.equal(expectedChapterTotal(augustine), 150);
  assert.equal(expectedChapterTotal(luther), 6);
  assert.deepEqual(augustine.expectedChapterKeys?.slice(0, 2), [
    "psalms 1",
    "psalms 2",
  ]);
  assert.deepEqual(luther.expectedChapterKeys, [
    "galatians 1",
    "galatians 2",
    "galatians 3",
    "galatians 4",
    "galatians 5",
    "galatians 6",
  ]);
});