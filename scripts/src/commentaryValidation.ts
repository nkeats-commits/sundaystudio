import {
  BOOKS,
  CALVIN_BOOK_SLUGS,
  diffExactCoverage,
  KNOWN_EMPTY_UPSTREAM,
  type BookSpec,
} from "./ingestCommentary.js";

export interface CommentaryValidationSpec {
  sourceId: string;
  expectedBookSlugs: readonly string[];
  expectedChapterCount: number;
  /**
   * Legacy corpora can have a checked-in chapter total without an upstream
   * inventory. Newer ingests must use diffExactCoverage and an explicit gap
   * allowlist instead.
   */
  exactCoverage: boolean;
  minimumExcerptChars: number;
  representative: {
    book: string;
    chapter: number;
  };
  requiresBookSourceUrl: boolean;
  requiresAttribution: boolean;
}

const bookSlug = (canonical: string) => canonical.replace(/\s+/g, "-");
const fullBible = BOOKS.map((book) => bookSlug(book.canonical));
const legacyMatthewHenryBooks = fullBible.map((slug) =>
  slug === "song-of-songs" ? "song-of-solomon" : slug,
);
const oldTestament = BOOKS.slice(0, 39).map((book) => bookSlug(book.canonical));
const psalmsOnly = ["psalms"];
const ellicottBooks = fullBible.filter(
  (slug) => !["zephaniah", "zechariah"].includes(slug),
);
const trappBooks = fullBible.filter((slug) => slug !== "jude");
const calvinBooks = CALVIN_BOOK_SLUGS;

const chapterTotal = (scope: readonly string[]) =>
  scope.reduce((total, slug) => {
    const book = BOOKS.find((candidate) => bookSlug(candidate.canonical) === slug);
    return total + (book?.chapters ?? 0);
  }, 0);

/**
 * This is the checked-in contract for every bundled corpus. Keep the
 * expected totals and verified gaps here beside the ingest gate so a refresh
 * cannot silently change what the runtime advertises.
 */
