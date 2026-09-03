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
  const expectedMetadata = new Map([
    ["asv-1901", ["1901", "https://www.gutenberg.org/ebooks/5317"]],
    ["eastons-1897", ["1897", "https://www.gutenberg.org/ebooks/64651"]],
    ["kjv-1769", ["1769", "https://www.gutenberg.org/ebooks/10"]],
    ["strongs-1890", ["1890", "https://archive.org/details/strongsexhaustiv00stro"]],
    ["tsk-1830", ["1830", "https://archive.org/details/treasuryofscript0000drra"]],
  ]);
  for (const source of sources) {
    assert.ok(["translation", "cross-reference", "lexicon"].includes(source.kind));
    assert.equal(source.license, "Public Domain");
    assert.ok(source.sourceUrl.startsWith("https://"));
    assert.ok(source.attribution);
    assert.ok(source.lookupType);
    assert.ok(source.scope);
    const metadata = expectedMetadata.get(source.id);
    assert.ok(metadata);
    assert.equal(source.year, metadata[0]);
    assert.equal(source.sourceUrl, metadata[1]);
    assert.ok(source.attribution.includes(metadata[0]));
  }
});

test("expanded reference data is available for both translations and study aids", () => {
  const passages = ["Matthew 28:19-20", "Psalm 46:1", "Ephesians 2:8-9"];
  const kjv = lookupReferenceBundle(["kjv-1769"], passages, [], 4000);
  const asv = lookupReferenceBundle(["asv-1901"], passages, [], 4000);
  assert.deepEqual(
    kjv.translations.map((hit) => hit.reference),
    ["Matthew 28:19", "Matthew 28:20", "Psalms 46:1", "Ephesians 2:8", "Ephesians 2:9"],
  );
  assert.deepEqual(
    asv.translations.map((hit) => hit.reference),
    ["Matthew 28:19", "Matthew 28:20", "Psalms 46:1", "Ephesians 2:8", "Ephesians 2:9"],
  );
  assert.ok(kjv.translations.every((hit) => hit.book === hit.book.toLowerCase()));
  assert.ok(asv.translations.every((hit) => hit.book === hit.book.toLowerCase()));

  const studyAids = lookupReferenceBundle(
    ["tsk-1830", "strongs-1890", "eastons-1897"],
    passages,
    ["grace", "refuge"],
    4000,
  );
  assert.ok(studyAids.crossReferences.some((hit) => hit.sourceReference === "Ephesians 2:8-9"));
  assert.ok(studyAids.lexicalEntries.some((hit) => hit.key === "g5485"));
  assert.ok(studyAids.lexicalEntries.some((hit) => hit.key === "refuge"));
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

test("reference lookup deduplicates repeated source ids and passage requests", () => {
  const bundle = lookupReferenceBundle(
    ["kjv-1769", "kjv-1769", "tsk-1830", "tsk-1830", "strongs-1890", "strongs-1890"],
    ["Psalm 46:1", "Psalms 46:1", "Matthew 28:19-20", "Matthew 28:19-20"],
    ["grace", "grace"],
    REFERENCE_BUNDLE_BUDGET_CHARS,
  );
  assert.equal(bundle.translations.filter((hit) => hit.reference === "Psalms 46:1").length, 1);
  assert.equal(bundle.crossReferences.filter((hit) => hit.sourceReference === "Psalm 46:1").length, 1);
  assert.equal(bundle.lexicalEntries.filter((hit) => hit.key === "g5485").length, 1);
});