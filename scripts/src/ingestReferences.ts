import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

type TranslationRow = {
  book: string;
  chapter: number;
  verse: number;
  text: string;
};

type CrossReferenceRow = {
  sourceReference: string;
  targets: string[];
};

type LexicalRow = {
  key: string;
  term: string;
  strongsNumber: string;
  originalWord: string;
  transliteration: string;
  language: "Greek" | "Hebrew" | "English";
  definition: string;
  references: string[];
};

const CANONICAL_BOOKS = [
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

const SOURCE_BOOKS: Record<string, string> = {
  GEN: "Genesis", EXO: "Exodus", LEV: "Leviticus", NUM: "Numbers",
  DEU: "Deuteronomy", JOS: "Joshua", JDG: "Judges", RUT: "Ruth",
  "1SA": "1 Samuel", "2SA": "2 Samuel", "1KI": "1 Kings", "2KI": "2 Kings",
  "1CH": "1 Chronicles", "2CH": "2 Chronicles", EZR: "Ezra", NEH: "Nehemiah",
  EST: "Esther", JOB: "Job", PSA: "Psalms", PRO: "Proverbs",
  ECC: "Ecclesiastes", SOS: "Song of Songs", SNG: "Song of Songs",
  ISA: "Isaiah", JER: "Jeremiah", LAM: "Lamentations",
  EZE: "Ezekiel", EZK: "Ezekiel", DAN: "Daniel", HOS: "Hosea",
  JOE: "Joel", JOL: "Joel", AMO: "Amos", OBA: "Obadiah", JON: "Jonah",
  MIC: "Micah", NAH: "Nahum", NAM: "Nahum", HAB: "Habakkuk", ZEP: "Zephaniah",
  HAG: "Haggai",
  ZEC: "Zechariah", MAL: "Malachi", MAT: "Matthew", MAR: "Mark",
  LUK: "Luke", JOH: "John", JHN: "John", MRK: "Mark", ACT: "Acts", ROM: "Romans", "1CO": "1 Corinthians",
  "2CO": "2 Corinthians", GAL: "Galatians", EPH: "Ephesians",
  PHP: "Philippians", COL: "Colossians", "1TH": "1 Thessalonians",
  "2TH": "2 Thessalonians", "1TI": "1 Timothy", "2TI": "2 Timothy",
  TIT: "Titus", PHM: "Philemon", HEB: "Hebrews", JAM: "James",
  "1PE": "1 Peter", "2PE": "2 Peter", "1JO": "1 John", "2JO": "2 John",
  "3JO": "3 John", "1JN": "1 John", "2JN": "2 John", "3JN": "3 John",
  JDE: "Jude", JUD: "Jude", JAS: "James", REV: "Revelation",
};

const BOOK_ALIASES: Record<string, string> = {
  Psalm: "Psalms",
  "Song-of-Solomon": "Song of Songs",
};

function args(): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i += 1) {
    const value = process.argv[i];
    if (!value.startsWith("--")) continue;
    const [key, inline] = value.slice(2).split("=", 2);
    result[key] = inline ?? process.argv[++i] ?? "";
  }
  return result;
}

function requiredPath(value: string | undefined, label: string): string {
  if (!value || !existsSync(value)) throw new Error(`Missing ${label}: ${value ?? "(not supplied)"}`);
  return value;
}

function canonicalBook(book: string): string {
  return BOOK_ALIASES[book] ?? book.replaceAll("-", " ");
}

function sortRows<T extends { book: string; chapter: number; verse: number }>(rows: T[]): T[] {
  const order = new Map<string, number>(CANONICAL_BOOKS.map((book, index) => [book, index]));
  return rows.sort((a, b) =>
    (order.get(a.book) ?? 999) - (order.get(b.book) ?? 999) ||
    a.chapter - b.chapter ||
    a.verse - b.verse,
  );
}

function readBible(bibleRoot: string, version: "kjv" | "asv"): TranslationRow[] {
  const versionRoot = join(bibleRoot, "versions", version, "books");
  const rows: TranslationRow[] = [];
  for (const bookDir of readdirSync(versionRoot).sort()) {
    const chapterRoot = join(versionRoot, bookDir, "chapters");
    for (const chapterFile of readdirSync(chapterRoot).filter((name) => name.endsWith(".json")).sort((a, b) =>
      Number.parseInt(a) - Number.parseInt(b))) {
      const chapter = JSON.parse(readFileSync(join(chapterRoot, chapterFile), "utf8")) as {
        book: string;
        chapter: string;
        verses: Array<{ verse: number; text: string }>;
      };
      for (const verse of chapter.verses) {
        rows.push({
          book: canonicalBook(chapter.book),
          chapter: Number(chapter.chapter),
          verse: verse.verse,
          text: verse.text.trim(),
        });
      }
    }
  }
  return sortRows(rows);
}

