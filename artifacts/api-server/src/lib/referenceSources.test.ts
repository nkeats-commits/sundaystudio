import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  describeReferenceLookupFailure,
  listRegisteredReferenceSources,
  lookupReferenceBundle,
  REFERENCE_BUNDLE_BUDGET_CHARS,
  ReferenceSourceError,
} from "./referenceSources";
import { parsePassageVerses } from "./scholarlySources";

test("reference registry exposes only attributed public-domain collections", () => {
  const sources = listRegisteredReferenceSources();
  assert.ok(sources.length >= 5);
  const expectedMetadata = new Map([
    ["asv-1901", ["1901", "https://github.com/openbibleinfo/American-Standard-Version-Bible/tree/5c83ee265c75b3b1c056435eff622a875f1edc45/usx"]],
    ["eastons-1897", ["1897", "https://github.com/garydavenport73/eastons-bible-dictionary-json/tree/aef63dff5364f28beea1deb9d288c1fd9dbfca33/eastons.jsonl"]],
    ["kjv-1769", ["1769", "https://github.com/jsubroto/bible-api/tree/c9de1e6c17ffdc9be4626b57d588e03ff33c4f66/versions/kjv"]],
    ["strongs-1890", ["1890", "https://github.com/openscriptures/strongs/tree/0acd2f251c2d35ff8db2dece4e0593979d3ac223"]],
    ["tsk-1830", ["1830", "https://github.com/neuu-org/bible-crossrefs-dataset/tree/8aa012820f5881a787e87d71005a22f52844c4fb/data/00_raw/souliberty"]],
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

  const crossReferences = lookupReferenceBundle(["tsk-1830"], ["Ephesians 2:8-9"], [], 4000);
  assert.ok(crossReferences.crossReferences.some((hit) => hit.sourceReference.startsWith("Ephesians 2:")));
  const lexicalEntries = lookupReferenceBundle(
    ["strongs-1890", "eastons-1897"],
    passages,
    ["grace", "refuge"],
    4000,
  );
  assert.ok(lexicalEntries.lexicalEntries.some((hit) => hit.key === "g5485"));
  assert.ok(lexicalEntries.lexicalEntries.some(
    (hit) => hit.sourceId === "strongs-1890" && hit.definition.toLowerCase().includes("refuge"),
  ));
});

test("reference indexes match their verified corpus targets", () => {
  const sources = new Map(listRegisteredReferenceSources().map((source) => [source.id, source]));
  assert.equal(sources.get("kjv-1769")?.scope, "31102 indexed verses");
  assert.equal(sources.get("asv-1901")?.scope, "31086 indexed verses");
  assert.equal(sources.get("tsk-1830")?.scope, "30412 source passages");
  assert.equal(sources.get("strongs-1890")?.scope, "14197 lexical entries");
  assert.equal(sources.get("eastons-1897")?.scope, "3961 lexical entries");
  assert.equal(sources.get("kjv-1769")?.bookCount, 66);
  assert.equal(sources.get("asv-1901")?.bookCount, 66);
  assert.equal(sources.get("tsk-1830")?.bookCount, 66);
});

test("reference manifests pin source revisions and generated integrity metadata", () => {
  const root = new URL("../../data/references/", import.meta.url);
  for (const sourceId of ["kjv-1769", "asv-1901", "tsk-1830", "strongs-1890", "eastons-1897"]) {
    const manifest = JSON.parse(
      readFileSync(new URL(`${sourceId}/MANIFEST.json`, root), "utf8"),
    ) as {
      sourceRevision?: unknown;
      integrity?: { file?: unknown; sha256?: unknown; rowCount?: unknown };
      gapAllowlist?: { count?: unknown; sha256?: unknown };
    };
    assert.match(String(manifest.sourceRevision), /^[0-9a-f]{40}$/);
    assert.match(String(manifest.integrity?.sha256), /^[0-9a-f]{64}$/);
    assert.ok(Number(manifest.integrity?.rowCount) > 0);
    assert.equal(typeof manifest.gapAllowlist?.count, "number");
    assert.match(String(manifest.gapAllowlist?.sha256), /^[0-9a-f]{64}$/);
  }
});

test("translation and cross-reference gaps match the documented allowlists", () => {
  const readData = (path: string) => JSON.parse(
    readFileSync(new URL(`../../data/references/${path}`, import.meta.url), "utf8"),
  ) as Array<Record<string, unknown>>;
  const dataVerseKey = (row: Record<string, unknown>) =>
    `${String(row.book).toLowerCase()}|${String(row.chapter)}|${String(row.verse)}`;
  const parsedVerseKey = (row: { book: string; chapter: number; verse: number }) =>
    `${row.book.toLowerCase()}|${row.chapter}|${row.verse}`;
  const kjv = readData("kjv-1769/passages.json");
  const asv = readData("asv-1901/passages.json");
  const canonicalVerses = new Set(kjv.map(dataVerseKey));
  const asvVerses = new Set(asv.map(dataVerseKey));
  const asvGaps = [...canonicalVerses].filter((key) => !asvVerses.has(key)).sort();
  assert.deepEqual(asvGaps, [
    "acts|15|34", "acts|24|7", "acts|28|29", "acts|8|37",
    "john|5|4", "luke|17|36", "luke|23|17",
    "mark|11|26", "mark|15|28", "mark|7|16", "mark|9|44", "mark|9|46",
    "matthew|17|21", "matthew|18|11", "matthew|23|14", "romans|16|24",
  ].sort());

  const tsk = readData("tsk-1830/cross-references.json");
  const tskVerses = new Set(
    tsk.flatMap((row) =>
      parsePassageVerses(String(row.sourceReference)).map(parsedVerseKey),
    ),
  );
  const tskGaps = [...canonicalVerses].filter((key) => !tskVerses.has(key));
  assert.equal(tskGaps.length, 690);
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
  const lexicalBundle = lookupReferenceBundle(["strongs-1890"], [], ["G5485"], 4000);
  assert.ok(lexicalBundle.lexicalEntries.some((hit) => hit.sourceId === "strongs-1890"));
  for (const hit of [
    ...bundle.translations,
    ...bundle.crossReferences,
    ...bundle.lexicalEntries,
    ...lexicalBundle.lexicalEntries,
  ]) {
    assert.ok(hit.sourceTitle);
    assert.ok(hit.attribution);
    assert.ok(hit.sourceUrl);
  }
});

test("reference lookup failures preserve the source kind without exposing internals", () => {
  assert.deepEqual(
    describeReferenceLookupFailure(
      new ReferenceSourceError("cross-reference", new Error("internal detail")),
    ),
    {
      error: "Cross-reference lookup failed. Please try again.",
      source: "cross-reference",
    },
  );
  assert.deepEqual(describeReferenceLookupFailure(new Error("unknown failure")), {
    error: "Could not preview references.",
  });
});

test("disabled and unrelated reference sources contribute nothing", () => {
  const disabled = lookupReferenceBundle([], ["John 3:16"], ["love"]);
  assert.deepEqual(disabled, {
    translations: [],
    crossReferences: [],
    lexicalEntries: [],
  });
  const unrelated = lookupReferenceBundle(["kjv-1769", "tsk-1830"], ["Acts 999:1"]);
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
  const kindShare = Math.floor(budget / 3);
  const used = [
    Math.min(kindShare, bundle.translations.reduce((sum, hit) => sum + hit.text.length, 0)),
    Math.min(
      kindShare,
      bundle.crossReferences.reduce(
        (sum, hit) => sum + `${hit.sourceReference}: ${hit.targets.join(", ")}${hit.note ?? ""}`.length,
        0,
      ),
    ),
    Math.min(
      kindShare,
      bundle.lexicalEntries.reduce((sum, hit) => sum + `${hit.term}: ${hit.definition}`.length, 0),
    ),
  ].reduce((sum, length) => sum + length, 0);
  assert.ok(used <= budget);
});

test("reference lookup deduplicates repeated source ids and passage requests", () => {
  const bundle = lookupReferenceBundle(
    ["kjv-1769", "kjv-1769", "tsk-1830", "tsk-1830"],
    ["Psalm 46:1", "Psalms 46:1", "Matthew 28:19-20", "Matthew 28:19-20"],
    [],
    REFERENCE_BUNDLE_BUDGET_CHARS,
  );
  assert.equal(bundle.translations.filter((hit) => hit.reference === "Psalms 46:1").length, 1);
  assert.equal(bundle.crossReferences.filter((hit) => hit.sourceReference === "Psalms 46:1").length, 1);
  const lexicalBundle = lookupReferenceBundle(
    ["strongs-1890", "strongs-1890"],
    [],
    ["G5485", "G5485"],
    REFERENCE_BUNDLE_BUDGET_CHARS,
  );
  assert.equal(lexicalBundle.lexicalEntries.filter((hit) => hit.key === "g5485").length, 1);
});