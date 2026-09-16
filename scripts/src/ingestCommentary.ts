/**
 * Unified ingest for bundled public-domain commentaries.
 *
 * Run:
 *   pnpm --filter @workspace/scripts run ingest-commentary <source-id>
 *
 * Supported source ids (most scrape biblehub.com per chapter):
 *   - jamieson-fausset-brown   → /commentaries/jfb/<book>/<ch>.htm
 *   - barnes-notes             → /commentaries/barnes/<book>/<ch>.htm
 *   - pulpit-commentary        → /commentaries/pulpit/<book>/<ch>.htm
 *   - adam-clarke              → /commentaries/clarke/<book>/<ch>.htm
 *   - john-gill                → /commentaries/gill/<book>/<ch>.htm
 *   - keil-delitzsch           → /commentaries/kad/<book>/<ch>.htm (OT only)
 *   - calvin-commentaries      → /commentaries/calvin/<book>/<ch>.htm (Calvin's 48-book canon)
 *   - spurgeon-treasury        → /commentaries/tod/<book>/<ch>.htm (Psalms only)
 *   - matthew-poole            → /commentaries/poole/<book>/<ch>.htm
 *   - ellicott-english-readers → /commentaries/ellicott/<book>/<ch>.htm
 *   - wesley-explanatory-notes → /commentaries/wes/<book>/<ch>.htm
 *   - joseph-benson            → /commentaries/benson/<book>/<ch>.htm
 *   - john-trapp               → SermonIndex /commentary/trapp/<book>/<ch>
 *   - thomas-scott             → SermonIndex /commentary/tscott/PSA/<ch>
 *   - augustine-expositions    → New Advent /fathers/1801<psalm>.htm (Psalms)
 *   - luther-galatians        → CCEL /ccel/luther/galatians/galatians.<ch>.html
 *
 * Why BibleHub and not CCEL? CCEL serves a per-work plain-text dump only for
 * a few commentaries (Henry, JFB) and the JFB dump's per-book headers vary
 * wildly across the canon ("THE FIRST BOOK OF MOSES, CALLED \n GENESIS",
 * "THE \n BOOK OF JOSHUA", "THE EPISTLE OF PAUL THE APOSTLE TO THE \n
 * ROMANS", and several books with no explicit header at all). BibleHub's
 * per-chapter pages have a consistent DOM shape across the BibleHub-backed
 * commentaries, which gives one parser for that part of the pipeline.
 *
 * Output: writes one `<book-slug>.json` per Bible book into
 * `artifacts/api-server/data/commentaries/<source-id>/`, in the schema
 * documented in `data/commentaries/MANIFESTS.md`. Each chapter `text` is
 * plain-text (no HTML, no markdown), trimmed to ≤ ~1400 chars (the
 * registry truncates at 1500 anyway). Idempotent: existing book files are
 * deleted before write.
 *
 * Provenance: each book file records the URL it was sourced from in a
 * top-level `_sourceUrl` field. The api-server loader ignores unknown
 * top-level keys.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = join(__dirname, "..", "..");
const DATA_ROOT = join(
  MONOREPO_ROOT,
  "artifacts",
  "api-server",
  "data",
  "commentaries",
);

const TARGET_EXCERPT_CHARS = 1400; // registry truncates at 1500
const MIN_EXCERPT_CHARS = 200; // skip "no commentary available" stubs
// SermonIndex preserves authentic cross-reference notes that can be shorter
// than BibleHub's normal floor (for example, Trapp's Isaiah 36 note).
const SERMON_INDEX_MIN_EXCERPT_CHARS = 80;
// New Advent and CCEL preserve some authentic short chapter notes. Their
// source-specific floors are deliberately lower than the BibleHub floor, while
// still rejecting page shells and empty bodies.
const NEW_ADVENT_MIN_EXCERPT_CHARS = 100;
const CCEL_MIN_EXCERPT_CHARS = 100;

export interface BookSpec {
  /** Display name for `book` field, e.g. "1 Corinthians". */
  name: string;
  /** Canonical lowercase form, also the `<book-slug>` (with dashes). */
  canonical: string;
  /** Slug used by BibleHub URLs (e.g. "1_corinthians", "songs"). */
  bhSlug: string;
  /** Total chapters in the book (KJV). */
  chapters: number;
}

