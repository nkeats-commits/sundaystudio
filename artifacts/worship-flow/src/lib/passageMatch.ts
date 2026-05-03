/**
 * Client-side mirror of the server's passage-matching logic used by
 * `mergeScholarlyResources` / `previewSermonResources` (see
 * `artifacts/api-server/src/lib/scholarlySources.ts` for the canonical
 * implementation).
 *
 * Why duplicate it here? The Sermon Builder's "Drawing on N resources"
 * panel needs to update instantly as the pastor types, without paying a
 * round-trip on every keystroke or risking races between in-flight preview
 * requests. By computing the include set client-side using the same rules
 * the server applies, the panel always reflects what the eventual
 * generation will see — there is no drift, just two implementations of one
 * tightly-scoped contract (book canonicalization + chapter overlap).
 *
 * IF YOU CHANGE THE RULES IN scholarlyMerge / scholarlySources, UPDATE
 * BOTH FILES (and the unit tests in passageMatch.test.ts +
 * scholarlyMerge.test.ts that pin the behaviour).
 */

const BOOK_ALIASES: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  const add = (canonical: string, ...aliases: string[]) => {
    const key = canonical.toLowerCase();
    m[key] = key;
    for (const a of aliases) m[a.toLowerCase()] = key;
  };
  // Old Testament
  add('genesis', 'gen', 'ge', 'gn');
  add('exodus', 'exo', 'ex', 'exod');
  add('leviticus', 'lev', 'lv');
  add('numbers', 'num', 'nu', 'nm');
  add('deuteronomy', 'deut', 'dt', 'deu');
  add('joshua', 'josh', 'jos', 'jsh');
  add('judges', 'judg', 'jdg', 'jg');
  add('ruth', 'ru');
  add('1 samuel', '1sam', '1 sam', '1sa', 'i samuel', 'first samuel');
  add('2 samuel', '2sam', '2 sam', '2sa', 'ii samuel', 'second samuel');
  add('1 kings', '1kgs', '1 kgs', '1ki', 'i kings', 'first kings');
  add('2 kings', '2kgs', '2 kgs', '2ki', 'ii kings', 'second kings');
  add('1 chronicles', '1chr', '1 chr', '1ch', 'i chronicles');
  add('2 chronicles', '2chr', '2 chr', '2ch', 'ii chronicles');
  add('ezra', 'ezr');
  add('nehemiah', 'neh', 'ne');
  add('esther', 'esth', 'est');
  add('job', 'jb');
  add('psalms', 'ps', 'psa', 'psalm', 'pss');
  add('proverbs', 'prov', 'pr', 'prv');
  add('ecclesiastes', 'ecc', 'eccles', 'qoh');
  add('song of songs', 'song', 'sos', 'song of solomon', 'canticles', 'cant');
  add('isaiah', 'isa', 'is');
  add('jeremiah', 'jer', 'je', 'jr');
  add('lamentations', 'lam', 'la');
  add('ezekiel', 'ezek', 'eze', 'ezk');
  add('daniel', 'dan', 'da', 'dn');
  add('hosea', 'hos', 'ho');
  add('joel', 'jl');
  add('amos', 'am');
  add('obadiah', 'obad', 'ob');
  add('jonah', 'jon', 'jnh');
  add('micah', 'mic', 'mi');
  add('nahum', 'nah', 'na');
  add('habakkuk', 'hab', 'hb');
  add('zephaniah', 'zeph', 'zep', 'zp');
  add('haggai', 'hag', 'hg');
  add('zechariah', 'zech', 'zec', 'zc');
  add('malachi', 'mal', 'ml');
  // New Testament
  add('matthew', 'matt', 'mt');
  add('mark', 'mk', 'mrk');
  add('luke', 'lk', 'luk');
  add('john', 'jn', 'jhn');
  add('acts', 'ac', 'act');
  add('romans', 'rom', 'ro', 'rm');
  add('1 corinthians', '1cor', '1 cor', '1co', 'i corinthians', 'first corinthians');
  add('2 corinthians', '2cor', '2 cor', '2co', 'ii corinthians', 'second corinthians');
  add('galatians', 'gal', 'ga');
  add('ephesians', 'eph', 'ep');
  add('philippians', 'phil', 'php', 'pp');
  add('colossians', 'col', 'cl');
  add('1 thessalonians', '1thess', '1 thess', '1th', 'i thessalonians', 'first thessalonians');
  add('2 thessalonians', '2thess', '2 thess', '2th', 'ii thessalonians', 'second thessalonians');
  add('1 timothy', '1tim', '1 tim', '1ti', 'i timothy', 'first timothy');
  add('2 timothy', '2tim', '2 tim', '2ti', 'ii timothy', 'second timothy');
  add('titus', 'tit');
  add('philemon', 'phlm', 'phm');
  add('hebrews', 'heb', 'hb');
  add('james', 'jas', 'jm');
  add('1 peter', '1pet', '1 pet', '1pe', 'i peter', 'first peter');
  add('2 peter', '2pet', '2 pet', '2pe', 'ii peter', 'second peter');
  add('1 john', '1jn', '1 jn', '1jo', 'i john', 'first john');
  add('2 john', '2jn', '2 jn', '2jo', 'ii john', 'second john');
  add('3 john', '3jn', '3 jn', '3jo', 'iii john', 'third john');
  add('jude', 'jud');
  add('revelation', 'rev', 're', 'rv', 'apocalypse');
  return m;
})();

