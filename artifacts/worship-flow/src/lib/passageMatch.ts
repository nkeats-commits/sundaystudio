/**
 * Lightweight client mirror of the server's `parsePassageRef`
 * (see `artifacts/api-server/src/lib/scholarlySources.ts`). Used by the
 * Sermon Builder to preview which Resource Library rows the server WILL
 * auto-include for the current sermon.
 *
 * Intentionally not perfect — the server is the source of truth. This
 * matcher just needs to be close enough that the "Drawing on N
 * resources" preview matches what the pastor will actually see.
 *
 * Match rule (mirrors server):
 *   - empty `relatedPassage`              → matches every sermon
 *   - non-empty but unparseable           → matches every sermon (the
 *                                           pastor probably wrote a
 *                                           seasonal tag like "Advent")
 *   - parseable                           → matches if any (book,
 *                                           chapter) overlaps the
 *                                           sermon's primary +
 *                                           secondary passages
 */

const BOOK_ALIASES: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  const add = (canonical: string, ...aliases: string[]) => {
    m[canonical] = canonical;
    for (const a of aliases) m[a] = canonical;
  };
  add("genesis", "gen", "ge", "gn");
  add("exodus", "exo", "ex", "exod");
  add("leviticus", "lev", "lv");
  add("numbers", "num", "nm", "nu");
  add("deuteronomy", "deut", "dt", "deu");
  add("joshua", "josh", "jos", "jsh");
  add("judges", "judg", "jdg", "jg");
  add("ruth", "rut", "ru");
  add("1 samuel", "1sa", "1 sam", "1sam", "i samuel", "first samuel");
  add("2 samuel", "2sa", "2 sam", "2sam", "ii samuel", "second samuel");
  add("1 kings", "1ki", "1 kgs", "1kgs", "i kings", "first kings");
  add("2 kings", "2ki", "2 kgs", "2kgs", "ii kings", "second kings");
  add("1 chronicles", "1ch", "1 chr", "1chr", "i chronicles", "first chronicles");
  add("2 chronicles", "2ch", "2 chr", "2chr", "ii chronicles", "second chronicles");
  add("ezra", "ezr");
  add("nehemiah", "neh", "ne");
  add("esther", "est", "esth");
  add("job", "jb");
  add("psalms", "ps", "psa", "psalm", "pss");
  add("proverbs", "pro", "prov", "prv");
  add("ecclesiastes", "eccl", "ecc", "qoh");
  add("song of songs", "song", "sos", "ss", "song of solomon", "canticles");
  add("isaiah", "isa", "is");
  add("jeremiah", "jer", "je");
  add("lamentations", "lam", "la");
  add("ezekiel", "eze", "ezek", "ezk");
  add("daniel", "dan", "dn");
  add("hosea", "hos", "ho");
  add("joel", "joe", "jl");
  add("amos", "amo", "am");
  add("obadiah", "oba", "obad", "ob");
  add("jonah", "jon", "jnh");
  add("micah", "mic", "mi");
  add("nahum", "nah", "na");
  add("habakkuk", "hab", "hb");
  add("zephaniah", "zep", "zeph", "zp");
  add("haggai", "hag", "hg");
  add("zechariah", "zec", "zech", "zc");
  add("malachi", "mal", "ml");
  add("matthew", "matt", "mt");
  add("mark", "mrk", "mk");
  add("luke", "lk");
  add("john", "jn", "jhn");
  add("acts", "act", "ac");
  add("romans", "rom", "ro", "rm");
  add("1 corinthians", "1co", "1 cor", "1cor", "i corinthians", "first corinthians");
  add("2 corinthians", "2co", "2 cor", "2cor", "ii corinthians", "second corinthians");
  add("galatians", "gal", "ga");
  add("ephesians", "eph", "ep");
  add("philippians", "phil", "php", "phl");
  add("colossians", "col", "cl");
  add("1 thessalonians", "1th", "1 thess", "1thess", "i thessalonians");
  add("2 thessalonians", "2th", "2 thess", "2thess", "ii thessalonians");
  add("1 timothy", "1ti", "1 tim", "1tim", "i timothy", "first timothy");
  add("2 timothy", "2ti", "2 tim", "2tim", "ii timothy", "second timothy");
  add("titus", "tit", "ti");
  add("philemon", "phm", "phlm");
  add("hebrews", "heb", "he");
  add("james", "jas", "jm");
  add("1 peter", "1pe", "1 pet", "1pet", "i peter", "first peter");
  add("2 peter", "2pe", "2 pet", "2pet", "ii peter", "second peter");
  add("1 john", "1jn", "1 jn", "1jo", "i john", "first john");
  add("2 john", "2jn", "2 jn", "2jo", "ii john", "second john");
  add("3 john", "3jn", "3 jn", "3jo", "iii john", "third john");
  add("jude", "jud");
  add("revelation", "rev", "re", "rv", "apocalypse");
  return m;
})();

export interface PassagePair {
  book: string;
  chapter: number;
}

export function parsePassageRef(raw: string | null | undefined): PassagePair[] {
  if (!raw) return [];
  const text = raw.trim();
  if (!text) return [];
  const out: PassagePair[] = [];
  const seen = new Set<string>();
  const segments = text.split(/[;,]+/).map((s) => s.trim()).filter(Boolean);
  let lastBook: string | null = null;
  let lastSegHadVerse = false;
  for (const seg of segments) {
    if (lastSegHadVerse && /^\d+\s*(?:-\s*\d+)?$/.test(seg)) continue;
    const bookMatch = seg.match(/^\s*(?:([1-3])\s*)?([A-Za-z][A-Za-z .]*?)(?:\s+(\d.*))?$/);
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
      if (!lastBook) continue;
      book = lastBook;
      rest = seg;
    }
    lastBook = book;
    rest = rest.trim();
    if (!rest) continue;
    const colonIdx = rest.indexOf(":");
    lastSegHadVerse = colonIdx >= 0;
    let chapterRange = rest;
    if (colonIdx >= 0) {
      // "8:28-9:3" → keep through the optional "-9" hop
      const dashIdx = rest.indexOf("-");
      if (dashIdx > colonIdx) {
        const tail = rest.slice(dashIdx + 1).trim();
        const tailColon = tail.indexOf(":");
        if (tailColon > 0) {
          chapterRange = `${rest.slice(0, colonIdx)}-${tail.slice(0, tailColon)}`;
        } else {
          chapterRange = rest.slice(0, colonIdx);
        }
      } else {
        chapterRange = rest.slice(0, colonIdx);
      }
    }
    const m = chapterRange.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) continue;
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : start;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) continue;
    for (let c = start; c <= end; c++) {
      const key = `${book}:${c}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ book, chapter: c });
    }
  }
  return out;
}

/**
 * Mirrors the server's library matcher. `relatedPassage` empty or
 * unparseable → always include (the pastor flagged it as broadly
 * relevant). Otherwise include only on (book, chapter) overlap.
 */
export function libraryRowMatchesSermon(
  relatedPassage: string,
  sermonPassages: ReadonlyArray<string>,
): boolean {
  const trimmed = relatedPassage.trim();
  if (!trimmed) return true;
  const rowPairs = parsePassageRef(trimmed);
  if (!rowPairs.length) return true;
  const sermonPairs = sermonPassages.flatMap((p) => parsePassageRef(p));
  if (!sermonPairs.length) return false;
  for (const a of rowPairs) {
    for (const b of sermonPairs) {
      if (a.book === b.book && a.chapter === b.chapter) return true;
    }
  }
  return false;
}
