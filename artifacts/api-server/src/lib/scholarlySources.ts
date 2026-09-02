/**
 * Scholarly source registry + passage-keyed commentary lookup.
 *
 * Loads bundled public-domain commentary content from
 * `artifacts/api-server/data/commentaries/<source-id>/`. Each source has a
 * `MANIFEST.json` (always required, gives Settings UI metadata) and zero or
 * more `<book-slug>.json` files keyed by chapter.
 *
 * The lookup helper parses a passage reference like "Romans 8:28-30" or
 * "John 3" into a canonical (book, chapter) pair and returns the matching
 * commentary entries. Lookup is purely server-side; the raw commentary
 * content never reaches the client — only the AI-generated output that
 * cites it does.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve the bundled commentary data directory. The data lives at
 * `artifacts/api-server/data/commentaries/`. We need this to work in three
 * places:
 *   1. tsx dev (`__dirname` = `artifacts/api-server/src/lib/`)
 *   2. esbuild bundle    (`__dirname` = `artifacts/api-server/dist/`)
 *   3. unit tests run from the package root (`process.cwd()` = api-server)
 *
 * We probe a small set of plausible relative paths and use the first that
 * exists; if none do, fall back to `<cwd>/data/commentaries` and let the
 * registry loader log a warning.
 */
function resolveDataRoot(): string {
  const candidates = [
    resolve(__dirname, "..", "..", "data", "commentaries"), // tsx dev: src/lib/* → artifacts/api-server/data
    resolve(__dirname, "..", "data", "commentaries"),         // esbuild bundle: dist/* → artifacts/api-server/data
    resolve(process.cwd(), "data", "commentaries"),           // run from package root
    resolve(process.cwd(), "artifacts", "api-server", "data", "commentaries"), // run from monorepo root
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0];
}

const DATA_ROOT = resolveDataRoot();

/**
 * Hard ceiling on the total number of characters of public-domain commentary
 * that `lookupCommentary` may inject into a single generation prompt.
 *
 * This is intentionally ONE constant — not two separate knobs for
 * "max hits" and "chars per excerpt" — so that adding more sources (or
 * enabling more of them) cannot silently re-inflate prompts.  The budget is
 * spread greedily across however many source-chapter pairs match: a pastor
 * with 4 sources enabled gets the same total context ceiling as one with 1.
 * The last matched excerpt is trimmed to fit whatever budget remains rather
 * than being dropped entirely.  Budget is consumed in source-priority order,
 * so an earlier source with a long excerpt may use up the ceiling before
 * later sources get a turn — enabling more sources does not re-expand the
 * total, it merely changes who gets priority within the fixed ceiling.
 *
 * ~1 800 chars ≈ 300 words — enough for meaningful scholarly grounding
 * without crowding the rest of the generation prompt.
 */
const TOTAL_COMMENTARY_BUDGET_CHARS = 1800;

/**
 * Default sources enabled the first time a user touches the Sources panel.
 *
 * Only sources with populated book corpora belong here — toggling on a
 * source with no excerpt data would silently inject nothing and confuse
 * pastors. Matthew Henry remains the initial default; additional shipped
 * sources are available for pastors to opt into from Settings.
 */
export const DEFAULT_ENABLED_SOURCE_IDS: string[] = [
  "matthew-henry-concise",
];

/**
 * Raw on-disk MANIFEST.json shape — only the fields the file actually
 * contains. Coverage fields (`bookCount`, `scope`, `coveredBooks`) are
 * derived at runtime from the loaded book corpus, not stored on disk.
 */
export interface ScholarlySourceDiskManifest {
  id: string;
  title: string;
  author: string;
  year: string;
  license: string;
  sourceUrl: string;
  description: string;
  /** Commentaries predate the typed reference catalog and default to this kind. */
  kind?: ScholarlySourceKind;
  lookupType?: string;
  attribution?: string;
}

export type ScholarlySourceKind =
  | "commentary"
  | "translation"
  | "cross-reference"
  | "lexicon";

/**
 * Full API-surface manifest: the disk fields plus server-derived coverage
 * metadata that is always present in `GET /api/sources` responses.
 */
export interface ScholarlySourceManifest extends ScholarlySourceDiskManifest {
  kind: ScholarlySourceKind;
  lookupType: string;
  attribution: string;
  bookCount: number;
  scope: string;
  coveredBooks: string[];
}

