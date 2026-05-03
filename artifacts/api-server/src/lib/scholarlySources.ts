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

const MAX_EXCERPT_CHARS = 1500;

/**
 * Default sources enabled the first time a user touches the Sources panel.
 *
 * Only sources with populated book corpora belong here — toggling on a
 * source with no excerpt data would silently inject nothing and confuse
 * pastors. v1 ships only Matthew Henry's Concise Commentary with seeded
 * book files; the other registered manifests are visible in Settings but
 * default off until their corpora are populated (see follow-up task).
 */
export const DEFAULT_ENABLED_SOURCE_IDS: string[] = [
  "matthew-henry-concise",
];

export interface ScholarlySourceManifest {
  id: string;
  title: string;
  author: string;
  year: string;
  license: string;
  sourceUrl: string;
  description: string;
}

export interface CommentaryChapterEntry {
  title?: string;
  text: string;
}

interface CommentaryBookFile {
  book: string;
  chapters: Record<string, CommentaryChapterEntry>;
}

export interface LoadedSource extends ScholarlySourceManifest {
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

/* -------------------------------------------------------------------------- */
/* Source registry — loaded once at module init                               */
/* -------------------------------------------------------------------------- */

function loadSource(sourceId: string): LoadedSource | null {
  const dir = join(DATA_ROOT, sourceId);
  let manifest: ScholarlySourceManifest;
  try {
    const raw = readFileSync(join(dir, "MANIFEST.json"), "utf8");
    manifest = JSON.parse(raw) as ScholarlySourceManifest;
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
  return { ...manifest, books };
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
    .map((s) => ({
      id: s.id,
      title: s.title,
      author: s.author,
      year: s.year,
      license: s.license,
      sourceUrl: s.sourceUrl,
      description: s.description,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function isRegisteredSource(id: string): boolean {
  return REGISTRY.has(id);
}

/**
 * Look up commentary entries for a passage from the given enabled sources.
 *
 * Returns at most `maxHits` hits total, in the order: enabled-source order,
 * then passage-parse order, then chapter order. Each hit's text is truncated
 * to ≤ 1500 chars to mirror the existing `resourceBlurb` cap.
 */
export function lookupCommentary(
  enabledSourceIds: readonly string[],
  passageRefs: readonly string[],
  maxHits = 8,
): CommentaryHit[] {
  if (!enabledSourceIds.length || !passageRefs.length) return [];
  const parsed = passageRefs.flatMap((ref) => parsePassageRef(ref));
  if (!parsed.length) return [];

  const hits: CommentaryHit[] = [];
  const seen = new Set<string>();
  for (const sourceId of enabledSourceIds) {
    const src = REGISTRY.get(sourceId);
    if (!src) continue;
    for (const { book, chapter } of parsed) {
      const bookFile =
        src.books.get(book) ?? src.books.get(bookSlug(book));
      if (!bookFile) continue;
      const entry = bookFile.chapters[String(chapter)];
      if (!entry?.text) continue;
      const dedupeKey = `${sourceId}|${book}|${chapter}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      hits.push({
        sourceId,
        sourceTitle: src.title,
        sourceAuthor: src.author,
        bookCanonical: book,
        chapter,
        title: entry.title,
        text: entry.text.slice(0, MAX_EXCERPT_CHARS),
      });
      if (hits.length >= maxHits) return hits;
    }
  }
  return hits;
}

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