export const BOOKS: BookSpec[] = [
  // OT
  ["Genesis", "genesis", 50],
  ["Exodus", "exodus", 40],
  ["Leviticus", "leviticus", 27],
  ["Numbers", "numbers", 36],
  ["Deuteronomy", "deuteronomy", 34],
  ["Joshua", "joshua", 24],
  ["Judges", "judges", 21],
  ["Ruth", "ruth", 4],
  ["1 Samuel", "1 samuel", 31],
  ["2 Samuel", "2 samuel", 24],
  ["1 Kings", "1 kings", 22],
  ["2 Kings", "2 kings", 25],
  ["1 Chronicles", "1 chronicles", 29],
  ["2 Chronicles", "2 chronicles", 36],
  ["Ezra", "ezra", 10],
  ["Nehemiah", "nehemiah", 13],
  ["Esther", "esther", 10],
  ["Job", "job", 42],
  ["Psalms", "psalms", 150],
  ["Proverbs", "proverbs", 31],
  ["Ecclesiastes", "ecclesiastes", 12],
  ["Song of Solomon", "song of songs", 8],
  ["Isaiah", "isaiah", 66],
  ["Jeremiah", "jeremiah", 52],
  ["Lamentations", "lamentations", 5],
  ["Ezekiel", "ezekiel", 48],
  ["Daniel", "daniel", 12],
  ["Hosea", "hosea", 14],
  ["Joel", "joel", 3],
  ["Amos", "amos", 9],
  ["Obadiah", "obadiah", 1],
  ["Jonah", "jonah", 4],
  ["Micah", "micah", 7],
  ["Nahum", "nahum", 3],
  ["Habakkuk", "habakkuk", 3],
  ["Zephaniah", "zephaniah", 3],
  ["Haggai", "haggai", 2],
  ["Zechariah", "zechariah", 14],
  ["Malachi", "malachi", 4],
  // NT
  ["Matthew", "matthew", 28],
  ["Mark", "mark", 16],
  ["Luke", "luke", 24],
  ["John", "john", 21],
  ["Acts", "acts", 28],
  ["Romans", "romans", 16],
  ["1 Corinthians", "1 corinthians", 16],
  ["2 Corinthians", "2 corinthians", 13],
  ["Galatians", "galatians", 6],
  ["Ephesians", "ephesians", 6],
  ["Philippians", "philippians", 4],
  ["Colossians", "colossians", 4],
  ["1 Thessalonians", "1 thessalonians", 5],
  ["2 Thessalonians", "2 thessalonians", 3],
  ["1 Timothy", "1 timothy", 6],
  ["2 Timothy", "2 timothy", 4],
  ["Titus", "titus", 3],
  ["Philemon", "philemon", 1],
  ["Hebrews", "hebrews", 13],
  ["James", "james", 5],
  ["1 Peter", "1 peter", 5],
  ["2 Peter", "2 peter", 3],
  ["1 John", "1 john", 5],
  ["2 John", "2 john", 1],
  ["3 John", "3 john", 1],
  ["Jude", "jude", 1],
  ["Revelation", "revelation", 22],
].map(([name, canonical, chapters]) => ({
  name: name as string,
  canonical: canonical as string,
  // BibleHub slug: spaces → underscores; "Song of Solomon" is "songs".
  bhSlug:
    name === "Song of Solomon"
      ? "songs"
      : (name as string).toLowerCase().replace(/\s+/g, "_"),
  chapters: chapters as number,
}));

/**
 * Calvin's Commentaries covers 48 books. Keep this inventory shared with the
 * offline validation contract so the ingest scope cannot drift from the
 * checked-in corpus.
 */
export const CALVIN_BOOK_SLUGS = [
  "1-corinthians",
  "1-john",
  "1-peter",
  "1-thessalonians",
  "1-timothy",
  "2-corinthians",
  "2-peter",
  "2-thessalonians",
  "2-timothy",
  "acts",
  "amos",
  "colossians",
  "daniel",
  "deuteronomy",
  "ephesians",
  "exodus",
  "ezekiel",
  "galatians",
  "genesis",
  "habakkuk",
  "haggai",
  "hebrews",
  "hosea",
  "isaiah",
  "james",
  "jeremiah",
  "joel",
  "john",
  "jonah",
  "joshua",
  "jude",
  "lamentations",
  "leviticus",
  "luke",
  "malachi",
  "mark",
  "matthew",
  "micah",
  "nahum",
  "numbers",
  "obadiah",
  "philemon",
  "philippians",
  "psalms",
  "romans",
  "titus",
  "zechariah",
  "zephaniah",
] as const;

const SERMON_INDEX_CODES: Record<string, string> = {
  genesis: "GEN",
  exodus: "EXO",
  leviticus: "LEV",
  numbers: "NUM",
  deuteronomy: "DEU",
  joshua: "JOS",
  judges: "JDG",
  ruth: "RUT",
  "1 samuel": "1SA",
  "2 samuel": "2SA",
  "1 kings": "1KI",
  "2 kings": "2KI",
  "1 chronicles": "1CH",
  "2 chronicles": "2CH",
  ezra: "EZR",
  nehemiah: "NEH",
  esther: "EST",
  job: "JOB",
  psalms: "PSA",
  proverbs: "PRO",
  ecclesiastes: "ECC",
  "song of songs": "SOS",
  isaiah: "ISA",
  jeremiah: "JER",
  lamentations: "LAM",
  ezekiel: "EZK",
  daniel: "DAN",
  hosea: "HOS",
  joel: "JOL",
  amos: "AMO",
  obadiah: "OBA",
  jonah: "JON",
  micah: "MIC",
  nahum: "NAH",
  habakkuk: "HAB",
  zephaniah: "ZEP",
  haggai: "HAG",
  zechariah: "ZEC",
  malachi: "MAL",
  matthew: "MAT",
  mark: "MRK",
  luke: "LUK",
  john: "JHN",
  acts: "ACT",
  romans: "ROM",
  "1 corinthians": "1CO",
  "2 corinthians": "2CO",
  galatians: "GAL",
  ephesians: "EPH",
  philippians: "PHP",
  colossians: "COL",
  "1 thessalonians": "1TH",
  "2 thessalonians": "2TH",
  "1 timothy": "1TI",
  "2 timothy": "2TI",
  titus: "TIT",
  philemon: "PHM",
  hebrews: "HEB",
  james: "JAS",
  "1 peter": "1PE",
  "2 peter": "2PE",
  "1 john": "1JN",
  "2 john": "2JN",
  "3 john": "3JN",
  jude: "JUD",
  revelation: "REV",
};