/* -------------------------------------------------------------------------- */
/* Bible book canon + coverage helpers                                        */
/* -------------------------------------------------------------------------- */

/**
 * All 66 canonical Bible books in canonical order, title-cased.
 * Used to sort `coveredBooks` and to compute testament membership.
 */
const BIBLE_CANON_ORDER: readonly string[] = [
  // Old Testament (39)
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
  "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
  "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
  "Ecclesiastes", "Song of Songs", "Isaiah", "Jeremiah", "Lamentations",
  "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk",
  "Zephaniah", "Haggai", "Zechariah", "Malachi",
  // New Testament (27)
  "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
  "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy",
  "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
  "1 Peter", "2 Peter", "1 John", "2 John", "3 John",
  "Jude", "Revelation",
];

const OT_SET = new Set(BIBLE_CANON_ORDER.slice(0, 39).map((b) => b.toLowerCase()));
const NT_SET = new Set(BIBLE_CANON_ORDER.slice(39).map((b) => b.toLowerCase()));

const CANONICAL_DISPLAY: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const b of BIBLE_CANON_ORDER) m[b.toLowerCase()] = b;
  return m;
})();

const CANON_INDEX: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  BIBLE_CANON_ORDER.forEach((b, i) => { m[b.toLowerCase()] = i; });
  return m;
})();

/**
 * Derive human-readable coverage metadata from the set of loaded book keys.
 */
function computeCoverage(books: Map<string, unknown>): {
  bookCount: number;
  scope: string;
  coveredBooks: string[];
} {
  const keys = Array.from(books.keys());
  const bookCount = keys.length;

  // Sort books in canonical Bible order; unknown books go to the end.
  const sorted = [...keys].sort((a, b) => {
    const ia = CANON_INDEX[a] ?? 999;
    const ib = CANON_INDEX[b] ?? 999;
    return ia - ib;
  });

  const coveredBooks = sorted.map((k) => CANONICAL_DISPLAY[k] ?? toTitleCase(k));

  let scope: string;
  if (bookCount === 66) {
    scope = "Whole Bible";
  } else if (bookCount === 39 && keys.every((k) => OT_SET.has(k))) {
    scope = "Old Testament";
  } else if (bookCount === 27 && keys.every((k) => NT_SET.has(k))) {
    scope = "New Testament";
  } else if (bookCount === 1) {
    scope = `${coveredBooks[0]} only`;
  } else {
    const hasOt = keys.some((k) => OT_SET.has(k));
    const hasNt = keys.some((k) => NT_SET.has(k));
    if (hasOt && !hasNt) {
      scope = `${bookCount} OT book${bookCount === 1 ? "" : "s"}`;
    } else if (!hasOt && hasNt) {
      scope = `${bookCount} NT book${bookCount === 1 ? "" : "s"}`;
    } else {
      scope = `${bookCount} books`;
    }
  }

  return { bookCount, scope, coveredBooks };
}

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface CommentaryChapterEntry {
  title?: string;
  text: string;
}

interface CommentaryBookFile {
  book: string;
  chapters: Record<string, CommentaryChapterEntry>;
}

export interface LoadedSource extends ScholarlySourceDiskManifest {
  /** Map of canonical-lowercase book name → book data. Empty for stub sources. */
  books: Map<string, CommentaryBookFile>;
}

export interface CommentaryHit {
  sourceId: string;
  sourceTitle: string;
  sourceAuthor: string;
  bookCanonical: string;
  chapter: number;
  title?: string;
  text: string;
}

export interface PassageVerseRef {
  book: string;
  chapter: number;
  verse: number;
}

/* -------------------------------------------------------------------------- */
/* Book canonicalization                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Map of (lowercased) book name or abbreviation → canonical lowercased book
 * name (also the `<book-slug>` filename without .json, with spaces → dashes).
 * Built once at module load.
 */
