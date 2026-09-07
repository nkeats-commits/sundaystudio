import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, sermonResourcesTable } from "@workspace/db";
import {
  CreateSermonResourceBody,
  UpdateSermonResourceBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireActiveAccess } from "../middlewares/requireActiveAccess";
import multer from "multer";
import { parse as parseHtml } from "node-html-parser";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const execFileAsync = promisify(execFile);

async function extractPdf(buf: Buffer): Promise<string> {
  const tmp = join(tmpdir(), `pdf-${randomBytes(8).toString("hex")}.pdf`);
  try {
    await writeFile(tmp, buf);
    const { stdout } = await execFileAsync("pdftotext", ["-layout", tmp, "-"], {
      maxBuffer: 50 * 1024 * 1024,
    });
    if (!stdout.trim()) {
      throw new Error("pdftotext returned no text");
    }
    return stdout;
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function isSafeUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return false;
  const h = parsed.hostname.toLowerCase();
  const blocked = [
    /^localhost$/,
    /^127\./,
    /^0\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^::1$/,
    /^fd/,
    /^fe80/,
  ];
  return !blocked.some((r) => r.test(h));
}

const router: IRouter = Router();

router.get("/sermon-resources", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(sermonResourcesTable)
    .where(eq(sermonResourcesTable.userId, req.userId!))
    .orderBy(desc(sermonResourcesTable.updatedAt));
  res.json(rows);
});

router.post("/sermon-resources", requireAuth, requireActiveAccess, async (req, res) => {
  const parsed = CreateSermonResourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const resourceType = d.resourceType ?? "note";
  const resourceValues = {
    userId: req.userId!,
    resourceType,
    title: d.title,
    author: d.author ?? "",
    publisher: d.publisher ?? "",
    year: d.year ?? "",
    pageOrLocation: d.pageOrLocation ?? "",
    url: d.url ?? "",
    excerpt: d.excerpt ?? "",
    summary: d.summary ?? "",
    notes: d.notes ?? "",
    relatedPassage: d.relatedPassage ?? "",
    tags: d.tags ?? [],
  };

  // Bible Tools results can be submitted again after a refresh or from
  // multiple tabs. These scalar fields form the result's stable identity;
  // tags are intentionally excluded because they are editable library
  // metadata rather than part of the lookup result.
  if (["bible-text", "cross-reference", "lexicon"].includes(resourceType)) {
    const [existing] = await db
      .select()
      .from(sermonResourcesTable)
      .where(
        and(
          eq(sermonResourcesTable.userId, req.userId!),
          eq(sermonResourcesTable.resourceType, resourceType),
          eq(sermonResourcesTable.title, resourceValues.title),
          eq(sermonResourcesTable.author, resourceValues.author),
          eq(sermonResourcesTable.publisher, resourceValues.publisher),
          eq(sermonResourcesTable.url, resourceValues.url),
          eq(sermonResourcesTable.excerpt, resourceValues.excerpt),
          eq(sermonResourcesTable.notes, resourceValues.notes),
          eq(sermonResourcesTable.relatedPassage, resourceValues.relatedPassage),
        ),
      )
      .limit(1);
    if (existing) {
      res.status(200).json(existing);
      return;
    }
  }

  const [row] = await db
    .insert(sermonResourcesTable)
    .values(resourceValues)
    .returning();
  res.status(201).json(row);
});