function decodeXmlText(value: string): string {
  return value
    .replace(/<note\b[\s\S]*?<\/note>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function readAsvUsx(usxRoot: string): TranslationRow[] {
  const rows: TranslationRow[] = [];
  for (const file of readdirSync(usxRoot).filter((name) => name.endsWith(".usx")).sort()) {
    const book = SOURCE_BOOKS[file.slice(3, 6)];
    if (!book) continue;
    const content = readFileSync(join(usxRoot, file), "utf8");
    const markers = [...content.matchAll(/<(chapter|verse)\s+number="(\d+)"[^>]*\/>/g)];
    let chapter = 0;
    for (let index = 0; index < markers.length; index += 1) {
      const marker = markers[index];
      const kind = marker[1];
      const number = Number(marker[2]);
      if (kind === "chapter") {
        chapter = number;
        continue;
      }
      const start = (marker.index ?? 0) + marker[0].length;
      const end = markers[index + 1]?.index ?? content.length;
      const text = decodeXmlText(content.slice(start, end));
      if (chapter > 0 && text) rows.push({ book, chapter, verse: number, text });
    }
  }
  return sortRows(rows);
}

function readTsk(crossrefsRoot: string): CrossReferenceRow[] {
  const merged = new Map<string, Set<string>>();
  const rawRoot = join(crossrefsRoot, "data", "00_raw", "souliberty");
  for (const file of readdirSync(rawRoot).filter((name) => name.endsWith(".json")).sort()) {
    const shard = JSON.parse(readFileSync(join(rawRoot, file), "utf8")) as Record<string, {
      v: string;
      r?: Record<string, string>;
    }>;
    for (const row of Object.values(shard)) {
      const [code, chapter, verse] = row.v.split(/\s+/);
      const book = SOURCE_BOOKS[code];
      if (!book || !chapter || !verse) continue;
      const sourceReference = `${book} ${chapter}:${verse}`;
      const targets = merged.get(sourceReference) ?? new Set<string>();
      for (const target of Object.values(row.r ?? {})) {
        const [targetCode, targetChapter, targetVerse] = target.split(/\s+/);
        const targetBook = SOURCE_BOOKS[targetCode];
        if (targetBook && targetChapter && targetVerse) {
          targets.add(`${targetBook} ${targetChapter}:${targetVerse}`);
        }
      }
      merged.set(sourceReference, targets);
    }
  }
  return Array.from(merged.entries())
    .filter(([, targets]) => targets.size > 0)
    .map(([sourceReference, targets]) => ({
      sourceReference,
      targets: Array.from(targets),
    }))
    .sort((a, b) => a.sourceReference.localeCompare(b.sourceReference));
}

function loadStrongDictionary(path: string): Record<string, Record<string, string>> {
  const text = readFileSync(path, "utf8");
  const match = /var\s+\w+\s*=\s*(\{.*\});\s*module\.exports/s.exec(text);
  if (!match) throw new Error(`Could not parse Strong's dictionary: ${path}`);
  return JSON.parse(match[1]) as Record<string, Record<string, string>>;
}

function readStrongs(strongsRoot: string): LexicalRow[] {
  const dictionaries: Array<["Greek" | "Hebrew", string]> = [
    ["Greek", join(strongsRoot, "greek", "strongs-greek-dictionary.js")],
    ["Hebrew", join(strongsRoot, "hebrew", "strongs-hebrew-dictionary.js")],
  ];
  const rows: LexicalRow[] = [];
  for (const [language, path] of dictionaries) {
    const dictionary = loadStrongDictionary(path);
    for (const [key, entry] of Object.entries(dictionary)) {
      const strongsNumber = key.toUpperCase();
      const definition = [entry.strongs_def, entry.derivation].filter(Boolean).join(" ").trim();
      if (!definition) continue;
      rows.push({
        key: strongsNumber.toLowerCase(),
        term: (entry.kjv_def || entry.strongs_def || entry.lemma || strongsNumber).trim(),
        strongsNumber,
        originalWord: entry.lemma ?? "",
        transliteration: entry.translit ?? entry.xlit ?? "",
        language,
        definition,
        references: [],
      });
    }
  }
  return rows.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}

function readEaston(eastonFile: string): LexicalRow[] {
  const grouped = new Map<string, { term: string; definitions: string[] }>();
  for (const line of readFileSync(eastonFile, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { term?: string; definitions?: string[] };
    if (!row.term || !Array.isArray(row.definitions)) continue;
    const key = row.term.trim().toLowerCase();
    const existing = grouped.get(key) ?? { term: row.term.trim(), definitions: [] };
    for (const definition of row.definitions) {
      if (typeof definition === "string" && definition.trim() && !existing.definitions.includes(definition.trim())) {
        existing.definitions.push(definition.trim());
      }
    }
    grouped.set(key, existing);
  }
  return Array.from(grouped.values())
    .map(({ term, definitions }): LexicalRow => ({
      key: term.toLowerCase(),
      term,
      strongsNumber: "",
      originalWord: term,
      transliteration: "",
      language: "English",
      definition: definitions.join("\n\n"),
      references: [],
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

const parsed = args();
const repoRoot = resolve(import.meta.dirname, "../..");
const outputRoot = resolve(parsed.output ?? join(repoRoot, "artifacts/api-server/data/references"));
const bibleRoot = requiredPath(parsed["bible-root"], "Bible source root");
const asvUsxRoot = requiredPath(parsed["asv-usx-root"], "ASV USX source root");
const strongsRoot = requiredPath(parsed["strongs-root"], "Strong's source root");
const eastonFile = requiredPath(parsed["easton-file"], "Easton's JSONL file");
const crossrefsRoot = requiredPath(parsed["crossrefs-root"], "TSK source root");

const kjv = readBible(bibleRoot, "kjv");
const asv = readAsvUsx(asvUsxRoot);
const tsk = readTsk(crossrefsRoot);
const strongs = readStrongs(strongsRoot);
const easton = readEaston(eastonFile);

writeJson(join(outputRoot, "kjv-1769", "passages.json"), kjv);
writeJson(join(outputRoot, "asv-1901", "passages.json"), asv);
writeJson(join(outputRoot, "tsk-1830", "cross-references.json"), tsk);
writeJson(join(outputRoot, "strongs-1890", "entries.json"), strongs);
writeJson(join(outputRoot, "eastons-1897", "entries.json"), easton);

console.log(JSON.stringify({
  kjvVerses: kjv.length,
  asvVerses: asv.length,
  tskSourcePassages: tsk.length,
  strongsEntries: strongs.length,
  eastonEntries: easton.length,
}, null, 2));