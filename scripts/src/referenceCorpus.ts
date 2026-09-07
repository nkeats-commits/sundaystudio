import { createHash } from "node:crypto";

export type ReferenceCorpusKind = "translation" | "cross-reference" | "lexicon";

export type ReferenceCorpusSpec = {
  id: string;
  title: string;
  author: string;
  year: string;
  license: "Public Domain";
  sourceUrl: string;
  sourceRevision: string;
  description: string;
  kind: ReferenceCorpusKind;
  lookupType: string;
  attribution: string;
  dataFile: string;
  expectedCount: number;
  expectedSha256: string;
  expectedGapAllowlistSha256: string;
  occurrenceSource?: {
    title: string;
    sourceUrl: string;
    sourceRevision: string;
    license: string;
    attribution: string;
  };
};

export type TranslationRow = {
  book: string;
  chapter: number;
  verse: number;
  text: string;
};

export type CrossReferenceRow = {
  sourceReference: string;
  targets: string[];
};

export type LexicalRow = {
  key: string;
  term: string;
  strongsNumber: string;
  originalWord: string;
  transliteration: string;
  language: "Greek" | "Hebrew" | "English";
  definition: string;
  references: string[];
};

const EMPTY_GAP_ALLOWLIST_SHA256 = "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945";

export const REFERENCE_CORPUS_SPECS: readonly ReferenceCorpusSpec[] = [
  {
    id: "kjv-1769",
    title: "King James Version (1769)",
    author: "King James Version translators",
    year: "1769",
    license: "Public Domain",
    sourceUrl: "https://github.com/jsubroto/bible-api/tree/c9de1e6c17ffdc9be4626b57d588e03ff33c4f66/versions/kjv",
    sourceRevision: "c9de1e6c17ffdc9be4626b57d588e03ff33c4f66",
    description: "Complete 31,102-verse KJV corpus across all 66 canonical books for passage checking. It is never used as a substitute for the pastor's chosen translation.",
    kind: "translation",
    lookupType: "verse text",
    attribution: "King James Version (1769), public domain; structured text pinned to the c9de1e6 bible-api snapshot.",
    dataFile: "passages.json",
    expectedCount: 31102,
    expectedSha256: "fc40f076430996c202b5c0ff95ef46f73ff7d51a7d4eee258299196d4649f0ce",
    expectedGapAllowlistSha256: EMPTY_GAP_ALLOWLIST_SHA256,
  },
  {
    id: "asv-1901",
    title: "American Standard Version (1901)",
    author: "American Standard Version translators",
    year: "1901",
    license: "Public Domain",
    sourceUrl: "https://github.com/openbibleinfo/American-Standard-Version-Bible/tree/5c83ee265c75b3b1c056435eff622a875f1edc45/usx",
    sourceRevision: "5c83ee265c75b3b1c056435eff622a875f1edc45",
    description: "Complete available 31,086-verse ASV corpus across all 66 canonical books. Sixteen verses absent from this verified public-domain edition's USX source are documented in MANIFESTS.md.",
    kind: "translation",
    lookupType: "verse text",
    attribution: "American Standard Version (1901), public domain; high-fidelity USX text pinned to the 5c83ee2 openbible snapshot.",
    dataFile: "passages.json",
    expectedCount: 31086,
    expectedSha256: "0d06ddfa90f8f8872d0e24f60caf78763a26c3fb08c1ee3cd493429745caf128",
    expectedGapAllowlistSha256: "67253d8496e443a89b8292f629499ab95d70ca91f965afd6e6847410e6e49880",
  },
  {
    id: "tsk-1830",
    title: "Treasury of Scripture Knowledge",
    author: "R. A. Torrey, editor",
    year: "1830",
    license: "Public Domain",
    sourceUrl: "https://github.com/neuu-org/bible-crossrefs-dataset/tree/8aa012820f5881a787e87d71005a22f52844c4fb/data/00_raw/souliberty",
    sourceRevision: "8aa012820f5881a787e87d71005a22f52844c4fb",
    description: "30,412 TSK source passages with one or more cross-references; 690 of the 31,102 canonical verse keys have no relationship in the verified source and are documented in MANIFESTS.md.",
    kind: "cross-reference",
    lookupType: "cross-reference",
    attribution: "Treasury of Scripture Knowledge (1830), public domain; normalized from the pinned SoulLiberty public-domain cross-reference snapshot.",
    dataFile: "cross-references.json",
    expectedCount: 30412,
    expectedSha256: "867b8be9c63de13119d1ad3d46dd0d3dc5dc1b233073702ea17fbafc0693aedd",
    expectedGapAllowlistSha256: "35ac911119093a36387ad113b6f0f1b566c92172615fee3560b602873f1cb6d6",
  },
  {
    id: "strongs-1890",
    title: "Strong's Exhaustive Concordance",
    author: "James Strong",
    year: "1890",
    license: "Public Domain",
    sourceUrl: "https://github.com/openscriptures/strongs/tree/0acd2f251c2d35ff8db2dece4e059397d3ac223",
    sourceRevision: "0acd2f251c2d35ff8db2dece4e0593979d3ac223",
    description: "Complete verified Strong's lexical index with 5,523 Greek and 8,674 Hebrew entries, keyed by stable Strong's numbers.",
    kind: "lexicon",
    lookupType: "lexical entry",
    attribution: "Strong's Exhaustive Concordance (1890), public domain; Open Scriptures dictionary data pinned to 0acd2f2.",
    dataFile: "entries.json",
    expectedCount: 14197,
    expectedSha256: "b3e2c2a823102ab92f9becb1f0c567e77299a8e0902e0e21adaf542065000614",
    expectedGapAllowlistSha256: EMPTY_GAP_ALLOWLIST_SHA256,
    occurrenceSource: {
      title: "STEP Bible Translators Amalgamated Hebrew/Greek",
      sourceUrl: "https://github.com/STEPBible/STEPBible-Data/tree/c5407786ede9b26a8998366524076f7c739dccdd/Translators%20Amalgamated%20OT%2BNT",
      sourceRevision: "c5407786ede9b26a8998366524076f7c739dccdd",
      license: "CC BY 4.0",
      attribution: "STEP Bible data, CC BY 4.0; Strong's occurrence references normalized from the pinned TAHOT/TAGNT snapshot.",
    },
  },
  {
    id: "eastons-1897",
    title: "Easton's Bible Dictionary",
    author: "Matthew George Easton",
    year: "1897",
    license: "Public Domain",
    sourceUrl: "https://github.com/garydavenport73/eastons-bible-dictionary-json/tree/aef63dff5364f28beea1deb9d288c1fd9dbfca33/eastons.jsonl",
    sourceRevision: "aef63dff5364f28beea1deb9d288c1fd9dbfca33",
    description: "Complete 3,961-entry Easton's Bible Dictionary corpus for historical and cultural background, kept distinct from lexical definitions.",
    kind: "lexicon",
    lookupType: "dictionary entry",
    attribution: "Easton's Bible Dictionary (1897), public domain; normalized from the pinned 3,961-entry source snapshot.",
    dataFile: "entries.json",
    expectedCount: 3961,
    expectedSha256: "2164ec0815fa264d36c7f48aefdee184145bb60df93c76c6ba62361f17ea3f6e",
    expectedGapAllowlistSha256: EMPTY_GAP_ALLOWLIST_SHA256,
  },
];

