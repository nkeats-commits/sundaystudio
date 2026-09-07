import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  CANONICAL_BOOKS,
  REFERENCE_CORPUS_SPECS,
  canonicalBook,
  crossReferenceKey,
  gapAllowlistHash,
  getGapAllowlist,
  sha256,
  translationKey,
  type CrossReferenceRow,
  type LexicalRow,
  type ReferenceCorpusSpec,
  type TranslationRow,
} from "./referenceCorpus.js";

type ReferenceManifest = Record<string, unknown> & {
  id?: unknown;
  sourceRevision?: unknown;
  integrity?: {
    file?: unknown;
    sha256?: unknown;
    rowCount?: unknown;
  };
  gapAllowlist?: string[] | {
    count?: unknown;
    sha256?: unknown;
  };
  gapAllowlistSha256?: unknown;
  occurrenceSource?: {
    title?: unknown;
    sourceUrl?: unknown;
    sourceRevision?: unknown;
    license?: unknown;
    attribution?: unknown;
  };
};

const DEFAULT_DATA_ROOT = resolve(
  import.meta.dirname,
  "..",
  "..",
  "artifacts",
  "api-server",
  "data",
  "references",
);

function fail(sourceId: string, location: string, message: string): never {
  throw new Error(`[${sourceId}] ${location}: ${message}`);
}

