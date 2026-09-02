/**
 * Unified ingest for bundled public-domain commentaries.
 *
 * Run:
 *   pnpm --filter @workspace/scripts run ingest-commentary -- <source-id>
 *
 * Supported source ids (all scrape biblehub.com per chapter):
 *   - jamieson-fausset-brown   → /commentaries/jfb/<book>/<ch>.htm
 *   - barnes-notes             → /commentaries/barnes/<book>/<ch>.htm
 *   - pulpit-commentary        → /commentaries/pulpit/<book>/<ch>.htm
 *   - adam-clarke              → /commentaries/clarke/<book>/<ch>.htm
 *   - john-gill                → /commentaries/gill/<book>/<ch>.htm
 *   - keil-delitzsch           → /commentaries/kad/<book>/<ch>.htm (OT only)
 *   - calvin-commentaries      → /commentaries/calvin/<book>/<ch>.htm (whole Bible except Revelation)
 *   - spurgeon-treasury        → /commentaries/tod/<book>/<ch>.htm (Psalms only)
 *
 * Why BibleHub and not CCEL? CCEL serves a per-work plain-text dump only for
 * a few commentaries (Henry, JFB) and the JFB dump's per-book headers vary
 * wildly across the canon ("THE FIRST BOOK OF MOSES, CALLED \n GENESIS",
 * "THE \n BOOK OF JOSHUA", "THE EPISTLE OF PAUL THE APOSTLE TO THE \n
 * ROMANS", and several books with no explicit header at all). BibleHub's
 * per-chapter pages have a consistent DOM shape across all three
 * commentaries, which gives one parser for the whole pipeline.
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
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
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

interface BookSpec {
  /** Display name for `book` field, e.g. "1 Corinthians". */
  name: string;
  /** Canonical lowercase form, also the `<book-slug>` (with dashes). */
  canonical: string;
  /** Slug used by BibleHub URLs (e.g. "1_corinthians", "songs"). */
  bhSlug: string;
  /** Total chapters in the book (KJV). */
  chapters: number;
}

