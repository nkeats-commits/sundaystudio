/**
 * Unit tests for the deterministic merge bookkeeping that powers the Study
 * tab's "Sources consulted" footer.
 *
 * `mergeScholarlyResources` requires DB access (it reads
 * user_source_preferences), so we exercise the underlying lookup +
 * dedupe-by-source-id contract directly here. The endpoint integration
 * test in `routes/sources.test.ts` covers the DB-backed path.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { lookupCommentary } from "./scholarlySources";

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
  const hits = lookupCommentary(["barnes-notes"], ["Romans 8:28"]);
  assert.equal(hits.length, 0);
});