export const CANONICAL_BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua",
  "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
  "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job",
  "Psalms", "Proverbs", "Ecclesiastes", "Song of Songs", "Isaiah",
  "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel",
  "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
  "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John",
  "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians",
  "Ephesians", "Philippians", "Colossians", "1 Thessalonians",
  "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon",
  "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John",
  "Jude", "Revelation",
] as const;

const BOOK_ALIASES: Record<string, string> = {
  psalm: "psalms",
  "song-of-solomon": "song of songs",
};

export function canonicalBook(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return BOOK_ALIASES[normalized] ?? normalized;
}

export function translationKey(row: Pick<TranslationRow, "book" | "chapter" | "verse">): string {
  return `${canonicalBook(row.book)}|${row.chapter}|${row.verse}`;
}

export function crossReferenceKey(reference: string): string | null {
  const match = /^(.+?)\s+(\d+):(\d+)$/.exec(reference.trim());
  return match ? `${canonicalBook(match[1])}|${match[2]}|${match[3]}` : null;
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function gapAllowlistHash(gaps: readonly string[]): string {
  return sha256(JSON.stringify([...gaps].sort()));
}

export function getGapAllowlist(
  spec: ReferenceCorpusSpec,
  rows: readonly (TranslationRow | CrossReferenceRow | LexicalRow)[],
  kjvRows: readonly TranslationRow[],
): string[] {
  if (spec.kind === "lexicon") return [];
  const indexed = new Set(
    spec.kind === "translation"
      ? (rows as TranslationRow[]).map(translationKey)
      : (rows as CrossReferenceRow[]).map((row) => crossReferenceKey(row.sourceReference)).filter(
        (key): key is string => Boolean(key),
      ),
  );
  return kjvRows.map(translationKey).filter((key) => !indexed.has(key)).sort();
}