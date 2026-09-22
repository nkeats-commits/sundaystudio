/**
 * Server-only public-domain Bible reference catalog.
 *
 * Reference data is deliberately separate from chapter commentaries:
 * translations are keyed by verse, cross references by source passage, and
 * lexicons by stable lexical keys. Only bounded lookup results leave the API.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parsePassageRef,
  parsePassageVerses,
  type PassageVerseRef,
  type ScholarlySourceKind,
  type ScholarlySourceManifest,
} from "./scholarlySources";
import { logger } from "./logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_ROOT = (() => {
  const candidates = [
    resolve(__dirname, "..", "..", "data", "references"),
    resolve(__dirname, "..", "data", "references"),
    resolve(process.cwd(), "data", "references"),
    resolve(process.cwd(), "artifacts", "api-server", "data", "references"),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
})();

export interface ReferenceManifest extends ScholarlySourceManifest {
  kind: Exclude<ScholarlySourceKind, "commentary">;
  alignment?: {
    dataFile: string;
    sourceTitle: string;
    sourceUrl: string;
    sourceRevision: string;
    license: string;
    attribution: string;
    integrity: { file: string; sha256: string; rowCount: number };
    gapAllowlist: { count: number; sha256: string };
  };
}

export interface TranslationHit {
  sourceId: string;
  sourceTitle: string;
  sourceAuthor: string;
  sourceUrl: string;
  attribution: string;
  reference: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
  wordAlignmentAvailable: boolean;
}

export interface CrossReferenceHit {
  sourceId: string;
  sourceTitle: string;
  sourceAuthor: string;
  sourceUrl: string;
  attribution: string;
  sourceReference: string;
  targets: string[];
  note?: string;
}

export interface LexicalHit {
  sourceId: string;
  sourceTitle: string;
  sourceAuthor: string;
  sourceUrl: string;
  attribution: string;
  key: string;
  term: string;
  strongsNumber?: string;
  originalWord: string;
  transliteration: string;
  language: "Greek" | "Hebrew" | "English";
  definition: string;
  references: string[];
}

export interface SelectedWordRequest {
  translationSourceId: string;
  reference: string;
  tokenIndex: number;
  tokenText: string;
  passageContext?: string;
}

export interface SelectedWordCandidate extends LexicalHit {
  selectedVerse: string;
  alsoFoundIn: string[];
}

export interface SelectedWordStudy {
  translationSourceId: string;
  reference: string;
  tokenIndex: number;
  tokenText: string;
  status: "verified" | "unavailable";
  message?: string;
  candidates: SelectedWordCandidate[];
}

export const MAX_LEXICAL_REFERENCES = 24;
export const MAX_LEXICAL_REFERENCE_CHARS = 512;
export const MAX_SELECTED_WORD_CANDIDATES = 8;
export const MAX_SELECTED_WORD_OCCURRENCES = 12;

export interface ReferenceBundle {
  translations: TranslationHit[];
  crossReferences: CrossReferenceHit[];
  lexicalEntries: LexicalHit[];
  selectedWordStudy?: SelectedWordStudy;
}

export type ReferenceSourceKind = ReferenceManifest["kind"];

export class ReferenceSourceError extends Error {
  readonly source: ReferenceSourceKind;

  constructor(source: ReferenceSourceKind, cause: unknown) {
    super(`Reference source lookup failed for ${source}`, { cause });
    this.name = "ReferenceSourceError";
    this.source = source;
  }
}

export function describeReferenceLookupFailure(error: unknown): {
  error: string;
  source?: ReferenceSourceKind;
} {
  if (error instanceof ReferenceSourceError) {
    const label =
      error.source === "translation"
        ? "Bible translation"
        : error.source === "cross-reference"
          ? "Cross-reference"
          : "Lexicon";
    return {
      error: `${label} lookup failed. Please try again.`,
      source: error.source,
    };
  }
  return { error: "Could not preview references." };
}

interface TranslationRow {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

interface TokenAlignmentRow {
  book: string;
  chapter: number;
  verse: number;
  tokenIndex: number;
  tokenText: string;
  strongs: string[];
}

interface CrossReferenceRow {
  sourceReference: string;
  targets: string[];
  note?: string;
}

interface LexicalRow {
  key: string;
  term: string;
  strongsNumber?: string;
  originalWord: string;
  transliteration: string;
  language: "Greek" | "Hebrew" | "English";
  definition: string;
  references?: string[];
  indexedReferences?: string[];
}

interface LoadedReference {
  manifest: ReferenceManifest;
  translations: Map<string, TranslationRow>;
  crossReferences: Map<string, CrossReferenceRow[]>;
  lexicon: Map<string, LexicalRow>;
  alignments: Map<string, TokenAlignmentRow[]>;
}

const CANONICAL_BOOK_ORDER = [
  "genesis", "exodus", "leviticus", "numbers", "deuteronomy", "joshua",
  "judges", "ruth", "1 samuel", "2 samuel", "1 kings", "2 kings",
  "1 chronicles", "2 chronicles", "ezra", "nehemiah", "esther", "job",
  "psalms", "proverbs", "ecclesiastes", "song of songs", "isaiah",
  "jeremiah", "lamentations", "ezekiel", "daniel", "hosea", "joel",
  "amos", "obadiah", "jonah", "micah", "nahum", "habakkuk", "zephaniah",
  "haggai", "zechariah", "malachi", "matthew", "mark", "luke", "john",
  "acts", "romans", "1 corinthians", "2 corinthians", "galatians",
  "ephesians", "philippians", "colossians", "1 thessalonians",
  "2 thessalonians", "1 timothy", "2 timothy", "titus", "philemon",
  "hebrews", "james", "1 peter", "2 peter", "1 john", "2 john", "3 john",
  "jude", "revelation",
] as const;
const CANONICAL_BOOK_ORDER_MAP = new Map<string, number>(
  CANONICAL_BOOK_ORDER.map((book, index) => [book, index]),
);

function normalizedLexicalReferenceValues(
  references: readonly string[],
): Array<{ book: string; chapter: number; verse: number }> {
  const normalized = new Map<string, { book: string; chapter: number; verse: number }>();
  for (const reference of references) {
    const parsed = parsePassageVerses(reference);
    for (const hit of parsed) {
      const key = `${hit.book}|${hit.chapter}|${hit.verse}`;
      normalized.set(key, hit);
    }
  }
  return Array.from(normalized.values()).sort((a, b) =>
    (CANONICAL_BOOK_ORDER_MAP.get(a.book) ?? 999) - (CANONICAL_BOOK_ORDER_MAP.get(b.book) ?? 999) ||
    a.chapter - b.chapter ||
    a.verse - b.verse,
  );
}

function formatLexicalReference(reference: { book: string; chapter: number; verse: number }): string {
  const title = reference.book.replace(/\b\w/g, (character) => character.toUpperCase());
  return `${title} ${reference.chapter}:${reference.verse}`;
}

function normalizeLexicalReferences(references: readonly string[]): string[] {
  const ordered = normalizedLexicalReferenceValues(references);
  const result: string[] = [];
  let chars = 0;
  for (const reference of ordered) {
    const formatted = formatLexicalReference(reference);
    const nextChars = chars + (result.length ? 2 : 0) + formatted.length;
    if (result.length >= MAX_LEXICAL_REFERENCES || nextChars > MAX_LEXICAL_REFERENCE_CHARS) break;
    result.push(formatted);
    chars = nextChars;
  }
  return result;
}

function normalizeBook(book: string): string {
  const normalized = book.trim().toLowerCase().replace(/\s+/g, " ");
  return parsePassageRef(`${normalized} 1`)[0]?.book ?? normalized;
}

function verseKey(book: string, chapter: number, verse: number): string {
  return `${normalizeBook(book)}|${chapter}|${verse}`;
}

function passageKey(ref: string): string {
  const [first] = parsePassageRef(ref);
  if (!first) return "";
  const verse = /:\s*(\d+)/.exec(ref)?.[1] ?? "";
  return `${first.book}|${first.chapter}|${verse}`;
}

function sourceManifest(raw: unknown): ReferenceManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Partial<ReferenceManifest>;
  const required = ["id", "title", "author", "year", "license", "sourceUrl", "description", "attribution", "lookupType"];
  if (required.some((key) => typeof m[key as keyof ReferenceManifest] !== "string")) return null;
  if (!["translation", "cross-reference", "lexicon"].includes(m.kind ?? "")) return null;
  if (m.license !== "Public Domain") return null;
  const alignmentRaw = m.alignment;
  const alignment = alignmentRaw && typeof alignmentRaw === "object"
    ? alignmentRaw as ReferenceManifest["alignment"]
    : undefined;
  return {
    id: m.id!,
    title: m.title!,
    author: m.author!,
    year: m.year!,
    license: m.license!,
    sourceUrl: m.sourceUrl!,
    description: m.description!,
    attribution: m.attribution!,
    lookupType: m.lookupType!,
    kind: m.kind as ReferenceManifest["kind"],
    bookCount: 0,
    scope: "No indexed entries",
    coveredBooks: [],
    ...(alignment ? { alignment } : {}),
  };
}

function loadReference(id: string): LoadedReference | null {
  const dir = join(DATA_ROOT, id);
  try {
    const manifest = sourceManifest(JSON.parse(readFileSync(join(dir, "MANIFEST.json"), "utf8")));
    if (!manifest || manifest.id !== id) return null;
    const translations = new Map<string, TranslationRow>();
    const crossReferences = new Map<string, CrossReferenceRow[]>();
    const lexicon = new Map<string, LexicalRow>();
    const alignments = new Map<string, TokenAlignmentRow[]>();
    const file = (name: string) => JSON.parse(readFileSync(join(dir, name), "utf8")) as unknown;

    if (manifest.kind === "translation") {
      const rows = file("passages.json");
      if (!Array.isArray(rows)) return null;
      for (const row of rows as TranslationRow[]) {
        if (!row || typeof row.book !== "string" || !Number.isInteger(row.chapter) ||
            !Number.isInteger(row.verse) || row.chapter < 1 || row.verse < 1 ||
            typeof row.text !== "string" || !row.text.trim()) continue;
        const key = verseKey(row.book, row.chapter, row.verse);
        if (translations.has(key)) {
          logger.warn({ sourceId: id, key }, "referenceSources: duplicate translation key");
          return null;
        }
        translations.set(key, { ...row, book: normalizeBook(row.book) });
      }
      if (manifest.alignment) {
        const rows = file(manifest.alignment.dataFile);
        if (!Array.isArray(rows)) return null;
        for (const row of rows as TokenAlignmentRow[]) {
          if (
            !row ||
            typeof row.book !== "string" ||
            !Number.isInteger(row.chapter) ||
            !Number.isInteger(row.verse) ||
            !Number.isInteger(row.tokenIndex) ||
            row.tokenIndex < 0 ||
            typeof row.tokenText !== "string" ||
            !row.tokenText.trim() ||
            !Array.isArray(row.strongs) ||
            row.strongs.length === 0 ||
            row.strongs.some((value) => typeof value !== "string" || !/^[GH]\d{1,4}$/i.test(value))
          ) continue;
          const key = verseKey(row.book, row.chapter, row.verse);
          if (!translations.has(key)) continue;
          const existing = alignments.get(key) ?? [];
          existing.push({
            ...row,
            book: normalizeBook(row.book),
            tokenText: row.tokenText.trim(),
            strongs: Array.from(new Set(row.strongs.map((value) => value.toUpperCase()))),
          });
          alignments.set(key, existing);
        }
        for (const rows of alignments.values()) {
          rows.sort((a, b) => a.tokenIndex - b.tokenIndex);
        }
      }
    } else if (manifest.kind === "cross-reference") {
      const rows = file("cross-references.json");
      if (!Array.isArray(rows)) return null;
      for (const row of rows as CrossReferenceRow[]) {
        if (!row || typeof row.sourceReference !== "string" || !row.sourceReference.trim() ||
            !Array.isArray(row.targets) || row.targets.length === 0 ||
            row.targets.some((target) => typeof target !== "string" || !parsePassageRef(target).length)) continue;
        const key = passageKey(row.sourceReference);
        if (!key) {
          logger.warn({ sourceId: id, key }, "referenceSources: malformed cross-reference key");
          return null;
        }
        const existing = crossReferences.get(key) ?? [];
        existing.push({
          sourceReference: row.sourceReference.trim(),
          targets: row.targets.map((target) => target.trim()),
          note: row.note?.trim() || undefined,
        });
        crossReferences.set(key, existing);
      }
    } else {
      const rows = file("entries.json");
      if (!Array.isArray(rows)) return null;
      for (const row of rows as LexicalRow[]) {
        if (!row || typeof row.key !== "string" || !row.key.trim() ||
            typeof row.term !== "string" || typeof row.originalWord !== "string" ||
            typeof row.transliteration !== "string" ||
            !["Greek", "Hebrew", "English"].includes(row.language) ||
            typeof row.definition !== "string" || !row.definition.trim()) continue;
        const key = row.key.trim().toLowerCase();
        if (lexicon.has(key)) {
          logger.warn({ sourceId: id, key }, "referenceSources: duplicate lexical key");
          return null;
        }
        lexicon.set(key, {
          ...row,
          key,
          indexedReferences: normalizedLexicalReferenceValues(
            (row.references ?? []).filter((ref) => typeof ref === "string"),
          ).map(formatLexicalReference),
          references: normalizeLexicalReferences(
            (row.references ?? []).filter((ref) => typeof ref === "string"),
          ),
        });
      }
    }
    return { manifest, translations, crossReferences, lexicon, alignments };
  } catch (err) {
    logger.warn({ err, sourceId: id }, "referenceSources: failed to load source");
    return null;
  }
}

const REGISTRY: Map<string, LoadedReference> = (() => {
  const result = new Map<string, LoadedReference>();
  let dirs: string[] = [];
  try {
    dirs = readdirSync(DATA_ROOT).filter((name) => statSync(join(DATA_ROOT, name)).isDirectory());
  } catch (err) {
    logger.warn({ err, dataRoot: DATA_ROOT }, "referenceSources: data root unavailable");
    return result;
  }
  for (const id of dirs) {
    const loaded = loadReference(id);
    if (!loaded) continue;
    const books = new Set<string>();
    for (const row of loaded.translations.values()) books.add(row.book);
    for (const refs of loaded.crossReferences.values()) {
      for (const ref of refs) {
        const parsed = parsePassageRef(ref.sourceReference);
        if (parsed[0]) books.add(parsed[0].book);
      }
    }
    for (const ref of loaded.lexicon.values()) {
      for (const passage of ref.references ?? []) {
        const parsed = parsePassageRef(passage);
        if (parsed[0]) books.add(parsed[0].book);
      }
    }
    loaded.manifest.bookCount = books.size;
    loaded.manifest.coveredBooks = Array.from(books).map((book) => book.replace(/\b\w/g, (c) => c.toUpperCase()));
    loaded.manifest.scope = loaded.manifest.kind === "translation"
      ? `${loaded.translations.size} indexed verses`
      : loaded.manifest.kind === "cross-reference"
        ? `${loaded.crossReferences.size} source passages`
        : `${loaded.lexicon.size} lexical entries`;
    result.set(id, loaded);
  }
  return result;
})();

export function listRegisteredReferenceSources(): ReferenceManifest[] {
  return Array.from(REGISTRY.values())
    .map(({ manifest }) => ({ ...manifest, coveredBooks: [...manifest.coveredBooks] }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function isRegisteredReferenceSource(id: string): boolean {
  return REGISTRY.has(id);
}

export function getReferenceKind(id: string): ReferenceManifest["kind"] | null {
  return REGISTRY.get(id)?.manifest.kind ?? null;
}

const overlaps = (a: PassageVerseRef, b: PassageVerseRef) =>
  a.book === b.book && a.chapter === b.chapter && a.verse === b.verse;

function lexicalReferencesOverlap(
  references: readonly string[],
  requestedVerses: readonly PassageVerseRef[],
  requestedWholeChapters: readonly { book: string; chapter: number }[],
): boolean {
  const indexedVerses = references.flatMap(parsePassageVerses);
  return indexedVerses.some((indexed) =>
    requestedVerses.some((requested) => overlaps(indexed, requested)) ||
    requestedWholeChapters.some(
      (requested) => indexed.book === requested.book && indexed.chapter === requested.chapter,
    ),
  );
}

export function lookupReferenceBundle(
  enabledSourceIds: readonly string[],
  passageRefs: readonly string[],
  terms: readonly string[] = [],
  totalBudgetChars = 1800,
  selectedWord?: SelectedWordRequest,
): ReferenceBundle {
  const requestedPassages = passageRefs
    .filter((reference) => reference.trim())
    .map((reference) => ({
      verses: parsePassageVerses(reference),
      chapters: parsePassageRef(reference),
    }));
  const requestedVerses = requestedPassages.flatMap(({ verses }) => verses);
  const requestedChapters = requestedPassages.flatMap(({ chapters }) => chapters);
  const requestedWholeChapters = requestedPassages.flatMap(({ verses, chapters }) =>
    chapters.filter(
      (chapter) => !verses.some(
        (verse) => verse.book === chapter.book && verse.chapter === chapter.chapter,
      ),
    ),
  );
  const hasPassageConstraint = passageRefs.some((reference) => reference.trim());
  const normalizedTerms = new Set(terms.map((term) => term.trim().toLowerCase()).filter(Boolean));
  const bundle: ReferenceBundle = { translations: [], crossReferences: [], lexicalEntries: [] };
  let remaining = Math.max(0, Math.floor(totalBudgetChars));
  const sourceIds = Array.from(new Set(enabledSourceIds))
    .filter((sourceId) => REGISTRY.has(sourceId))
    .sort((a, b) => {
      const priority = (id: string) => {
        const kind = REGISTRY.get(id)?.manifest.kind;
        return kind === "translation" ? 0 : kind === "lexicon" ? 1 : 2;
      };
      return priority(a) - priority(b);
    });
  const activeKinds = new Set(
    sourceIds.map((sourceId) => REGISTRY.get(sourceId)?.manifest.kind).filter(Boolean),
  );
  const kindRemaining = new Map<ReferenceManifest["kind"], number>(
    Array.from(
      activeKinds,
      (kind) => [kind as ReferenceManifest["kind"], Math.floor(remaining / activeKinds.size)],
    ),
  );
  const takeText = (value: string, kind: ReferenceManifest["kind"]) => {
    const kindBudget = kindRemaining.get(kind) ?? remaining;
    const text = value.slice(0, Math.min(remaining, kindBudget));
    remaining -= text.length;
    kindRemaining.set(kind, kindBudget - text.length);
    return text;
  };
  for (const sourceId of sourceIds) {
    const source = REGISTRY.get(sourceId);
    if (!source || remaining <= 0) continue;
    const { manifest } = source;
    try {
      if (manifest.kind === "translation") {
        const rows = requestedVerses.length
          ? requestedVerses.map((ref) => source.translations.get(verseKey(ref.book, ref.chapter, ref.verse))).filter(Boolean)
          : requestedChapters.flatMap((ref) =>
              Array.from(source.translations.values()).filter((row) => row.book === ref.book && row.chapter === ref.chapter),
            );
        const seen = new Set<string>();
        for (const row of rows as TranslationRow[]) {
          const key = verseKey(row.book, row.chapter, row.verse);
          if (seen.has(key)) continue;
          seen.add(key);
          const text = takeText(row.text, manifest.kind);
          if (!text) continue;
          bundle.translations.push({
            sourceId, sourceTitle: manifest.title, sourceAuthor: manifest.author,
            sourceUrl: manifest.sourceUrl, attribution: manifest.attribution,
            reference: `${row.book.replace(/\b\w/g, (c) => c.toUpperCase())} ${row.chapter}:${row.verse}`,
            book: row.book, chapter: row.chapter, verse: row.verse, text,
            wordAlignmentAvailable: source.alignments.has(key),
          });
          if (remaining <= 0) break;
        }
      } else if (manifest.kind === "cross-reference") {
        const seen = new Set<string>();
        for (const chapter of requestedChapters) {
          const chapterPrefix = `${chapter.book}|${chapter.chapter}|`;
          const rows = Array.from(source.crossReferences.entries())
            .filter(([key]) => key.startsWith(chapterPrefix))
            .flatMap(([, values]) => values);
          for (const row of rows) {
            const key = `${row.sourceReference}|${row.targets.join("\u0000")}|${row.note ?? ""}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const label = `${manifest.title} — ${row.sourceReference}: ${row.targets.join(", ")}`;
            const text = takeText(label, manifest.kind);
            if (!text) continue;
            bundle.crossReferences.push({
              sourceId, sourceTitle: manifest.title, sourceAuthor: manifest.author,
              sourceUrl: manifest.sourceUrl, attribution: manifest.attribution,
              sourceReference: row.sourceReference, targets: row.targets, note: row.note,
            });
            if (remaining <= 0) break;
          }
          if (remaining <= 0) break;
        }
      } else {
        const matches: Array<{ key: string; row: LexicalRow; score: number }> = [];
        for (const [key, row] of source.lexicon) {
          if (
            hasPassageConstraint &&
            !lexicalReferencesOverlap(
              row.indexedReferences ?? row.references ?? [],
              requestedVerses,
              requestedWholeChapters,
            )
          ) {
            continue;
          }
          let score = normalizedTerms.size === 0 && hasPassageConstraint
            ? 3
            : Number.POSITIVE_INFINITY;
          for (const term of normalizedTerms) {
            const identifiers = [key, row.strongsNumber ?? ""].map((field) => field.toLowerCase());
            const identityFields = [row.term, row.originalWord, row.transliteration]
              .map((field) => field.toLowerCase());
            const definition = row.definition.toLowerCase();
            if (identifiers.some((field) => field === term)) score = Math.min(score, 0);
            else if (identityFields.some((field) => field.includes(term))) score = Math.min(score, 1);
            else if (definition.includes(term)) score = Math.min(score, 2);
          }
          if (!Number.isFinite(score)) continue;
          matches.push({ key, row, score });
        }
        matches.sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));
        for (const { key, row } of matches) {
          const text = takeText(`${row.term}: ${row.definition}`, manifest.kind);
          if (!text) continue;
          bundle.lexicalEntries.push({
            sourceId, sourceTitle: manifest.title, sourceAuthor: manifest.author,
            sourceUrl: manifest.sourceUrl, attribution: manifest.attribution,
            key, term: row.term, strongsNumber: row.strongsNumber,
            originalWord: row.originalWord, transliteration: row.transliteration,
            language: row.language,
            definition: row.definition,
            references: normalizeLexicalReferences(row.references ?? []),
          });
          if (remaining <= 0) break;
        }
      }
    } catch (error) {
      throw new ReferenceSourceError(manifest.kind, error);
    }
  }
  if (selectedWord) {
    bundle.selectedWordStudy = lookupSelectedWord(
      sourceIds,
      selectedWord,
    );
  }
  return bundle;
}

function lookupSelectedWord(
  enabledSourceIds: readonly string[],
  request: SelectedWordRequest,
): SelectedWordStudy {
  const unavailable = (message: string): SelectedWordStudy => ({
    translationSourceId: request.translationSourceId,
    reference: request.reference,
    tokenIndex: request.tokenIndex,
    tokenText: request.tokenText,
    status: "unavailable",
    message,
    candidates: [],
  });
  const source = REGISTRY.get(request.translationSourceId);
  if (!source || source.manifest.kind !== "translation" || !enabledSourceIds.includes(request.translationSourceId)) {
    return unavailable("This translation source is not enabled for word study.");
  }
  const parsed = parsePassageVerses(request.reference);
  const reference = parsed[0];
  if (!reference || parsed.length !== 1) {
    return unavailable("Select a word from one displayed verse.");
  }
  const key = verseKey(reference.book, reference.chapter, reference.verse);
  const translation = source.translations.get(key);
  const alignment = source.alignments.get(key)?.find((row) => row.tokenIndex === request.tokenIndex);
  if (
    !translation ||
    !alignment ||
    alignment.tokenText.toLocaleLowerCase() !== request.tokenText.trim().toLocaleLowerCase()
  ) {
    return unavailable("Verified word alignment is not available for this displayed word.");
  }

  const candidates: SelectedWordCandidate[] = [];
  const normalizedKeys = new Set(alignment.strongs.map((value) => value.toLowerCase().replace(/^([gh])0+/, "$1")));
  for (const sourceId of enabledSourceIds) {
    const lexicalSource = REGISTRY.get(sourceId);
    if (!lexicalSource || lexicalSource.manifest.kind !== "lexicon") continue;
    for (const normalizedKey of normalizedKeys) {
      const row = lexicalSource.lexicon.get(normalizedKey);
      if (!row) continue;
      const selectedReference = `${reference.book.replace(/\b\w/g, (c) => c.toUpperCase())} ${reference.chapter}:${reference.verse}`;
      const alsoFoundIn = normalizeLexicalReferences(row.references ?? [])
        .filter((value) => value !== selectedReference)
        .slice(0, MAX_SELECTED_WORD_OCCURRENCES);
      candidates.push({
        sourceId,
        sourceTitle: lexicalSource.manifest.title,
        sourceAuthor: lexicalSource.manifest.author,
        sourceUrl: lexicalSource.manifest.sourceUrl,
        attribution: lexicalSource.manifest.attribution,
        key: row.key,
        term: row.term,
        strongsNumber: row.strongsNumber,
        originalWord: row.originalWord,
        transliteration: row.transliteration,
        language: row.language,
        definition: row.definition.slice(0, MAX_LEXICAL_REFERENCE_CHARS),
        references: normalizeLexicalReferences(row.references ?? []),
        selectedVerse: selectedReference,
        alsoFoundIn,
      });
      if (candidates.length >= MAX_SELECTED_WORD_CANDIDATES) break;
    }
    if (candidates.length >= MAX_SELECTED_WORD_CANDIDATES) break;
  }
  return {
    translationSourceId: request.translationSourceId,
    reference: `${reference.book.replace(/\b\w/g, (c) => c.toUpperCase())} ${reference.chapter}:${reference.verse}`,
    tokenIndex: request.tokenIndex,
    tokenText: alignment.tokenText,
    status: "verified",
    message: candidates.length
      ? undefined
      : "The token alignment is verified, but no enabled lexical source contains its original-language entry.",
    candidates,
  };
}

export const REFERENCE_BUNDLE_BUDGET_CHARS = 1800;