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
import { extractBibleHubExcerpt } from "./ingestCommentary.js";

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