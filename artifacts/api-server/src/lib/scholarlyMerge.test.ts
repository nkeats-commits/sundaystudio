/**
 * Unit tests for the deterministic merge bookkeeping that powers the Study
 * tab's "Sources consulted" footer AND for the passage-match rules that
 * decide which Resource Library rows the server auto-includes for a sermon
 * (task #71).
 *
 * `mergeScholarlyResources` itself requires DB access (it reads
 * user_source_preferences + sermon_resources), so the matcher logic that
 * `previewSermonResources` and the merge share is tested here against the
 * deterministic `parsePassageRef` helper. The DB-backed path is covered by
 * `routes/sources.test.ts` and route-level integration.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { lookupCommentary, parsePassageRef } from "./scholarlySources";

/* -------------------------------------------------------------------------- */
/* Bookkeeping                                                                */
/* -------------------------------------------------------------------------- */

test("merge bookkeeping: dedupes consulted sources by id", () => {
  // Two passages from the same source must collapse to one consulted entry.
  const hits = lookupCommentary(
    ["matthew-henry-concise"],
    ["Romans 8:28", "John 3:16"],
  );
  assert.ok(hits.length >= 2, "fixture passages should both hit MH");
  const seen = new Set<string>();
  const consulted: Array<{ id: string; title: string }> = [];
  for (const h of hits) {
    if (seen.has(h.sourceId)) continue;
    seen.add(h.sourceId);
    consulted.push({ id: h.sourceId, title: h.sourceTitle });
  }
  assert.equal(consulted.length, 1);
  assert.equal(consulted[0].id, "matthew-henry-concise");
});

test("merge bookkeeping: empty when no passages match", () => {
  // Source that the loader excluded → zero hits, zero consulted sources.
  // (barnes-notes used to be manifest-only; it now ships content. Use
  // adam-clarke, which is still a manifest-only stub.)
  const hits = lookupCommentary(["adam-clarke"], ["Romans 8:28"]);
  assert.equal(hits.length, 0);
});

/* -------------------------------------------------------------------------- */
/* Library matcher (task #71)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Mirror of the private `libraryRowMatches` in scholarlyMerge.ts. Kept
 * here as a thin wrapper so the published rules are exercised exactly as
 * the merge function applies them. If you change the rules in scholarlyMerge,
 * update both.
 */
function libraryRowMatches(
  relatedPassage: string,
  sermonPairs: ReadonlyArray<{ book: string; chapter: number }>,
): boolean {
  const trimmed = relatedPassage.trim();
  if (!trimmed) return true;
  const rowPairs = parsePassageRef(trimmed);
  if (!rowPairs.length) return false;
  for (const a of rowPairs) {
    for (const b of sermonPairs) {
      if (a.book === b.book && a.chapter === b.chapter) return true;
    }
  }
  return false;
}

test("library matcher: empty relatedPassage matches any sermon", () => {
  const sermonPairs = parsePassageRef("Romans 8:1-11");
  assert.ok(sermonPairs.length > 0);
  assert.equal(libraryRowMatches("", sermonPairs), true);
  assert.equal(libraryRowMatches("   ", sermonPairs), true);
});

test("library matcher: unparseable relatedPassage does NOT match", () => {
  // Free-text tags like "Christmas Eve" shouldn't surface on every sermon
  // — that would dilute the prompt with irrelevant content.
  const sermonPairs = parsePassageRef("Romans 8:1-11");
  assert.equal(libraryRowMatches("Christmas Eve", sermonPairs), false);
  assert.equal(libraryRowMatches("topical / grace", sermonPairs), false);
});

test("library matcher: same (book, chapter) overlap matches", () => {
  const sermonPairs = parsePassageRef("Romans 8:1-11");
  assert.equal(libraryRowMatches("Romans 8:28", sermonPairs), true);
  assert.equal(libraryRowMatches("Romans 8", sermonPairs), true);
});

test("library matcher: different chapter does NOT match", () => {
  const sermonPairs = parsePassageRef("Romans 8:1-11");
  assert.equal(libraryRowMatches("Romans 12:1-2", sermonPairs), false);
  assert.equal(libraryRowMatches("Galatians 5:22", sermonPairs), false);
});

test("library matcher: secondary passages broaden the match", () => {
  const sermonPairs = [
    ...parsePassageRef("Romans 8:1-11"),
    ...parsePassageRef("John 3:16"),
  ];
  assert.equal(libraryRowMatches("John 3:1-21", sermonPairs), true);
  assert.equal(libraryRowMatches("Romans 8:38-39", sermonPairs), true);
  assert.equal(libraryRowMatches("Acts 2:42", sermonPairs), false);
});