const BOOK_ALIASES: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  const add = (canonical: string, ...aliases: string[]) => {
    const key = canonical.toLowerCase();
    m[key] = key;
    for (const a of aliases) m[a.toLowerCase()] = key;
  };
  // Old Testament
  add("genesis", "gen", "ge", "gn");
  add("exodus", "exo", "ex", "exod");
  add("leviticus", "lev", "lv");
  add("numbers", "num", "nu", "nm");
  add("deuteronomy", "deut", "dt", "deu");
  add("joshua", "josh", "jos", "jsh");
  add("judges", "judg", "jdg", "jg");
  add("ruth", "ru");
  add("1 samuel", "1sam", "1 sam", "1sa", "i samuel", "first samuel");
  add("2 samuel", "2sam", "2 sam", "2sa", "ii samuel", "second samuel");
  add("1 kings", "1kgs", "1 kgs", "1ki", "i kings", "first kings");
  add("2 kings", "2kgs", "2 kgs", "2ki", "ii kings", "second kings");
  add("1 chronicles", "1chr", "1 chr", "1ch", "i chronicles");
  add("2 chronicles", "2chr", "2 chr", "2ch", "ii chronicles");
  add("ezra", "ezr");
  add("nehemiah", "neh", "ne");
  add("esther", "esth", "est");
  add("job", "jb");
  add("psalms", "ps", "psa", "psalm", "pss");
  add("proverbs", "prov", "pr", "prv");
  add("ecclesiastes", "ecc", "eccles", "qoh");
  add("song of songs", "song", "sos", "song of solomon", "canticles", "cant");
  add("isaiah", "isa", "is");
  add("jeremiah", "jer", "je", "jr");
  add("lamentations", "lam", "la");
  add("ezekiel", "ezek", "eze", "ezk");
  add("daniel", "dan", "da", "dn");
  add("hosea", "hos", "ho");
  add("joel", "jl");
  add("amos", "am");
  add("obadiah", "obad", "ob");
  add("jonah", "jon", "jnh");
  add("micah", "mic", "mi");
  add("nahum", "nah", "na");
  add("habakkuk", "hab", "hb");
  add("zephaniah", "zeph", "zep", "zp");
  add("haggai", "hag", "hg");
  add("zechariah", "zech", "zec", "zc");
  add("malachi", "mal", "ml");
  // New Testament
  add("matthew", "matt", "mt");
  add("mark", "mk", "mrk");
  add("luke", "lk", "luk");
  add("john", "jn", "jhn");
  add("acts", "ac", "act");
  add("romans", "rom", "ro", "rm");
  add("1 corinthians", "1cor", "1 cor", "1co", "i corinthians", "first corinthians");
  add("2 corinthians", "2cor", "2 cor", "2co", "ii corinthians", "second corinthians");
  add("galatians", "gal", "ga");
  add("ephesians", "eph", "ep");
  add("philippians", "phil", "php", "pp");
  add("colossians", "col", "cl");
  add("1 thessalonians", "1thess", "1 thess", "1th", "i thessalonians", "first thessalonians");
  add("2 thessalonians", "2thess", "2 thess", "2th", "ii thessalonians", "second thessalonians");
  add("1 timothy", "1tim", "1 tim", "1ti", "i timothy", "first timothy");
  add("2 timothy", "2tim", "2 tim", "2ti", "ii timothy", "second timothy");
  add("titus", "tit");
  add("philemon", "phlm", "phm");
  add("hebrews", "heb", "hb");
  add("james", "jas", "jm");
  add("1 peter", "1pet", "1 pet", "1pe", "i peter", "first peter");
  add("2 peter", "2pet", "2 pet", "2pe", "ii peter", "second peter");
  add("1 john", "1jn", "1 jn", "1jo", "i john", "first john");
  add("2 john", "2jn", "2 jn", "2jo", "ii john", "second john");
  add("3 john", "3jn", "3 jn", "3jo", "iii john", "third john");
  add("jude", "jud");
  add("revelation", "rev", "re", "rv", "apocalypse");
  return m;
})();

/**
 * Convert a canonical lowercase book name to its filename slug
 * (e.g. "1 corinthians" → "1-corinthians", "song of songs" → "song-of-songs").
 */
function bookSlug(canonical: string): string {
  return canonical.replace(/\s+/g, "-");
}

/**
 * Parse a passage reference into one or more (book, chapter) pairs.
 *
 * Handles:
 * - "Romans 8:28"               → [{ book: "romans", chapter: 8 }]
 * - "Romans 8:28-30"            → same (range within one chapter)
 * - "Romans 8"                  → same (whole chapter)
 * - "1 John 4:7-21"             → [{ book: "1 john", chapter: 4 }]
 * - "John 3:16-21"              → [{ book: "john", chapter: 3 }]
 * - "Romans 8:28; 12:1"         → [{ romans, 8 }, { romans, 12 }]
 * - "John 14-15"                → [{ john, 14 }, { john, 15 }] (multi-chapter)
 * - "Ps 23"                     → [{ psalms, 23 }]
 *
 * Returns an empty array for unparseable input. Best-effort, not strict.
 */