function bookSlug(canonical: string): string {
  return canonical.replace(/\s+/g, "-");
}

/* -------------------------------------------------------------------------- */
/* HTML → text helpers (BibleHub)                                             */
/* -------------------------------------------------------------------------- */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? "");
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function finalizeExcerpt(combined: string): string {
  combined = combined.replace(/\s+/g, " ").trim();
  combined = combined
    .replace(/\bNo text from Poole on this verse\.?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Strip common aggregator attribution/footer boilerplate. These markers
  // must be removed before truncation so a footer cannot crowd out commentary.
  const FOOTER_MARKERS = [
    /\bText Courtesy of [^.]*\./i,
    /\bOld and New Testaments by Robert Jamieson[\s\S]*$/i,
    /\bBible Hub\s*$/i,
    /\bbiblehub\.com[\s\S]*$/i,
    /\bInternet Sacred Texts Archive[\s\S]*$/i,
    /\bMatthew Poole's Commentary[\s\S]*$/i,
    /\bExplanatory Notes on the Whole Bible by John Wesley[\s\S]*$/i,
    /\bEllicott's Commentary for English Readers[\s\S]*$/i,
    /\bBenson Commentary on the Old and New Testaments[\s\S]*$/i,
    /\bCheck citations for accuracy before use[\s\S]*$/i,
    /\bSermonIndex\.net[\s\S]*$/i,
  ];
  for (const re of FOOTER_MARKERS) combined = combined.replace(re, "").trim();

  // End at a sentence boundary where possible, otherwise at a word boundary.
  // The ellipsis is deliberate and tells the model that the excerpt is capped.
  if (combined.length > TARGET_EXCERPT_CHARS) {
    const cut = combined.slice(0, TARGET_EXCERPT_CHARS);
    const lastStop = Math.max(
      cut.lastIndexOf(". "),
      cut.lastIndexOf("! "),
      cut.lastIndexOf("? "),
    );
    if (lastStop > TARGET_EXCERPT_CHARS - 300) {
      combined = cut.slice(0, lastStop + 1);
    } else {
      const lastSpace = cut.lastIndexOf(" ");
      combined = (lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
    }
  } else {
    const tail = combined.slice(-1);
    if (tail && !/[.!?")\]]/.test(tail)) {
      const lastStop = Math.max(
        combined.lastIndexOf(". "),
        combined.lastIndexOf("! "),
        combined.lastIndexOf("? "),
      );
      if (lastStop > combined.length - 400 && lastStop > 200) {
        combined = combined.slice(0, lastStop + 1);
      } else if (combined.length > 200) {
        const lastSpace = combined.lastIndexOf(" ");
        if (lastSpace > combined.length - 30) {
          combined = combined.slice(0, lastSpace).trimEnd() + "…";
        }
      }
    }
  }
  return combined;
}

/**
 * Extract a chapter-overview excerpt from a BibleHub commentary HTML page.
 *
 * Strategy: the page's main content has a repeating sequence of
 *   <div class="versenum">…verse N…</div>
 *   <div class="verse">scripture text</div>
 *   …commentary prose (sometimes inside <div class="comm">, sometimes raw)…
 * We collect commentary prose for the first few verses until we have
 * roughly TARGET_EXCERPT_CHARS of text. We strip the scripture text so
 * the excerpt is pure commentary.
 */
export function extractBibleHubExcerpt(html: string): string {
  // Strip noise that confuses the text extractor:
  //  - <script>/<style> blocks (inline JS often appears mid-content for ads)
  //  - <noscript> blocks
  //  - HTML comments
  const cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // Trim to main content. The chapter content lives inside <div class="chap">…</div>.
  const chapMatch = /<div class="chap">([\s\S]*?)(?:<div class="crossverse"|<div class="bot"|<div class="footer)/i.exec(
    cleaned,
  );
  const main = chapMatch ? chapMatch[1] : cleaned;

  // Split on versenum markers.
  const parts = main.split(/<div class="versenum">/i);
  // First part is usually the chapter intro before any verse — keep it.
  const collected: string[] = [];

  const cleanCommentaryFromBlock = (block: string): string => {
    // Strip versenum link and the verse scripture div first.
    // Pattern after split: "verse N anchor</div><div class="verse">scripture</div>commentary…"
    // Drop everything up through the first </div></div> after a class="verse"…</div>.
    let b = block;
    // Remove the leading anchor + closing </div> from versenum content.
    b = b.replace(/^[\s\S]*?<\/div>/, "");
    // Remove the scripture verse div.
    b = b.replace(/<div class="verse"[^>]*>[\s\S]*?<\/div>/i, "");
    // Now `b` is the commentary, possibly with <div class="comm"> wrappers.
    // Strip ad blocks, footnotes, and cross-references commonly tagged.
    b = b.replace(/<div class="(adsbygoogle|maintable[0-9]?|footer|crossverse)"[\s\S]*$/i, "");
    return stripHtml(b);
  };

  let total = 0;
  // Skip parts[0] entirely — that's page chrome (title, nav, related links)
  // before the first verse marker, and contains no commentary.
  for (let i = 1; i < parts.length && total < TARGET_EXCERPT_CHARS + 200; i++) {
    const text = cleanCommentaryFromBlock(parts[i]);
    if (text.length < 30) continue;
    collected.push(text);
    total += text.length;
  }
  let combined = collected.join(" ").replace(/\s+/g, " ").trim();

  return finalizeExcerpt(combined);
}

interface BookOut {
  book: string;
  chapters: Record<string, { text: string }>;
  _sourceUrl: string;
}

export function diffExactCoverage(
  got: ReadonlySet<string>,
  booksScope: ReadonlyArray<Pick<BookSpec, "canonical" | "chapters">>,
  knownEmpty: readonly string[],
): { missing: string[]; unexpected: string[] } {
  const expected = new Set<string>();
  for (const spec of booksScope) {
    for (let ch = 1; ch <= spec.chapters; ch++) {
      const key = `${spec.canonical} ${ch}`;
      if (!knownEmpty.includes(key)) expected.add(key);
    }
  }
  return {
    missing: [...expected].filter((key) => !got.has(key)),
    unexpected: [...got].filter((key) => !expected.has(key)),
  };
}

/* -------------------------------------------------------------------------- */
/* BibleHub scraper                                                           */
/* -------------------------------------------------------------------------- */

async function fetchWithRetry(url: string, attempts = 3): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "WorshipFlow-PD-Ingest/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        if (res.status === 404) return "";
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.text();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr ?? new Error("fetch failed");
}

/** OT books only (first 39 entries = Genesis through Malachi). */
const OT_BOOKS = BOOKS.slice(0, 39);

/** Psalms only — for Spurgeon's Treasury of David. */
const PSALMS_BOOKS = BOOKS.filter((b) => b.canonical === "psalms");

/** Calvin's documented 48-book scope. */
const CALVIN_BOOKS = BOOKS.filter((book) =>
  CALVIN_BOOK_SLUGS.includes(
    book.canonical.replace(/\s+/g, "-") as (typeof CALVIN_BOOK_SLUGS)[number],
  ),
);

/** NT books minus Revelation — for sources that cover the rest of the canon. */
const BOOKS_EXCEPT_REVELATION = BOOKS.filter((b) => b.canonical !== "revelation");

async function ingestBibleHub(
  sourceId:
    | "jamieson-fausset-brown"
    | "barnes-notes"
    | "pulpit-commentary"
    | "adam-clarke"
    | "john-gill"
    | "keil-delitzsch"
    | "calvin-commentaries"
    | "spurgeon-treasury"
    | "matthew-poole"
    | "wesley-explanatory-notes"
    | "ellicott-english-readers"
    | "joseph-benson",
  bhPath:
    | "jfb"
    | "barnes"
    | "pulpit"
    | "clarke"
    | "gill"
    | "kad"
    | "calvin"
    | "tod"
    | "poole"
    | "wes"
    | "ellicott"
    | "benson",
  /** When true, only OT books are fetched (for OT-only commentaries like K&D). */
  otOnly = false,
  /** When true, only Psalms is fetched (for Spurgeon's Treasury of David). */
  psalmsOnly = false,
  /** When true, Revelation is excluded (for Calvin's Commentaries). */
  skipRevelation = false,
  /** When true, restrict the fetch scope to Calvin's documented 48 books. */
  calvinOnly = false,
  /**
   * Passed through to writeBooks — minimum book count the gate accepts.
   * Set when the commentary intentionally skips certain books.
   */
  minBooksOverride?: number,
  /**
   * Passed through to writeBooks — minimum chapter count the gate accepts.
   * Set alongside minBooksOverride for partial-canon commentaries.
   */
  minChaptersOverride?: number,
  /**
   * Minimum cleaned commentary length accepted as a real chapter entry.
   * Wesley has a few authentic, concise notes below the shared 200-char floor.
   */
  minExcerptChars = MIN_EXCERPT_CHARS,
): Promise<void> {
  let booksScope: BookSpec[];
  if (psalmsOnly) {
    booksScope = PSALMS_BOOKS;
  } else if (otOnly) {
    booksScope = OT_BOOKS;
  } else if (calvinOnly) {
    booksScope = CALVIN_BOOKS;
  } else if (skipRevelation) {
    booksScope = BOOKS_EXCEPT_REVELATION;
  } else {
    booksScope = BOOKS;
  }
  const books = new Map<string, BookOut>();
  const concurrency = 12;

  // Build flat work list of (book, chapter).
  const work: { spec: BookSpec; ch: number }[] = [];
  for (const spec of booksScope) {
    for (let c = 1; c <= spec.chapters; c++) work.push({ spec, ch: c });
  }
  console.log(`[${sourceId}] fetching ${work.length} chapter pages…`);

  let done = 0;
  let kept = 0;
  let i = 0;
  const next = async (): Promise<void> => {
    while (true) {
      const idx = i++;
      if (idx >= work.length) return;
      const { spec, ch } = work[idx];
      const url = `https://biblehub.com/commentaries/${bhPath}/${spec.bhSlug}/${ch}.htm`;
      try {
        const html = await fetchWithRetry(url);
        if (!html) {
          done++;
          continue;
        }
        const excerpt = extractBibleHubExcerpt(html);
        if (excerpt.length >= minExcerptChars) {
          let book = books.get(spec.canonical);
          if (!book) {
            book = {
              book: spec.name,
              chapters: {},
              _sourceUrl: `https://biblehub.com/commentaries/${bhPath}/${spec.bhSlug}/`,
            };
            books.set(spec.canonical, book);
          }
          book.chapters[String(ch)] = { text: excerpt };
          kept++;
        }
      } catch (err) {
        console.warn(`  ${url}: ${(err as Error).message}`);
      }
      done++;
      if (done % 100 === 0) {
        console.log(`  ${done}/${work.length} fetched, ${kept} kept`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => next()));
  console.log(`[${sourceId}] done: ${done} fetched, ${kept} kept across ${books.size} books`);
  writeBooks(sourceId, books, booksScope, minBooksOverride, minChaptersOverride);
}

function extractSermonIndexContent(html: string): string {
  const marker = '<div class="bch-content comm-content">';
  const start = html.indexOf(marker);
  if (start < 0) return "";

  const contentStart = start + marker.length;
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = contentStart;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tags.exec(html))) {
    if (match[0].startsWith("</")) {
      depth--;
    } else {
      depth++;
    }
    if (depth === 0) return html.slice(contentStart, match.index);
  }
  return html.slice(contentStart);
}

/**
 * SermonIndex pages group verse-level notes beneath h3 headings. The first
 * paragraph in each group also contains the Bible text, followed by a
 * "Ver. N." or "V. N." marker where the commentary begins. Strip that
 * scripture lead-in and the citation footer before applying the shared cap.
 */
export function extractSermonIndexExcerpt(html: string): string {
  const content = extractSermonIndexContent(html);
  if (!content) return "";

  const sections = content.split(/<h3\b[^>]*>[\s\S]*?<\/h3>/i).slice(1);
  const excerpts: string[] = [];
  for (const section of sections) {
    let text = stripHtml(section)
      .replace(/\\+/g, " ")
      // SermonIndex's Scott transcription has one encoded OCR typo:
      // "Th&lt; leaders" should read "The leaders".
      .replace(/\bTh<\s+leaders\b/gi, "The leaders")
      .replace(/\s+/g, " ")
      .trim();
    const marker = /\b(?:Ver\.|V\.)\s*[\d\s.,&–—-]+/i.exec(text);
    if (marker) {
      text = text.slice(marker.index + marker[0].length).trim();
    }
    if (text.length >= 30) excerpts.push(text);
  }

  return finalizeExcerpt(excerpts.join(" "));
}

async function ingestSermonIndex(
  sourceId: "john-trapp" | "thomas-scott",
  path: "trapp" | "tscott",
  booksScope: BookSpec[],
): Promise<void> {
  const books = new Map<string, BookOut>();
  const work: { spec: BookSpec; ch: number }[] = [];
  for (const spec of booksScope) {
    for (let ch = 1; ch <= spec.chapters; ch++) work.push({ spec, ch });
  }
  console.log(`[${sourceId}] fetching ${work.length} chapter pages…`);

  let done = 0;
  let kept = 0;
  let i = 0;
  const concurrency = 12;
  const next = async (): Promise<void> => {
    while (true) {
      const idx = i++;
      if (idx >= work.length) return;
      const { spec, ch } = work[idx];
      const code = SERMON_INDEX_CODES[spec.canonical];
      if (!code) throw new Error(`No SermonIndex code for ${spec.canonical}`);
      const url = `https://www.sermonindex.net/commentary/${path}/${code}/${ch}`;
      try {
        const html = await fetchWithRetry(url);
        if (!html) {
          done++;
          continue;
        }
        const excerpt = extractSermonIndexExcerpt(html);
        if (excerpt.length >= SERMON_INDEX_MIN_EXCERPT_CHARS) {
          let book = books.get(spec.canonical);
          if (!book) {
            book = {
              book: spec.name,
              chapters: {},
              _sourceUrl: `https://www.sermonindex.net/commentary/${path}/${code}/`,
            };
            books.set(spec.canonical, book);
          }
          book.chapters[String(ch)] = { text: excerpt };
          kept++;
        }
      } catch (err) {
        console.warn(`  ${url}: ${(err as Error).message}`);
      }
      done++;
      if (done % 100 === 0) {
        console.log(`  ${done}/${work.length} fetched, ${kept} kept`);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => next()));
  console.log(`[${sourceId}] done: ${done} fetched, ${kept} kept across ${books.size} books`);
  writeBooks(sourceId, books, booksScope);
}

/**
 * Extract the article body from New Advent's Church Fathers pages. The
 * article is already passage-keyed (one page per Psalm), but the page also
 * includes breadcrumbs, ads, cross-reference link labels, and an attribution
 * footer. Keep the prose inside the article heading and stop before the
 * publication block.
 */
export function extractNewAdventExcerpt(html: string): string {
  const heading = /<h1[^>]*>[\s\S]*?<\/h1>/i.exec(html);
  if (!heading) return "";
  const bodyStart = heading.index + heading[0].length;
  const body = html
    .slice(bodyStart)
    .split(/<div\b[^>]*class=["']pub["'][^>]*>/i)[0]
    // New Advent places a donation banner before the first exposition
    // paragraph. It is host boilerplate, not Augustine's text.
    .replace(
      /<p>\s*<em>\s*<a\b[^>]*>[\s\S]*?<\/a>[\s\S]*?<\/em>\s*<\/p>/i,
      " ",
    );
  return finalizeExcerpt(stripHtml(body));
}

/**
 * Extract the chapter body from CCEL's XHTML reader. A balanced div scan is
 * used instead of a greedy regex because the chapter contains nested spans,
 * tables, and footnote markup.
 */
export function extractCcelBookContent(html: string): string {
  const marker = /<div\b[^>]*class="book-content"[^>]*>/i.exec(html);
  if (!marker) return "";
  const start = marker.index + marker[0].length;
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = start;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tags.exec(html))) {
    if (match[0].startsWith("</")) depth--;
    else depth++;
    if (depth === 0) {
      return finalizeExcerpt(stripHtml(html.slice(start, match.index)));
    }
  }
  return finalizeExcerpt(stripHtml(html.slice(start)));
}

async function ingestAugustineExpositions(): Promise<void> {
  const psalms = BOOKS.find((book) => book.canonical === "psalms");
  if (!psalms) throw new Error("Psalms inventory is unavailable");
  const books = new Map<string, BookOut>();
  let kept = 0;
  for (let chapter = 1; chapter <= 150; chapter++) {
    const padded = String(chapter).padStart(3, "0");
    const url = `https://www.newadvent.org/fathers/1801${padded}.htm`;
    const html = await fetchWithRetry(url);
    const excerpt = extractNewAdventExcerpt(html);
    if (excerpt.length < NEW_ADVENT_MIN_EXCERPT_CHARS) {
      throw new Error(
        `[augustine-expositions] FATAL: ${psalms.canonical} ${chapter} ` +
          `produced only ${excerpt.length} cleaned characters`,
      );
    }
    let book = books.get(psalms.canonical);
    if (!book) {
      book = {
        book: psalms.name,
        chapters: {},
        _sourceUrl: "https://www.newadvent.org/fathers/1801.htm",
      };
      books.set(psalms.canonical, book);
    }
    book.chapters[String(chapter)] = { text: excerpt };
    kept++;
  }
  console.log(`[augustine-expositions] fetched and kept ${kept} Psalm chapters`);
  writeBooks("augustine-expositions", books, [psalms]);
}

async function ingestLutherGalatians(): Promise<void> {
  const galatians = BOOKS.find((book) => book.canonical === "galatians");
  if (!galatians) throw new Error("Galatians inventory is unavailable");
  const books = new Map<string, BookOut>();
  const chapterPages = ["iv", "v", "vi", "vii", "viii", "ix"];
  const book = {
    book: galatians.name,
    chapters: {} as Record<string, { text: string }>,
    _sourceUrl: "https://ccel.org/ccel/luther/galatians/galatians.iv.html",
  };
  for (const [index, page] of chapterPages.entries()) {
    const chapter = index + 1;
    const url = `https://ccel.org/ccel/luther/galatians/galatians.${page}.html`;
    const html = await fetchWithRetry(url);
    const excerpt = extractCcelBookContent(html);
    if (excerpt.length < CCEL_MIN_EXCERPT_CHARS) {
      throw new Error(
        `[luther-galatians] FATAL: ${galatians.canonical} ${chapter} ` +
          `produced only ${excerpt.length} cleaned characters`,
      );
    }
    book.chapters[String(chapter)] = { text: excerpt };
  }
  books.set(galatians.canonical, book);
  console.log(`[luther-galatians] fetched and kept ${chapterPages.length} Galatians chapters`);
  writeBooks("luther-galatians", books, [galatians]);
}

/* -------------------------------------------------------------------------- */
/* Output writer                                                              */
/* -------------------------------------------------------------------------- */

function writeBooks(
  sourceId: string,
  books: Map<string, BookOut>,
  booksScope: BookSpec[] = BOOKS,
  /**
   * Override the minimum expected book count in the completeness gate.
   * Use for commentaries that intentionally skip certain books (e.g. Calvin).
   * When undefined, the gate expects all books in booksScope.
   */
  minBooksOverride?: number,
  /**
   * Override the minimum expected chapter count in the completeness gate.
   * Use alongside minBooksOverride for commentaries with a known partial canon.
   * When undefined, the gate expects all scope chapters minus KNOWN_EMPTY_UPSTREAM.
   */
  minChaptersOverride?: number,
): void {
  const outDir = join(DATA_ROOT, sourceId);
  const sortedCanonicals = Array.from(books.keys()).sort(
    (a, b) =>
      BOOKS.findIndex((b1) => b1.canonical === a) -
      BOOKS.findIndex((b2) => b2.canonical === b),
  );
  const got = new Set<string>();
  for (const canonical of sortedCanonicals) {
    const out = books.get(canonical)!;
    for (const ch of Object.keys(out.chapters)) got.add(`${canonical} ${ch}`);
  }
  const totalChapters = got.size;

  // Exact sources must match scope minus the hand-checked allowlist.
  const scopeChapters = booksScope.reduce((s, b) => s + b.chapters, 0);
  const expectedChapters =
    minChaptersOverride ??
    scopeChapters - KNOWN_EMPTY_UPSTREAM[sourceId].length;
  const expectedBooks = minBooksOverride ?? booksScope.length;

  if (minBooksOverride === undefined && minChaptersOverride === undefined) {
    const { missing, unexpected } = diffExactCoverage(
      got,
      booksScope,
      KNOWN_EMPTY_UPSTREAM[sourceId],
    );
    if (missing.length > 0 || unexpected.length > 0) {
      throw new Error(
        `[${sourceId}] FATAL: exact coverage mismatch; ` +
          `${missing.length} unexpected gaps (${missing.slice(0, 10).join(", ")}); ` +
          `${unexpected.length} allowlisted/out-of-scope chapters unexpectedly present ` +
          `(${unexpected.slice(0, 10).join(", ")})`,
      );
    }
  } else if (books.size < expectedBooks) {
    throw new Error(
      `[${sourceId}] FATAL: only ${books.size}/${expectedBooks} books — likely an upstream format change.`,
    );
  } else if (totalChapters < expectedChapters) {
    const missing: string[] = [];
    for (const spec of booksScope) {
      for (let ch = 1; ch <= spec.chapters; ch++) {
        const key = `${spec.canonical} ${ch}`;
        if (
          !got.has(key) &&
          !KNOWN_EMPTY_UPSTREAM[sourceId].includes(key)
        ) {
          missing.push(key);
        }
      }
    }
    throw new Error(
      `[${sourceId}] FATAL: ${totalChapters}/${expectedChapters} chapters; ` +
        `${missing.length} unexpected gaps. First 10: ${missing
          .slice(0, 10)
          .join(", ")}`,
    );
  }

  // Only replace the live corpus after validation. Build a complete sibling
  // directory, then swap it into place; a failed ingest leaves the prior
  // corpus untouched.
  const stageDir = `${outDir}.ingest-${process.pid}`;
  const backupDir = `${outDir}.backup-${process.pid}`;
  rmSync(stageDir, { recursive: true, force: true });
  rmSync(backupDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });
  const manifestPath = join(outDir, "MANIFEST.json");
  if (existsSync(manifestPath)) {
    copyFileSync(manifestPath, join(stageDir, "MANIFEST.json"));
  }

  let totalBytes = 0;
  for (const canonical of sortedCanonicals) {
    const out = books.get(canonical)!;
    if (Object.keys(out.chapters).length === 0) continue;
    const json = JSON.stringify(out, null, 2);
    writeFileSync(join(stageDir, `${bookSlug(canonical)}.json`), json);
    totalBytes += json.length;
  }

  try {
    if (existsSync(outDir)) renameSync(outDir, backupDir);
    renameSync(stageDir, outDir);
    rmSync(backupDir, { recursive: true, force: true });
  } catch (error) {
    if (!existsSync(outDir) && existsSync(backupDir)) {
      renameSync(backupDir, outDir);
    }
    rmSync(stageDir, { recursive: true, force: true });
    throw error;
  }

  console.log(
    `[${sourceId}] wrote ${books.size} books, ${totalChapters} chapters, ${(
      totalBytes /
      1024 /
      1024
    ).toFixed(2)} MB → ${outDir}`,
  );
}

/**
 * Chapters where BibleHub legitimately serves an empty `<div class="chap">`
 * because the commentator did not write on that chapter (e.g. Barnes skipped
 * tabernacle-construction recapitulations, and the 1 Kings // 2 Chronicles
 * parallel). Verified by hand against biblehub.com — when adding to this list,
 * eyeball the upstream URL to confirm it's genuinely empty, not a parser miss.
 * Format: "<canonical> <chapter>".
 */
export const KNOWN_EMPTY_UPSTREAM: Record<string, string[]> = {
  "jamieson-fausset-brown": [],
  "barnes-notes": [
    "exodus 36",
    "exodus 37",
    "exodus 39",
    "2 chronicles 10",
  ],
  "pulpit-commentary": [],
  "adam-clarke": [],
  "john-gill": [
    "1 chronicles 11",
    "1 chronicles 14",
    "1 chronicles 17",
    "1 chronicles 18",
    "1 chronicles 19",
    "1 chronicles 20",
    "2 chronicles 3",
    "2 chronicles 4",
    "2 chronicles 5",
    "2 chronicles 6",
    "2 chronicles 9",
    "2 chronicles 10",
  ],
  "keil-delitzsch": [
    "1 chronicles 19",
    "1 chronicles 20",
  ],
  // These BibleHub pages contain Scripture and the Calvin attribution footer,
  // but no commentary body.
  "calvin-commentaries": [
    "leviticus 12",
    "jeremiah 52",
    "ezekiel 21",
    "ezekiel 22",
    "ezekiel 23",
    "ezekiel 24",
    "ezekiel 25",
    "ezekiel 26",
    "ezekiel 27",
    "ezekiel 28",
    "ezekiel 29",
    "ezekiel 30",
    "ezekiel 31",
    "ezekiel 32",
    "ezekiel 33",
    "ezekiel 34",
    "ezekiel 35",
    "ezekiel 36",
    "ezekiel 37",
    "ezekiel 38",
    "ezekiel 39",
    "ezekiel 40",
    "ezekiel 41",
    "ezekiel 42",
    "ezekiel 43",
    "ezekiel 44",
    "ezekiel 45",
    "ezekiel 46",
    "ezekiel 47",
    "ezekiel 48",
  ],
  // Spurgeon covers all 150 Psalms; no known upstream gaps.
  "spurgeon-treasury": [],
  "matthew-poole": [],
  // These Benson pages contain only the attribution footer and no separate
  // commentary body in the BibleHub edition.
  "joseph-benson": [
    "2 samuel 22",
    "isaiah 37",
    "isaiah 39",
  ],
  // SermonIndex has no Trapp body for these pages; Jude is absent from its
  // book index and the other two pages are upstream 404/attribution-only.
  "john-trapp": ["exodus 37", "isaiah 39", "jude 1"],
  // SermonIndex has no Scott body for Psalm 59; the page is an upstream 404.
  "thomas-scott": ["psalms 59"],
  // New Advent exposes Augustine's complete Psalter, one page per Psalm.
  "augustine-expositions": [],
  // CCEL exposes all six chapters of the selected Galatians edition.
  "luther-galatians": [],
  // These pages contain only BibleHub's "used by permission" footer and no
  // Ellicott commentary. Zephaniah and Zechariah are wholly absent.
  "ellicott-english-readers": [
    "genesis 39",
    "genesis 44",
    "numbers 2",
    "numbers 5",
    "numbers 7",
    "joshua 12",
    "joshua 17",
    "joshua 20",
    "2 samuel 9",
    "psalms 108",
    "psalms 117",
    "jeremiah 45",
    "ezekiel 15",
    "zephaniah 1",
    "zephaniah 2",
    "zephaniah 3",
    "zechariah 1",
    "zechariah 2",
    "zechariah 3",
    "zechariah 4",
    "zechariah 5",
    "zechariah 6",
    "zechariah 7",
    "zechariah 8",
    "zechariah 9",
    "zechariah 10",
    "zechariah 11",
    "zechariah 12",
    "zechariah 13",
    "zechariah 14",
    "1 john 3",
  ],
  // These parallel/repeated-song chapters contain only BibleHub's Wesley
  // attribution footer; Wesley supplied no separate note body on the page.
  "wesley-explanatory-notes": [
    "2 samuel 22",
    "2 samuel 24",
    "1 chronicles 14",
    "1 chronicles 18",
    "psalms 70",
    "psalms 100",
    "psalms 108",
    "psalms 116",
    "psalms 117",
    "psalms 128",
    "psalms 143",
    "isaiah 36",
    "isaiah 37",
    "isaiah 39",
  ],
};

/* -------------------------------------------------------------------------- */
/* CLI entry                                                                  */
/* -------------------------------------------------------------------------- */

async function main() {
  const sourceId = process.argv[2];
  if (!sourceId) {
    console.error(
       "Usage: ingest-commentary <jamieson-fausset-brown|barnes-notes|pulpit-commentary|adam-clarke|john-gill|keil-delitzsch|calvin-commentaries|spurgeon-treasury|matthew-poole|ellicott-english-readers|wesley-explanatory-notes|joseph-benson|john-trapp|thomas-scott|augustine-expositions|luther-galatians>",
    );
    process.exit(1);
  }
  switch (sourceId) {
    case "jamieson-fausset-brown":
      await ingestBibleHub("jamieson-fausset-brown", "jfb");
      break;
    case "barnes-notes":
      await ingestBibleHub("barnes-notes", "barnes");
      break;
    case "pulpit-commentary":
      await ingestBibleHub("pulpit-commentary", "pulpit");
      break;
    case "adam-clarke":
      await ingestBibleHub("adam-clarke", "clarke");
      break;
    case "john-gill":
      await ingestBibleHub("john-gill", "gill");
      break;
    case "keil-delitzsch":
      // K&D covers OT only — pass otOnly=true so the work list and
      // completeness gate are restricted to the 39 OT books.
      await ingestBibleHub("keil-delitzsch", "kad", true);
      break;
    case "calvin-commentaries":
      // Calvin wrote formal commentaries on 48 books. The exact gate excludes
      // only the 30 verified upstream omissions in the gap inventory.
      await ingestBibleHub(
        "calvin-commentaries",
        "calvin",
        false,
        false,
        true,
        true,
      );
      break;
    case "spurgeon-treasury":
      // Spurgeon's Treasury covers Psalms only — psalmsOnly=true restricts
      // both the work list and the completeness gate to 150 chapters.
      await ingestBibleHub("spurgeon-treasury", "tod", false, true);
      break;
    case "matthew-poole":
      await ingestBibleHub("matthew-poole", "poole");
      break;
    case "joseph-benson":
      await ingestBibleHub("joseph-benson", "benson");
      break;
    case "ellicott-english-readers":
      await ingestBibleHub("ellicott-english-readers", "ellicott");
      break;
    case "wesley-explanatory-notes":
      await ingestBibleHub(
        "wesley-explanatory-notes",
        "wes",
        false,
        false,
        false,
        undefined,
        undefined,
        100,
      );
      break;
    case "john-trapp":
      await ingestSermonIndex("john-trapp", "trapp", BOOKS);
      break;
    case "thomas-scott":
      await ingestSermonIndex("thomas-scott", "tscott", PSALMS_BOOKS);
      break;
    case "augustine-expositions":
      await ingestAugustineExpositions();
      break;
    case "luther-galatians":
      await ingestLutherGalatians();
      break;
    default:
      console.error(`Unknown source id: ${sourceId}`);
      process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