export const COMMENTARY_VALIDATION_SPECS: readonly CommentaryValidationSpec[] = [
  {
    sourceId: "matthew-henry-concise",
    expectedBookSlugs: legacyMatthewHenryBooks,
    expectedChapterCount: 1068,
    exactCoverage: false,
    minimumExcerptChars: 200,
    representative: { book: "genesis", chapter: 1 },
    requiresBookSourceUrl: false,
    requiresAttribution: false,
  },
  {
    sourceId: "jamieson-fausset-brown",
    expectedBookSlugs: fullBible,
    expectedChapterCount: 1189,
    exactCoverage: true,
    minimumExcerptChars: 200,
    representative: { book: "romans", chapter: 8 },
    requiresBookSourceUrl: true,
    requiresAttribution: false,
  },
  {
    sourceId: "barnes-notes",
    expectedBookSlugs: fullBible,
    expectedChapterCount: 1185,
    exactCoverage: true,
    minimumExcerptChars: 200,
    representative: { book: "romans", chapter: 8 },
    requiresBookSourceUrl: true,
    requiresAttribution: false,
  },
  {
    sourceId: "pulpit-commentary",
    expectedBookSlugs: fullBible,
    expectedChapterCount: 1189,
    exactCoverage: true,
    minimumExcerptChars: 200,
    representative: { book: "romans", chapter: 8 },
    requiresBookSourceUrl: true,
    requiresAttribution: false,
  },
  {
    sourceId: "adam-clarke",
    expectedBookSlugs: fullBible,
    expectedChapterCount: 1189,
    exactCoverage: true,
    minimumExcerptChars: 200,
    representative: { book: "romans", chapter: 8 },
    requiresBookSourceUrl: true,
    requiresAttribution: false,
  },
  {
    sourceId: "john-gill",
    expectedBookSlugs: fullBible,
    expectedChapterCount: 1177,
    exactCoverage: true,
    minimumExcerptChars: 200,
    representative: { book: "romans", chapter: 8 },
    requiresBookSourceUrl: true,
    requiresAttribution: false,
  },
  {
    sourceId: "keil-delitzsch",
    expectedBookSlugs: oldTestament,
    expectedChapterCount: 927,
    exactCoverage: true,
    minimumExcerptChars: 200,
    representative: { book: "genesis", chapter: 1 },
    requiresBookSourceUrl: true,
    requiresAttribution: false,
  },
  {
    sourceId: "calvin-commentaries",
    expectedBookSlugs: calvinBooks,
    expectedChapterCount: 817,
    exactCoverage: true,
    minimumExcerptChars: 200,
    representative: { book: "romans", chapter: 8 },
    requiresBookSourceUrl: true,
    requiresAttribution: false,
  },
  {
    sourceId: "spurgeon-treasury",
    expectedBookSlugs: psalmsOnly,
    expectedChapterCount: 150,
    exactCoverage: true,
    minimumExcerptChars: 200,
    representative: { book: "psalms", chapter: 23 },
    requiresBookSourceUrl: true,
    requiresAttribution: false,
  },
  {
    sourceId: "matthew-poole",
    expectedBookSlugs: fullBible,
    expectedChapterCount: 1189,
    exactCoverage: true,
    minimumExcerptChars: 200,
    representative: { book: "romans", chapter: 8 },
    requiresBookSourceUrl: true,
    requiresAttribution: true,
  },
  {
    sourceId: "ellicott-english-readers",
    expectedBookSlugs: ellicottBooks,
    expectedChapterCount: 1158,
    exactCoverage: true,
    minimumExcerptChars: 200,
    representative: { book: "romans", chapter: 8 },
    requiresBookSourceUrl: true,
    requiresAttribution: true,
  },
  {
    sourceId: "wesley-explanatory-notes",
    expectedBookSlugs: fullBible,
    expectedChapterCount: 1175,
    exactCoverage: true,
    minimumExcerptChars: 100,
    representative: { book: "romans", chapter: 8 },
    requiresBookSourceUrl: true,
    requiresAttribution: true,
  },
  {
    sourceId: "joseph-benson",
    expectedBookSlugs: fullBible,
    expectedChapterCount: 1186,
    exactCoverage: true,
    minimumExcerptChars: 200,
    representative: { book: "romans", chapter: 8 },
    requiresBookSourceUrl: true,
    requiresAttribution: true,
  },
  {
    sourceId: "john-trapp",
    expectedBookSlugs: trappBooks,
    expectedChapterCount: 1186,
    exactCoverage: true,
    minimumExcerptChars: 80,
    representative: { book: "romans", chapter: 8 },
    requiresBookSourceUrl: true,
    requiresAttribution: true,
  },
  {
    sourceId: "thomas-scott",
    expectedBookSlugs: psalmsOnly,
    expectedChapterCount: 149,
    exactCoverage: true,
    minimumExcerptChars: 80,
    representative: { book: "psalms", chapter: 23 },
    requiresBookSourceUrl: true,
    requiresAttribution: true,
  },
];

const exactScopeFor = (spec: CommentaryValidationSpec): BookSpec[] =>
  BOOKS.filter((book) =>
    spec.expectedBookSlugs.includes(bookSlug(book.canonical)),
  );

export interface CoverageValidationResult {
  totalChapters: number;
  missing: string[];
  unexpected: string[];
}

export function validateCoverage(
  spec: CommentaryValidationSpec,
  chaptersByBook: ReadonlyMap<string, readonly number[]>,
): CoverageValidationResult {
  const got = new Set<string>();
  for (const [book, chapters] of chaptersByBook) {
    for (const chapter of chapters) got.add(`${book} ${chapter}`);
  }

  const scope = exactScopeFor(spec);
  const knownEmpty = KNOWN_EMPTY_UPSTREAM[spec.sourceId] ?? [];
  const { missing, unexpected } = spec.exactCoverage
    ? diffExactCoverage(got, scope, knownEmpty)
    : { missing: [], unexpected: [] };

  return {
    totalChapters: got.size,
    missing,
    unexpected,
  };
}

export function expectedChapterTotal(
  spec: CommentaryValidationSpec,
): number {
  if (!spec.exactCoverage) return spec.expectedChapterCount;
  const scopeTotal = chapterTotal(spec.expectedBookSlugs);
  const gaps = (KNOWN_EMPTY_UPSTREAM[spec.sourceId] ?? []).filter((key) => {
    const bookSlug = key.replace(/\s+\d+$/, "").replace(/\s+/g, "-");
    return spec.expectedBookSlugs.includes(bookSlug);
  }).length;
  return scopeTotal - gaps;
}

export const CLEAN_TEXT_ARTIFACTS =
  /<[^>]+>|javascript:|related resources|no text from poole|used by permission|sermonindex\.net|Matthew Poole's Commentary|Ellicott's Commentary for English Readers|Thomas Scott's Explanatory Notes on the Bible/i;
