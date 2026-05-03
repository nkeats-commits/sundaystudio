/**
 * Parses the CCEL plain-text dump of Matthew Henry's Concise Commentary
 * into our per-book JSON files. The dump is fetched from
 * `https://ccel.org/ccel/henry/mhcc/cache/mhcc.txt` (Public Domain).
 *
 * Run: `pnpm --filter @workspace/scripts run ingest-mhcc`
 *
 * Re-run is safe — it overwrites the per-book files in
 * `artifacts/api-server/data/commentaries/matthew-henry-concise/`.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const SRC = process.env.MHCC_SRC ?? "/tmp/mhcc.txt";
const OUT_DIR = join(ROOT, "artifacts", "api-server", "data", "commentaries", "matthew-henry-concise");

const BOOKS = [
  "Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth",
  "1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles",
  "Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Solomon",
  "Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah",
  "Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi",
  "Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians",
  "Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians",
  "1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter",
  "1 John","2 John","3 John","Jude","Revelation",
];

const BOOK_SET = new Set(BOOKS);

function slug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function trimLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

interface ChapterAccum {
  paragraphs: string[];
  current: string[];
}

function flushPara(c: ChapterAccum) {
  if (c.current.length === 0) return;
  const para = c.current.join(" ").replace(/\s+/g, " ").trim();
  if (para) c.paragraphs.push(para);
  c.current = [];
}

interface BookOut {
  book: string;
  chapters: Record<string, { title?: string; text: string }>;
}

function parse(src: string): Record<string, BookOut> {
  const lines = src.split(/\r?\n/);
  const books: Record<string, BookOut> = {};
  let currentBook: BookOut | null = null;
  let currentChapter: string | null = null;
  let chapterAcc: ChapterAccum = { paragraphs: [], current: [] };
  let inVerseBlock = false;

  const finalizeChapter = () => {
    if (currentBook && currentChapter !== null) {
      flushPara(chapterAcc);
      const text = chapterAcc.paragraphs.join("\n\n");
      if (text.length > 50) {
        currentBook.chapters[currentChapter] = { text };
      }
    }
    chapterAcc = { paragraphs: [], current: [] };
    inVerseBlock = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = trimLine(raw);

    // Skip section dividers
    if (/^_+$/.test(trimmed)) continue;

    // Bail out at the Indexes appendix
    if (trimmed === "Indexes" && /^\s{20,}Indexes\s*$/.test(raw)) {
      finalizeChapter();
      currentBook = null;
      currentChapter = null;
      break;
    }

    // Book heading: centered (≥20 leading spaces), exact book name, on its own line
    if (BOOK_SET.has(trimmed) && /^\s{20,}/.test(raw)) {
      finalizeChapter();
      currentBook = books[trimmed] ?? { book: trimmed, chapters: {} };
      books[trimmed] = currentBook;
      currentChapter = null;
      continue;
    }

    if (!currentBook) continue;

    // Chapter heading: "Chapter N" with no extra centered indent
    const chapMatch = /^Chapter\s+(\d+)\s*$/.exec(trimmed);
    if (chapMatch && !/^\s{20,}/.test(raw)) {
      finalizeChapter();
      currentChapter = chapMatch[1];
      continue;
    }

    if (currentChapter === null) continue;

    // "Verses 1-7" / "Verses 1, 2" / "Verses 1—8" — start of a prose block (Pentateuch/NT format)
    if (/^Verses?\b/i.test(trimmed) && trimmed.length < 80) {
      flushPara(chapterAcc);
      inVerseBlock = true;
      continue;
    }

    // Prophets/Psalms format: prose blocks start with a scripture ref like
    // "Is. 1:1-9 Isaiah signifies..." or "Jer. 5:1-6 ..." inline with content.
    // Treat the whole line as content and start the block.
    const refMatch = /^([1-3]?\s?[A-Z][a-z]{1,4}\.?)\s+\d+:\d+/.exec(trimmed);
    if (refMatch) {
      flushPara(chapterAcc);
      inVerseBlock = true;
      chapterAcc.current.push(trimmed);
      continue;
    }

    // "Chapter Outline" — skip; outline lines follow until the first Verses block
    if (/^Chapter Outline$/i.test(trimmed)) {
      inVerseBlock = false;
      continue;
    }

    if (!inVerseBlock) continue;

    // Blank line = paragraph break inside the prose stream
    if (trimmed === "") {
      flushPara(chapterAcc);
      continue;
    }

    chapterAcc.current.push(trimmed);
  }

  finalizeChapter();
  return books;
}

function main() {
  if (!existsSync(SRC)) {
    console.error(`Missing source dump at ${SRC}. Fetch it first:`);
    console.error(`  curl -sS -o ${SRC} https://ccel.org/ccel/henry/mhcc/cache/mhcc.txt`);
    process.exit(1);
  }
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const src = readFileSync(SRC, "utf8");
  const books = parse(src);

  // Wipe pre-existing per-book .json files (keep MANIFEST.json) to avoid stale shards.
  for (const f of readdirSync(OUT_DIR)) {
    if (f.endsWith(".json") && f !== "MANIFEST.json") {
      unlinkSync(join(OUT_DIR, f));
    }
  }

  let totalChapters = 0;
  let totalBytes = 0;
  const wrote: string[] = [];
  for (const book of BOOKS) {
    const b = books[book];
    if (!b || Object.keys(b.chapters).length === 0) {
      console.warn(`  - ${book}: 0 chapters parsed (skipped)`);
      continue;
    }
    const out = {
      book,
      chapters: Object.fromEntries(
        Object.entries(b.chapters).map(([num, ch]) => [num, { text: ch.text }]),
      ),
    };
    const path = join(OUT_DIR, `${slug(book)}.json`);
    const json = JSON.stringify(out, null, 2);
    writeFileSync(path, json);
    totalChapters += Object.keys(b.chapters).length;
    totalBytes += json.length;
    wrote.push(`${book} (${Object.keys(b.chapters).length} ch, ${(json.length / 1024).toFixed(1)} kB)`);
  }
  console.log(wrote.join("\n"));
  console.log(`\nWrote ${wrote.length} books, ${totalChapters} chapters, ${(totalBytes / 1024 / 1024).toFixed(2)} MB total to ${OUT_DIR}`);

  // Fail-fast sanity floor so a future CCEL format drift can't silently ship a
  // degraded corpus. These thresholds are well below the current 66 / 1068
  // baseline but high enough that any meaningful regression trips the script.
  const MIN_BOOKS = 60;
  const MIN_CHAPTERS = 950;
  if (wrote.length < MIN_BOOKS || totalChapters < MIN_CHAPTERS) {
    console.error(
      `\nFATAL: parsed ${wrote.length} books / ${totalChapters} chapters, ` +
        `below floor ${MIN_BOOKS} / ${MIN_CHAPTERS}. ` +
        `CCEL plain-text format may have drifted — inspect the dump and update the parser.`,
    );
    process.exit(2);
  }
}

main();
