import test from "node:test";
import assert from "node:assert/strict";
import {
  listRegisteredReferenceSources,
  lookupReferenceBundle,
  REFERENCE_BUNDLE_BUDGET_CHARS,
} from "./referenceSources";
import { parsePassageVerses } from "./scholarlySources";

test("reference registry exposes only attributed public-domain collections", () => {
  const sources = listRegisteredReferenceSources();
  assert.ok(sources.length >= 5);
  for (const source of sources) {
    assert.ok(["translation", "cross-reference", "lexicon"].includes(source.kind));
    assert.equal(source.license, "Public Domain");
    assert.ok(source.sourceUrl.startsWith("https://"));
    assert.ok(source.attribution);
    assert.ok(source.lookupType);
    assert.ok(source.scope);
  }
});

test("verse normalization preserves explicit verse ranges", () => {
  assert.deepEqual(parsePassageVerses("John 3:16-18"), [
    { book: "john", chapter: 3, verse: 16 },
    { book: "john", chapter: 3, verse: 17 },
    { book: "john", chapter: 3, verse: 18 },
  ]);
  assert.deepEqual(parsePassageVerses("Romans 8:38-39"), [
    { book: "romans", chapter: 8, verse: 38 },
    { book: "romans", chapter: 8, verse: 39 },
  ]);
});

test("reference lookup returns visibly typed, source-labeled results", () => {
  const bundle = lookupReferenceBundle(
    ["kjv-1769", "tsk-1830", "strongs-1890", "eastons-1897"],
    ["John 3:16"],
    ["love"],
    REFERENCE_BUNDLE_BUDGET_CHARS,
  );
  assert.ok(bundle.translations.some((hit) => hit.sourceId === "kjv-1769"));
  assert.ok(bundle.crossReferences.some((hit) => hit.sourceId === "tsk-1830"));
  assert.ok(bundle.lexicalEntries.some((hit) => hit.sourceId === "strongs-1890"));
  for (const hit of [
    ...bundle.translations,
    ...bundle.crossReferences,
    ...bundle.lexicalEntries,
  ]) {
    assert.ok(hit.sourceTitle);
    assert.ok(hit.attribution);
    assert.ok(hit.sourceUrl);
  }
});

test("disabled and unrelated reference sources contribute nothing", () => {
  const disabled = lookupReferenceBundle([], ["John 3:16"], ["love"]);
  assert.deepEqual(disabled, {
    translations: [],
    crossReferences: [],
    lexicalEntries: [],
  });
  const unrelated = lookupReferenceBundle(["kjv-1769", "tsk-1830"], ["Acts 2:1"]);
  assert.deepEqual(unrelated, {
    translations: [],
    crossReferences: [],
    lexicalEntries: [],
  });
});

test("reference lookup enforces one combined character budget", () => {
  const budget = 100;
  const bundle = lookupReferenceBundle(
    ["kjv-1769", "tsk-1830", "strongs-1890", "eastons-1897"],
    ["John 3:16", "Romans 8:28"],
    ["love"],
    budget,
  );
  const used = [
    ...bundle.translations.map((hit) => hit.text.length),
    ...bundle.crossReferences.map((hit) =>
      `${hit.sourceReference}: ${hit.targets.join(", ")}${hit.note ?? ""}`.length,
    ),
    ...bundle.lexicalEntries.map((hit) => `${hit.term}: ${hit.definition}`.length),
  ].reduce((sum, length) => sum + length, 0);
  assert.ok(used <= budget);
});