const BOOKS: BookSpec[] = [
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

  // Strip BibleHub's appended attribution/footer boilerplate. The site
  // emits these inline with the last verse on some chapter pages, so they
  // bleed into our extraction and read as garbage.
  // Cut at the first occurrence of any boilerplate marker.
  const FOOTER_MARKERS = [
    /\bText Courtesy of [^.]*\./i,                 // Barnes ("Text Courtesy of Internet Sacred Texts Archive .")
    /\bOld and New Testaments by Robert Jamieson[\s\S]*$/i, // JFB title-page footer
    /\bBible Hub\s*$/i,                            // trailing "Bible Hub"
    /\bbiblehub\.com[\s\S]*$/i,
    /\bInternet Sacred Texts Archive[\s\S]*$/i,
  ];
  for (const re of FOOTER_MARKERS) {
    combined = combined.replace(re, "").trim();
  }

  // Final cut to TARGET_EXCERPT_CHARS, ending on a sentence boundary if
  // possible, otherwise on a word boundary — never mid-word.
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
    // Even when within the cap, the final text can end mid-word because
    // upstream `<div class="versenum">` boundaries often fall mid-sentence
    // of the previous verse's commentary. Trim back to the last sentence
    // stop or word boundary so excerpts always read cleanly.
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

interface BookOut {
  book: string;
  chapters: Record<string, { text: string }>;
  _sourceUrl: string;
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

/** NT books minus Revelation — for Calvin (who wrote no Revelation commentary). */
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
    | "spurgeon-treasury",
  bhPath: "jfb" | "barnes" | "pulpit" | "clarke" | "gill" | "kad" | "calvin" | "tod",
  /** When true, only OT books are fetched (for OT-only commentaries like K&D). */
  otOnly = false,
  /** When true, only Psalms is fetched (for Spurgeon's Treasury of David). */
  psalmsOnly = false,
  /** When true, Revelation is excluded (for Calvin's Commentaries). */
  skipRevelation = false,
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
): Promise<void> {
  let booksScope: BookSpec[];
  if (psalmsOnly) {
    booksScope = PSALMS_BOOKS;
  } else if (otOnly) {
    booksScope = OT_BOOKS;
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
        if (excerpt.length >= MIN_EXCERPT_CHARS) {
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
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  // Wipe existing per-book .json files (preserve MANIFEST.json).
  for (const f of readdirSync(outDir)) {
    if (f.endsWith(".json") && f !== "MANIFEST.json") {
      unlinkSync(join(outDir, f));
    }
  }

  let totalChapters = 0;
  let totalBytes = 0;
  const sortedCanonicals = Array.from(books.keys()).sort(
    (a, b) =>
      BOOKS.findIndex((b1) => b1.canonical === a) -
      BOOKS.findIndex((b2) => b2.canonical === b),
  );
  for (const canonical of sortedCanonicals) {
    const out = books.get(canonical)!;
    const numChapters = Object.keys(out.chapters).length;
    if (numChapters === 0) continue;
    const path = join(outDir, `${bookSlug(canonical)}.json`);
    const json = JSON.stringify(out, null, 2);
    writeFileSync(path, json);
    totalChapters += numChapters;
    totalBytes += json.length;
  }
  console.log(
    `[${sourceId}] wrote ${books.size} books, ${totalChapters} chapters, ${(
      totalBytes /
      1024 /
      1024
    ).toFixed(2)} MB → ${outDir}`,
  );

  // Strict completeness gate. Required totals = scope (all of booksScope
  // minus known upstream omissions). If we land below the floor, BibleHub's
  // DOM has likely drifted or we're rate-limited.
  const scopeChapters = booksScope.reduce((s, b) => s + b.chapters, 0);
  const expectedChapters =
    minChaptersOverride ??
    scopeChapters - KNOWN_EMPTY_UPSTREAM[sourceId].length;
  const expectedBooks = minBooksOverride ?? booksScope.length;

  if (books.size < expectedBooks) {
    throw new Error(
      `[${sourceId}] FATAL: only ${books.size}/${expectedBooks} books — likely an upstream format change.`,
    );
  }
  if (totalChapters < expectedChapters) {
    const got = new Set<string>();
    for (const c of sortedCanonicals) {
      const b = books.get(c)!;
      for (const ch of Object.keys(b.chapters)) got.add(`${c} ${ch}`);
    }
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
}

/**
 * Chapters where BibleHub legitimately serves an empty `<div class="chap">`
 * because the commentator did not write on that chapter (e.g. Barnes skipped
 * tabernacle-construction recapitulations, and the 1 Kings // 2 Chronicles
 * parallel). Verified by hand against biblehub.com — when adding to this list,
 * eyeball the upstream URL to confirm it's genuinely empty, not a parser miss.
 * Format: "<canonical> <chapter>".
 */
const KNOWN_EMPTY_UPSTREAM: Record<string, string[]> = {
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
  // Calvin did not write on Revelation (scope excludes it via skipRevelation).
  // A handful of chapters in lesser-covered OT books may be empty upstream;
  // verified by spot-checking BibleHub — add to this list if the gate fires.
  "calvin-commentaries": [],
  // Spurgeon covers all 150 Psalms; no known upstream gaps.
  "spurgeon-treasury": [],
};

/* -------------------------------------------------------------------------- */
/* CLI entry                                                                  */
/* -------------------------------------------------------------------------- */

async function main() {
  const sourceId = process.argv[2];
  if (!sourceId) {
    console.error(
      "Usage: ingest-commentary <jamieson-fausset-brown|barnes-notes|pulpit-commentary|adam-clarke|john-gill|keil-delitzsch|calvin-commentaries|spurgeon-treasury>",
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
      // Calvin wrote formal commentaries on 48 of the 65 non-Revelation books.
      // skipRevelation=true restricts the fetch scope; minBooksOverride=45 and
      // minChaptersOverride=750 set a gate well below the known actual totals
      // (48 books, 817 chapters) so the gate catches regressions without
      // failing on Calvin's intentionally incomplete canon.
      await ingestBibleHub(
        "calvin-commentaries",
        "calvin",
        false,
        false,
        true,
        45,
        750,
      );
      break;
    case "spurgeon-treasury":
      // Spurgeon's Treasury covers Psalms only — psalmsOnly=true restricts
      // both the work list and the completeness gate to 150 chapters.
      await ingestBibleHub("spurgeon-treasury", "tod", false, true);
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