router.patch("/sermon-resources/:id", requireAuth, requireActiveAccess, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const parsed = UpdateSermonResourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const update: Record<string, unknown> = {};
  for (const k of [
    "resourceType",
    "title",
    "author",
    "publisher",
    "year",
    "pageOrLocation",
    "url",
    "excerpt",
    "summary",
    "notes",
    "relatedPassage",
    "tags",
  ] as const) {
    if (d[k] !== undefined) update[k] = d[k];
  }
  if (Object.keys(update).length === 0) {
    const [row] = await db
      .select()
      .from(sermonResourcesTable)
      .where(
        and(
          eq(sermonResourcesTable.id, id),
          eq(sermonResourcesTable.userId, req.userId!),
        ),
      )
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
    return;
  }
  const [row] = await db
    .update(sermonResourcesTable)
    .set(update)
    .where(
      and(
        eq(sermonResourcesTable.id, id),
        eq(sermonResourcesTable.userId, req.userId!),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

router.delete("/sermon-resources/:id", requireAuth, requireActiveAccess, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const result = await db
    .delete(sermonResourcesTable)
    .where(
      and(
        eq(sermonResourcesTable.id, id),
        eq(sermonResourcesTable.userId, req.userId!),
      ),
    )
    .returning();
  if (result.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).end();
});

// ── Task #77: extract text from an uploaded PDF or plain-text file ──────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.post("/sermon-resources/extract-text", requireAuth, upload.single("file") as any, async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const file = (req as any).file as { mimetype: string; buffer: Buffer } | undefined;
  if (!file) {
    res.status(400).json({ error: "No file uploaded." });
    return;
  }

  const mime = file.mimetype;

  if (mime === "text/plain") {
    const text = file.buffer.toString("utf-8").slice(0, 50_000);
    res.json({ text });
    return;
  }

  if (mime === "application/pdf") {
    try {
      const raw = await extractPdf(file.buffer);
      res.json({ text: raw.slice(0, 50_000) });
    } catch (err) {
      req.log.warn({ err }, "pdftotext extraction failed");
      res.status(422).json({
        error:
          "Could not extract text from this PDF. It may be encrypted or image-only.",
      });
    }
    return;
  }

  res.status(400).json({ error: "Only PDF (.pdf) and plain-text (.txt) files are supported." });
});

// ── Task #78: fetch and extract readable text from a URL ─────────────────────
router.post("/sermon-resources/fetch-url", requireAuth, async (req, res) => {
  const { url } = req.body as { url?: unknown };
  if (typeof url !== "string" || !url.trim()) {
    res.status(400).json({ error: "url is required." });
    return;
  }

  if (!isSafeUrl(url)) {
    res.status(400).json({ error: "Invalid or disallowed URL." });
    return;
  }

  let html: string;
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Sunday Studio/1.0; +https://worshipflow.app)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });

    if (!resp.ok) {
      res.status(422).json({
        error: `The page returned an error (HTTP ${resp.status}). It may require a login or be unavailable.`,
      });
      return;
    }

    const ct = resp.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
      res.status(422).json({ error: "URL does not point to a webpage." });
      return;
    }

    html = await resp.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.warn({ err, url }, "fetch-url failed");
    res.status(422).json({ error: `Could not reach the page: ${msg}` });
    return;
  }

  const root = parseHtml(html, { lowerCaseTagName: true });

  // ── Meta extraction ────────────────────────────────────────────────────────
  const metaContent = (selector: string) =>
    root.querySelector(selector)?.getAttribute("content")?.trim() ?? "";

  const title = (
    metaContent('meta[property="og:title"]') ||
    metaContent('meta[name="twitter:title"]') ||
    root.querySelector("title")?.text?.trim() ||
    ""
  );

  const author = (
    metaContent('meta[name="author"]') ||
    metaContent('meta[property="article:author"]') ||
    metaContent('meta[name="twitter:creator"]') ||
    ""
  );

  // ── Content extraction ─────────────────────────────────────────────────────
  for (const sel of [
    "script",
    "style",
    "nav",
    "header",
    "footer",
    "aside",
    "iframe",
    "noscript",
    "figure",
    "figcaption",
    "[role='navigation']",
    "[role='banner']",
    "[role='complementary']",
  ]) {
    root.querySelectorAll(sel).forEach((el) => el.remove());
  }

  const mainEl =
    root.querySelector("main") ??
    root.querySelector("article") ??
    root.querySelector('[role="main"]') ??
    root.querySelector(".post-content") ??
    root.querySelector(".entry-content") ??
    root.querySelector(".article-body") ??
    root.querySelector("#content") ??
    root.querySelector("body");

  const rawText = (mainEl ?? root).text;

  const text = rawText
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 50_000);

  if (!text) {
    res.status(422).json({
      error:
        "No readable text found on this page. It may be paywalled or require JavaScript.",
    });
    return;
  }

  res.json({ title, author, text });
});

export default router;
