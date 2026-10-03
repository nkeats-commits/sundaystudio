import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import {
  CLEAN_TEXT_ARTIFACTS,
  COMMENTARY_VALIDATION_SPECS,
  expectedChapterTotal,
  validateCoverage,
  type CommentaryValidationSpec,
} from "./commentaryValidation.js";

const DATA_ROOT = join(
  import.meta.dirname,
  "..",
  "..",
  "artifacts",
  "api-server",
  "data",
  "commentaries",
);

const REQUIRED_MANIFEST_FIELDS = [
  "id",
  "title",
  "author",
  "year",
  "license",
  "sourceUrl",
  "description",
] as const;

interface Manifest {
  id?: unknown;
  title?: unknown;
  author?: unknown;
  year?: unknown;
  license?: unknown;
  sourceUrl?: unknown;
  description?: unknown;
  originalSourceUrl?: unknown;
  attribution?: unknown;
}

interface Chapter {
  text?: unknown;
  title?: unknown;
  sourceUrl?: unknown;
}

interface BookFile {
  book?: unknown;
  chapters?: Record<string, Chapter>;
  _sourceUrl?: unknown;
}

function fail(sourceId: string, location: string, message: string): never {
  throw new Error(`[${sourceId}] ${location}: ${message}`);
}

function parseJson<T>(sourceId: string, location: string, path: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    fail(
      sourceId,
      location,
      `invalid JSON (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

function canonicalBookName(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized === "song of solomon" ? "song of songs" : normalized;
}

function validateManifest(sourceId: string, manifest: Manifest, spec: CommentaryValidationSpec): void {
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (typeof manifest[field] !== "string" || !manifest[field].trim()) {
      fail(sourceId, "MANIFEST.json", `missing attribution metadata: ${field}`);
    }
  }
  if (manifest.id !== sourceId) {
    fail(sourceId, "MANIFEST.json", `id must be ${sourceId}`);
  }
  for (const field of ["sourceUrl", "originalSourceUrl"] as const) {
    const value = manifest[field];
    if (value !== undefined && (typeof value !== "string" || !/^https?:\/\//.test(value))) {
      fail(sourceId, "MANIFEST.json", `${field} must be an http(s) URL`);
    }
  }
  if (
    spec.requiresAttribution &&
    (typeof manifest.attribution !== "string" || !manifest.attribution.trim())
  ) {
    fail(sourceId, "MANIFEST.json", "missing attribution metadata: attribution");
  }
}

function validateCorpus(sourceId: string, spec: CommentaryValidationSpec): void {
  const sourceDir = join(DATA_ROOT, sourceId);
  const files = readdirSync(sourceDir);
  const bookFiles = files.filter((file) => file.endsWith(".json") && file !== "MANIFEST.json");
  const expectedFiles = new Set(spec.expectedBookSlugs.map((slug) => `${slug}.json`));

  for (const file of bookFiles) {
    if (!expectedFiles.has(file)) {
      fail(sourceId, file, "unexpected book file");
    }
  }
  for (const file of expectedFiles) {
    if (!bookFiles.includes(file)) {
      fail(sourceId, file, "missing expected book file");
    }
  }

  const chaptersByBook = new Map<string, number[]>();
  let totalChapters = 0;
  for (const file of bookFiles) {
    const path = join(sourceDir, file);
    const slug = file.slice(0, -".json".length);
    const parsed = parseJson<BookFile>(sourceId, file, path);
    const book = canonicalBookName(parsed.book);
    if (!book || !parsed.chapters || typeof parsed.chapters !== "object") {
      fail(sourceId, file, "must contain a book name and chapters object");
    }
    const expectedSlug = book.replace(/\s+/g, "-");
    const legacyMatthewHenrySlug =
      sourceId === "matthew-henry-concise" &&
      slug === "song-of-solomon" &&
      expectedSlug === "song-of-songs";
    if (expectedSlug !== slug && !legacyMatthewHenrySlug) {
      fail(sourceId, file, `book name does not match filename`);
    }

    if (spec.requiresBookSourceUrl) {
      if (
        typeof parsed._sourceUrl !== "string" ||
        !/^https?:\/\//.test(parsed._sourceUrl)
      ) {
        fail(sourceId, file, "missing attribution metadata: _sourceUrl");
      }
    }

    const bookChapters: number[] = [];
    for (const [chapterKey, chapter] of Object.entries(parsed.chapters)) {
      if (!/^[1-9]\d*$/.test(chapterKey)) {
        fail(sourceId, `${file} chapter ${chapterKey}`, "chapter key must be a positive integer");
      }
      const chapterNumber = Number(chapterKey);
      if (!chapter || typeof chapter.text !== "string" || !chapter.text.trim()) {
        fail(sourceId, `${file} chapter ${chapterKey}`, "missing excerpt text");
      }
      if (chapter.text.length < spec.minimumExcerptChars) {
        fail(
          sourceId,
          `${file} chapter ${chapterKey}`,
          `excerpt is only ${chapter.text.length} characters; expected at least ${spec.minimumExcerptChars}`,
        );
      }
      if (CLEAN_TEXT_ARTIFACTS.test(chapter.text)) {
        fail(sourceId, `${file} chapter ${chapterKey}`, "excerpt contains upstream/page artifacts");
      }
      if (chapter.title !== undefined && typeof chapter.title !== "string") {
        fail(sourceId, `${file} chapter ${chapterKey}`, "title must be text when present");
      }
      if (
        spec.requiresChapterSourceUrl &&
        (typeof chapter.sourceUrl !== "string" ||
          !/^https?:\/\//.test(chapter.sourceUrl))
      ) {
        fail(
          sourceId,
          `${file} chapter ${chapterKey}`,
          "missing valid passage source URL",
        );
      }
      bookChapters.push(chapterNumber);
      totalChapters++;
    }
    chaptersByBook.set(book, bookChapters);
  }

  const coverage = validateCoverage(spec, chaptersByBook);
  const expected = expectedChapterTotal(spec);
  if (totalChapters !== expected) {
    fail(
      sourceId,
      "coverage",
      `expected ${expected} chapters, found ${totalChapters}`,
    );
  }
  if (coverage.missing.length || coverage.unexpected.length) {
    const details = [
      ...coverage.missing.map((key) => `missing ${key}`),
      ...coverage.unexpected.map((key) => `unexpected ${key}`),
    ];
    fail(sourceId, "coverage", details.slice(0, 10).join("; "));
  }

  const representative = spec.representative;
  const representativeChapters = chaptersByBook.get(representative.book);
  if (!representativeChapters?.includes(representative.chapter)) {
    fail(
      sourceId,
      `${representative.book} chapter ${representative.chapter}`,
      "representative lookup hit is missing",
    );
  }
}

export function validateCommentaryCorpus(): void {
  if (!existsSync(DATA_ROOT) || !statSync(DATA_ROOT).isDirectory()) {
    throw new Error(`Commentary data directory not found: ${DATA_ROOT}`);
  }

  const expectedSpecs = new Map(
    COMMENTARY_VALIDATION_SPECS.map((spec) => [spec.sourceId, spec]),
  );
  const sourceDirs = readdirSync(DATA_ROOT).filter((entry) =>
    statSync(join(DATA_ROOT, entry)).isDirectory(),
  );
  for (const sourceId of sourceDirs) {
    if (!expectedSpecs.has(sourceId)) {
      fail(sourceId, "source directory", "not listed in commentary validation contract");
    }
  }
  for (const spec of COMMENTARY_VALIDATION_SPECS) {
    const sourceDir = join(DATA_ROOT, spec.sourceId);
    if (!existsSync(sourceDir)) fail(spec.sourceId, "source directory", "missing");
    const manifestPath = join(sourceDir, "MANIFEST.json");
    if (!existsSync(manifestPath)) fail(spec.sourceId, "MANIFEST.json", "missing");
    validateManifest(
      spec.sourceId,
      parseJson<Manifest>(spec.sourceId, "MANIFEST.json", manifestPath),
      spec,
    );
    validateCorpus(spec.sourceId, spec);
  }
}

try {
  validateCommentaryCorpus();
  console.log(
    `Commentary validation passed for ${COMMENTARY_VALIDATION_SPECS.length} sources.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}