export function parsePassageRef(
  raw: string | null | undefined,
): Array<{ book: string; chapter: number }> {
  if (!raw) return [];
  const text = raw.trim();
  if (!text) return [];

  const out: Array<{ book: string; chapter: number }> = [];
  const seen = new Set<string>();
  // Split on `;` and `,` ONLY at the top level to allow combos like
  // "Romans 8:28; 12:1, 2"; preserve internal hyphens which mean ranges.
  const segments = text.split(/[;,]+/).map((s) => s.trim()).filter(Boolean);

  let lastBook: string | null = null;
  let lastSegHadVerse = false;
  for (const seg of segments) {
    // Verse continuation: the previous segment specified verses (had a colon),
    // and this segment is a bare number (e.g. "Romans 8:28, 29" → segments
    // ["Romans 8:28", "29"]). Skip — the chapter is unchanged and we already
    // recorded it.
    if (lastSegHadVerse && /^\d+\s*(?:-\s*\d+)?$/.test(seg)) {
      continue;
    }
    // Match a leading book token: optional digit prefix + word(s).
    // Book name may be "1 John", "Song of Songs", "Romans", "Ps".
    // We greedily grab the alphabetic prefix, then look up.
    const bookMatch = seg.match(
      /^\s*(?:([1-3])\s*)?([A-Za-z][A-Za-z .]*?)(?:\s+(\d.*))?$/,
    );
    let book: string | null = null;
    let rest = "";
    if (bookMatch) {
      const numPrefix = bookMatch[1] ? `${bookMatch[1]} ` : "";
      const wordPart = bookMatch[2].trim();
      const candidate = `${numPrefix}${wordPart}`.trim().toLowerCase().replace(/\s+/g, " ");
      const canonical = BOOK_ALIASES[candidate] ?? BOOK_ALIASES[wordPart.toLowerCase()];
      if (canonical) {
        book = canonical;
        rest = bookMatch[3] ?? "";
      }
    }
    if (!book) {
      // No leading book — assume continuation of previous segment's book
      // (e.g. "Romans 8:28; 12:1" → second segment is just "12:1").
      if (!lastBook) continue;
      book = lastBook;
      rest = seg;
    }
    lastBook = book;

    // Now parse chapter(s) out of `rest`. We accept:
    //   "8"          → [8]
    //   "8:28"       → [8]
    //   "8:28-30"    → [8]
    //   "8-10"       → [8, 9, 10]
    //   "8:28-9:3"   → [8, 9]
    rest = rest.trim();
    if (!rest) continue;
    // Strip the verse part if present (everything after first ':').
    // For "8:28-9:3" we still want chapters 8 and 9, so detect that case.
    const crossChapter = /^(\d+)\s*:\s*\d+\s*-\s*(\d+)\s*:/.exec(rest);
    let chapterPart: string;
    let secondChapter: number | null = null;
    if (crossChapter) {
      chapterPart = crossChapter[1];
      secondChapter = Number(crossChapter[2]);
    } else {
      // Drop verse spec ("8:28-30" → "8")
      chapterPart = rest.split(":")[0].trim();
    }

    // Parse chapter range like "8-10" or single "8".
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(chapterPart);
    let chapters: number[] = [];
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (Number.isFinite(a) && Number.isFinite(b) && a <= b && b - a < 20) {
        for (let i = a; i <= b; i++) chapters.push(i);
      }
    } else {
      const n = Number(chapterPart);
      if (Number.isFinite(n) && n > 0) chapters.push(n);
    }
    if (secondChapter !== null && Number.isFinite(secondChapter)) {
      if (!chapters.includes(secondChapter)) chapters.push(secondChapter);
    }

    for (const c of chapters) {
      const key = `${book}|${c}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ book, chapter: c });
    }
    lastSegHadVerse = rest.includes(":");
  }
  return out;
}

/**
 * Parse the verse portions of a passage for reference-library lookups.
 * `parsePassageRef` intentionally works at chapter granularity for
 * commentaries; this companion preserves verse numbers without changing that
 * long-standing API.
 */
export function parsePassageVerses(
  raw: string | null | undefined,
): PassageVerseRef[] {
  if (!raw?.trim()) return [];
  const out: PassageVerseRef[] = [];
  const seen = new Set<string>();
  let lastBook: string | null = null;
  let lastChapter: number | null = null;

  for (const segment of raw.split(/[;,]+/).map((s) => s.trim()).filter(Boolean)) {
    let book: string | null = null;
    let rest = segment;
    const match = segment.match(
      /^\s*(?:([1-3])\s*)?([A-Za-z][A-Za-z .]*?)(?:\s+(\d.*))?$/,
    );
    if (match) {
      const prefix = match[1] ? `${match[1]} ` : "";
      const candidate = `${prefix}${match[2].trim()}`
        .toLowerCase()
        .replace(/\s+/g, " ");
      book = BOOK_ALIASES[candidate] ?? BOOK_ALIASES[match[2].trim().toLowerCase()];
      if (book) rest = match[3] ?? "";
    }
    if (!book) {
      book = lastBook;
      rest = segment;
    }
    if (!book) continue;

    const verseRange = /^(\d+)\s*:\s*(\d+)(?:\s*-\s*(?:(\d+)\s*:\s*)?(\d+))?$/.exec(rest.trim());
    if (verseRange) {
      const chapter = Number(verseRange[1]);
      const first = Number(verseRange[2]);
      const endChapter = verseRange[3] ? Number(verseRange[3]) : chapter;
      const last = Number(verseRange[4] ?? verseRange[2]);
      // Cross-chapter ranges are bounded to the explicitly named endpoints.
      // We do not fabricate chapter lengths; the reference corpus can supply
      // only verses it actually contains.
      if (chapter > 0 && first > 0 && endChapter > 0 && last > 0) {
        if (endChapter === chapter) {
          for (let verse = first; verse <= last && verse - first < 100; verse++) {
            const key = `${book}|${chapter}|${verse}`;
            if (!seen.has(key)) {
              seen.add(key);
              out.push({ book, chapter, verse });
            }
          }
        } else {
          for (const verse of [first]) {
            const key = `${book}|${chapter}|${verse}`;
            if (!seen.has(key)) {
              seen.add(key);
              out.push({ book, chapter, verse });
            }
          }
          for (const verse of [last]) {
            const key = `${book}|${endChapter}|${verse}`;
            if (!seen.has(key)) {
              seen.add(key);
              out.push({ book, chapter: endChapter, verse });
            }
          }
        }
        lastChapter = chapter;
      }
    } else {
      const chapterRange = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(rest.trim());
      if (chapterRange) lastChapter = Number(chapterRange[1]);
    }
    lastBook = book;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Source registry — loaded once at module init                               */
/* -------------------------------------------------------------------------- */

function loadSource(sourceId: string): LoadedSource | null {
  const dir = join(DATA_ROOT, sourceId);
  let manifest: ScholarlySourceDiskManifest;
  try {
    const raw = readFileSync(join(dir, "MANIFEST.json"), "utf8");
    manifest = JSON.parse(raw) as ScholarlySourceDiskManifest;
  } catch (err) {
    logger.warn({ err, sourceId }, "scholarlySources: failed to load manifest");
    return null;
  }
  const books = new Map<string, CommentaryBookFile>();
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return { ...manifest, books };
  }
  for (const name of entries) {
    if (!name.endsWith(".json") || name === "MANIFEST.json") continue;
    const path = join(dir, name);
    try {
      const raw = readFileSync(path, "utf8");
      const parsed = JSON.parse(raw) as CommentaryBookFile;
      if (!parsed?.book || typeof parsed.chapters !== "object") continue;
      const canonical =
        BOOK_ALIASES[parsed.book.toLowerCase().trim()] ??
        parsed.book.toLowerCase().trim();
      books.set(canonical, parsed);
    } catch (err) {
      logger.warn(
        { err, sourceId, file: name },
        "scholarlySources: failed to parse book file",
      );
    }
  }
  return {
    ...manifest,
    kind: manifest.kind ?? "commentary",
    lookupType: manifest.lookupType ?? "chapter commentary",
    attribution: manifest.attribution ?? `${manifest.title} — ${manifest.author}`,
    books,
  };
}

const REGISTRY: Map<string, LoadedSource> = (() => {
  const m = new Map<string, LoadedSource>();
  let dirs: string[] = [];
  try {
    dirs = readdirSync(DATA_ROOT).filter((name) => {
      try {
        return statSync(join(DATA_ROOT, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch (err) {
    logger.warn(
      { err, dataRoot: DATA_ROOT },
      "scholarlySources: data root not readable; no sources will be available",
    );
    return m;
  }
  for (const id of dirs) {
    const src = loadSource(id);
    if (!src || src.id !== id) continue;
    // v1 ships only sources with a populated book corpus in the public
    // registry. Manifest-only stubs are kept on disk (for future seeding —
    // see follow-up task) but excluded from the registry so pastors never
    // see a toggle that quietly contributes no excerpts.
    if (src.books.size === 0) {
      logger.info(
        { sourceId: id },
        "scholarlySources: skipping manifest-only source (no book files)",
      );
      continue;
    }
    m.set(src.id, src);
  }
  logger.info(
    { sourceCount: m.size, sourceIds: Array.from(m.keys()) },
    "scholarlySources: registry loaded",
  );
  return m;
})();

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export function listRegisteredSources(): ScholarlySourceManifest[] {
  // Stable alphabetical-by-title order so Settings UI is deterministic.
  return Array.from(REGISTRY.values())
    .map((s) => {
      const { bookCount, scope, coveredBooks } = computeCoverage(s.books);
      return {
        id: s.id,
        title: s.title,
        author: s.author,
        year: s.year,
        license: s.license,
        sourceUrl: s.sourceUrl,
        description: s.description,
        kind: s.kind ?? "commentary",
        lookupType: s.lookupType ?? "chapter commentary",
        attribution: s.attribution ?? `${s.title} — ${s.author}`,
        bookCount,
        scope,
        coveredBooks,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function isRegisteredSource(id: string): boolean {
  return REGISTRY.has(id);
}

/**
 * Look up commentary entries for a passage from the given enabled sources,
 * staying within a single `totalBudgetChars` character ceiling.
 *
 * Hits are produced in source-priority order (enabled-source order → passage
 * order → chapter order), which keeps the most relevant excerpts first.
 * Each hit consumes however many characters its raw text occupies, up to the
 * remaining budget; the very last hit that fits is trimmed to fill the
 * remaining space rather than being dropped entirely.  Budget is consumed in
 * source-priority order — an earlier source with a long excerpt may exhaust
 * the ceiling before later sources get a turn.
 *
 * Using one budget instead of separate `maxHits` + per-excerpt char caps
 * means the total injected commentary is bounded regardless of how many
 * sources the user enables or how many chapters a sermon spans.
 */
export function lookupCommentary(
  enabledSourceIds: readonly string[],
  passageRefs: readonly string[],
  totalBudgetChars = TOTAL_COMMENTARY_BUDGET_CHARS,
): CommentaryHit[] {
  if (!enabledSourceIds.length || !passageRefs.length) return [];
  const parsed = passageRefs.flatMap((ref) => parsePassageRef(ref));
  if (!parsed.length) return [];

  const hits: CommentaryHit[] = [];
  const seen = new Set<string>();
  let remaining = totalBudgetChars;

  for (const sourceId of enabledSourceIds) {
    if (remaining <= 0) break;
    const src = REGISTRY.get(sourceId);
    if (!src || src.kind && src.kind !== "commentary") continue;
    for (const { book, chapter } of parsed) {
      if (remaining <= 0) break;
      const bookFile =
        src.books.get(book) ?? src.books.get(bookSlug(book));
      if (!bookFile) continue;
      const entry = bookFile.chapters[String(chapter)];
      if (!entry?.text) continue;
      const dedupeKey = `${sourceId}|${book}|${chapter}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const text = entry.text.slice(0, remaining);
      hits.push({
        sourceId,
        sourceTitle: src.title,
        sourceAuthor: src.author,
        bookCanonical: book,
        chapter,
        title: entry.title,
        text,
      });
      remaining -= text.length;
    }
  }
  return hits;
}

/**
 * The character budget used by `lookupCommentary` by default.
 * Exported so the UI can display "up to ~N words of context per generation".
 */
export { TOTAL_COMMENTARY_BUDGET_CHARS };

/**
 * Validate a list of source ids — throws if any id is unknown.
 * Used by the PUT preferences endpoint.
 */
export function assertAllRegistered(ids: readonly string[]): void {
  for (const id of ids) {
    if (!REGISTRY.has(id)) {
      throw new Error(`Unknown source id: ${id}`);
    }
  }
}