export interface BookChapter {
  book: string;
  chapter: number;
}

/**
 * Best-effort parse of a passage reference into one or more (book, chapter)
 * pairs. Mirrors the server's `parsePassageRef`. Returns [] for inputs we
 * can't recognise (so a free-text tag like "Christmas Eve" never accidentally
 * matches every sermon).
 */
export function parsePassageRef(raw: string | null | undefined): BookChapter[] {
  if (!raw) return [];
  const text = raw.trim();
  if (!text) return [];

  const out: BookChapter[] = [];
  const seen = new Set<string>();
  const segments = text.split(/[;,]+/).map((s) => s.trim()).filter(Boolean);

  let lastBook: string | null = null;
  let lastSegHadVerse = false;
  for (const seg of segments) {
    if (lastSegHadVerse && /^\d+\s*(?:-\s*\d+)?$/.test(seg)) continue;
    const bookMatch = seg.match(
      /^\s*(?:([1-3])\s*)?([A-Za-z][A-Za-z .]*?)(?:\s+(\d.*))?$/,
    );
    let book: string | null = null;
    let rest = '';
    if (bookMatch) {
      const numPrefix = bookMatch[1] ? `${bookMatch[1]} ` : '';
      const wordPart = bookMatch[2].trim();
      const candidate = `${numPrefix}${wordPart}`.trim().toLowerCase().replace(/\s+/g, ' ');
      const canonical = BOOK_ALIASES[candidate] ?? BOOK_ALIASES[wordPart.toLowerCase()];
      if (canonical) {
        book = canonical;
        rest = bookMatch[3] ?? '';
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
    const crossChapter = /^(\d+)\s*:\s*\d+\s*-\s*(\d+)\s*:/.exec(rest);
    let chapterPart: string;
    let secondChapter: number | null = null;
    if (crossChapter) {
      chapterPart = crossChapter[1];
      secondChapter = Number(crossChapter[2]);
    } else {
      chapterPart = rest.split(':')[0].trim();
    }

    const range = /^(\d+)\s*-\s*(\d+)$/.exec(chapterPart);
    const chapters: number[] = [];
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
    lastSegHadVerse = rest.includes(':');
  }
  return out;
}

/**
 * True iff a Library row's `relatedPassage` should auto-include the row for
 * a sermon whose passages parse to `sermonPairs`. Mirrors the server's
 * `libraryRowMatches` helper exactly:
 *
 *   - Empty/whitespace `relatedPassage` is "always relevant" (the pastor
 *     flagged it as not passage-bound).
 *   - Unparseable relatedPassage (free-text tag like "Christmas Eve") does
 *     NOT match — otherwise it would surface on every sermon.
 *   - Otherwise we require at least one (book, chapter) pair to overlap.
 */
export function libraryRowMatches(
  relatedPassage: string,
  sermonPairs: ReadonlyArray<BookChapter>,
): boolean {
  const trimmed = (relatedPassage ?? '').trim();
  if (!trimmed) return true;
  const rowPairs = parsePassageRef(trimmed);
  if (!rowPairs.length) return false;
  for (const a of rowPairs) {
    for (const b of sermonPairs) {
      if (a.book === b.book && a.chapter === b.chapter) return true;
    }
  }
  return false;
}

/**
 * Convenience: parse the sermon's primary + secondary passages into a
 * deduped flat list of (book, chapter) pairs. Empty input yields [].
 */
export function sermonPassagePairs(
  primary: string | null | undefined,
  secondary: ReadonlyArray<string> = [],
): BookChapter[] {
  const all = [primary, ...secondary].filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0,
  );
  const out: BookChapter[] = [];
  const seen = new Set<string>();
  for (const ref of all) {
    for (const pair of parsePassageRef(ref)) {
      const key = `${pair.book}|${pair.chapter}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pair);
    }
  }
  return out;
}