function parseJson<T>(sourceId: string, location: string, path: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    fail(sourceId, location, `invalid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
}

function validateManifest(
  spec: ReferenceCorpusSpec,
  manifest: ReferenceManifest,
  rows: unknown[],
  dataContent: string,
  kjvRows: TranslationRow[],
): void {
  if (manifest.id !== spec.id) fail(spec.id, "MANIFEST.json", `id must be ${spec.id}`);
  if (manifest.sourceRevision !== spec.sourceRevision) {
    fail(spec.id, "MANIFEST.json", `source revision must be ${spec.sourceRevision}`);
  }
  if (!manifest.integrity || manifest.integrity.file !== spec.dataFile) {
    fail(spec.id, "MANIFEST.json", `integrity.file must be ${spec.dataFile}`);
  }
  if (manifest.integrity?.rowCount !== rows.length || rows.length !== spec.expectedCount) {
    fail(
      spec.id,
      "MANIFEST.json",
      `expected ${spec.expectedCount} rows, found ${rows.length}`,
    );
  }
  if (manifest.integrity?.sha256 !== sha256(dataContent)) {
    fail(spec.id, "MANIFEST.json", "content checksum does not match the generated data");
  }
  if (manifest.integrity?.sha256 !== spec.expectedSha256) {
    fail(spec.id, "MANIFEST.json", "content checksum is not the trusted checksum for this revision");
  }
  const gaps = getGapAllowlist(spec, rows as (TranslationRow | CrossReferenceRow | LexicalRow)[], kjvRows);
  if (Array.isArray(manifest.gapAllowlist)) {
    if (
      manifest.gapAllowlist.some((gap) => typeof gap !== "string") ||
      [...manifest.gapAllowlist].some((gap, index, all) => index > 0 && gap <= all[index - 1])
    ) {
      fail(spec.id, "MANIFEST.json", "gapAllowlist must be a sorted list of unique keys");
    }
    if (JSON.stringify(manifest.gapAllowlist) !== JSON.stringify(gaps)) {
      fail(spec.id, "MANIFEST.json", "gapAllowlist does not match the indexed corpus coverage");
    }
  } else if (
    !manifest.gapAllowlist ||
    typeof manifest.gapAllowlist !== "object" ||
    manifest.gapAllowlist.count !== gaps.length ||
    manifest.gapAllowlist.sha256 !== gapAllowlistHash(gaps)
  ) {
    fail(spec.id, "MANIFEST.json", "gapAllowlist does not match the indexed corpus coverage");
  }
  const manifestGapHash = Array.isArray(manifest.gapAllowlist)
    ? gapAllowlistHash(manifest.gapAllowlist)
    : manifest.gapAllowlist && typeof manifest.gapAllowlist === "object"
      ? manifest.gapAllowlist.sha256
      : undefined;
  if (manifest.gapAllowlistSha256 !== undefined && manifest.gapAllowlistSha256 !== manifestGapHash) {
    fail(spec.id, "MANIFEST.json", "gapAllowlist checksum does not match the manifest allowlist");
  }
  if (manifestGapHash !== spec.expectedGapAllowlistSha256) {
    fail(spec.id, "MANIFEST.json", "gapAllowlist checksum is not the trusted allowlist for this revision");
  }
  if (spec.occurrenceSource) {
    const source = manifest.occurrenceSource;
    if (
      !source ||
      source.title !== spec.occurrenceSource.title ||
      source.sourceUrl !== spec.occurrenceSource.sourceUrl ||
      source.sourceRevision !== spec.occurrenceSource.sourceRevision ||
      source.license !== spec.occurrenceSource.license ||
      source.attribution !== spec.occurrenceSource.attribution
    ) {
      fail(spec.id, "MANIFEST.json", "occurrence source metadata does not match the pinned source contract");
    }
  }
}

function isCanonicalPassageReference(value: string): boolean {
  const key = crossReferenceKey(value);
  if (!key) return false;
  const [book, chapter, verse] = key.split("|");
  return CANONICAL_BOOKS.some((candidate) => canonicalBook(candidate) === book) &&
    Number(chapter) >= 1 &&
    Number(verse) >= 1;
}

const CANONICAL_BOOK_ORDER = new Map(
  CANONICAL_BOOKS.map((book, index) => [canonicalBook(book), index]),
);

function referenceSortKey(value: string): string {
  const key = crossReferenceKey(value);
  if (!key) return "";
  const [book, chapter, verse] = key.split("|");
  return `${String(CANONICAL_BOOK_ORDER.get(book) ?? 999).padStart(3, "0")}|${chapter.padStart(4, "0")}|${verse.padStart(4, "0")}`;
}

function validateTranslationRows(sourceId: string, rows: unknown[]): TranslationRow[] {
  const keys = new Set<string>();
  const valid: TranslationRow[] = [];
  for (const [index, value] of rows.entries()) {
    const row = value as Partial<TranslationRow> | null;
    const book = row?.book;
    const chapter = row?.chapter;
    const verse = row?.verse;
    const text = row?.text;
    if (
      typeof book !== "string" ||
      !CANONICAL_BOOKS.some((canonical) => canonicalBook(canonical) === canonicalBook(book)) ||
      typeof chapter !== "number" ||
      !Number.isInteger(chapter) ||
      chapter < 1 ||
      typeof verse !== "number" ||
      !Number.isInteger(verse) ||
      verse < 1 ||
      typeof text !== "string" ||
      !text.trim()
    ) {
      fail(sourceId, `row ${index}`, "malformed translation row");
    }
    const key = translationKey(row as TranslationRow);
    if (keys.has(key)) fail(sourceId, `row ${index}`, `duplicate key ${key}`);
    keys.add(key);
    valid.push(row as TranslationRow);
  }
  return valid;
}

function validateCrossReferenceRows(sourceId: string, rows: unknown[]): CrossReferenceRow[] {
  const keys = new Set<string>();
  const valid: CrossReferenceRow[] = [];
  for (const [index, value] of rows.entries()) {
    const row = value as Partial<CrossReferenceRow> | null;
    const sourceKey = typeof row?.sourceReference === "string"
      ? crossReferenceKey(row.sourceReference)
      : null;
    if (
      !row ||
      !sourceKey ||
      !isCanonicalPassageReference(row.sourceReference as string) ||
      !Array.isArray(row.targets) ||
      row.targets.length === 0 ||
      row.targets.some((target) =>
        typeof target !== "string" ||
        !isCanonicalPassageReference(target),
      )
    ) {
      fail(sourceId, `row ${index}`, "malformed cross-reference row");
    }
    if (keys.has(sourceKey)) fail(sourceId, `row ${index}`, `duplicate key ${sourceKey}`);
    keys.add(sourceKey);
    valid.push(row as CrossReferenceRow);
  }
  return valid;
}

function validateLexicalRows(sourceId: string, rows: unknown[]): LexicalRow[] {
  const keys = new Set<string>();
  const valid: LexicalRow[] = [];
  for (const [index, value] of rows.entries()) {
    const row = value as Partial<LexicalRow> | null;
    if (
      !row ||
      typeof row.key !== "string" ||
      !row.key.trim() ||
      typeof row.term !== "string" ||
      typeof row.strongsNumber !== "string" ||
      typeof row.originalWord !== "string" ||
      typeof row.transliteration !== "string" ||
      !["Greek", "Hebrew", "English"].includes(row.language ?? "") ||
      typeof row.definition !== "string" ||
      !row.definition.trim() ||
      !Array.isArray(row.references) ||
      row.references.some((reference) =>
        typeof reference !== "string" || !isCanonicalPassageReference(reference),
      )
    ) {
      fail(sourceId, `row ${index}`, "malformed lexical row");
    }
    const key = row.key.trim().toLowerCase();
    if (keys.has(key)) fail(sourceId, `row ${index}`, `duplicate key ${key}`);
    const references = row.references as string[];
    const uniqueReferences = new Set(references);
    if (uniqueReferences.size !== references.length) {
      fail(sourceId, `row ${index}`, "references must be unique");
    }
    if (references.some((reference, referenceIndex) =>
      referenceIndex > 0 &&
      referenceSortKey(reference) < referenceSortKey(references[referenceIndex - 1]),
    )) {
      fail(sourceId, `row ${index}`, "references must be sorted");
    }
    keys.add(key);
    valid.push(row as LexicalRow);
  }
  return valid;
}

export function validateReferenceCorpus(dataRoot = DEFAULT_DATA_ROOT): void {
  if (!existsSync(dataRoot) || !statSync(dataRoot).isDirectory()) {
    throw new Error(`Reference data directory not found: ${dataRoot}`);
  }
  const specs = new Map(REFERENCE_CORPUS_SPECS.map((spec) => [spec.id, spec]));
  const sourceDirs = readdirSync(dataRoot).filter((entry) => statSync(join(dataRoot, entry)).isDirectory());
  for (const sourceId of sourceDirs) {
    if (!specs.has(sourceId)) fail(sourceId, "source directory", "not listed in reference validation contract");
  }

  let kjvRows: TranslationRow[] = [];
  for (const spec of REFERENCE_CORPUS_SPECS) {
    const sourceDir = join(dataRoot, spec.id);
    if (!existsSync(sourceDir)) fail(spec.id, "source directory", "missing");
    const manifestPath = join(sourceDir, "MANIFEST.json");
    const dataPath = join(sourceDir, spec.dataFile);
    if (!existsSync(manifestPath)) fail(spec.id, "MANIFEST.json", "missing");
    if (!existsSync(dataPath)) fail(spec.id, spec.dataFile, "missing");
    const dataContent = readFileSync(dataPath, "utf8");
    const rows = parseJson<unknown[]>(spec.id, spec.dataFile, dataPath);
    if (!Array.isArray(rows)) fail(spec.id, spec.dataFile, "must contain a JSON array");
    const manifest = parseJson<ReferenceManifest>(spec.id, "MANIFEST.json", manifestPath);
    const validatedRows = spec.kind === "translation"
      ? validateTranslationRows(spec.id, rows)
      : spec.kind === "cross-reference"
        ? validateCrossReferenceRows(spec.id, rows)
        : validateLexicalRows(spec.id, rows);
    if (spec.id === "kjv-1769") kjvRows = validatedRows as TranslationRow[];
    validateManifest(spec, manifest, rows, dataContent, kjvRows);
  }
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename);
if (isMainModule) {
  const dataRootArg = process.argv.find((argument) => argument.startsWith("--data-root="));
  try {
    validateReferenceCorpus(dataRootArg?.slice("--data-root=".length) || DEFAULT_DATA_ROOT);
    console.log(`Reference validation passed for ${REFERENCE_CORPUS_SPECS.length} corpora.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}