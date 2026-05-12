import { eq } from "drizzle-orm";
import { db, churchProfilesTable, pastorManuscriptsTable } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";
import { recordAiUsage } from "./anthropicJson";

const objectStorageService = new ObjectStorageService();

async function extractTextFromBuffer(
  buffer: Buffer,
  contentType: string,
  fileName: string,
): Promise<string> {
  const lowerName = fileName.toLowerCase();

  if (contentType === "application/pdf" || lowerName.endsWith(".pdf")) {
    try {
      const pdfMod = await import("pdf-parse");
      const anyMod = pdfMod as unknown as Record<string, unknown>;
      const pdfParse = (
        typeof anyMod["default"] === "function" ? anyMod["default"] : pdfMod
      ) as (buf: Buffer) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      return result.text ?? "";
    } catch (err) {
      logger.warn({ err, fileName }, "pdf-parse failed, treating as empty");
      return "";
    }
  }

  if (
    contentType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? "";
    } catch (err) {
      logger.warn({ err, fileName }, "mammoth failed, treating as empty");
      return "";
    }
  }

  return buffer.toString("utf-8");
}

/**
 * Fetch all manuscripts for the user from object storage, extract their text,
 * and ask Claude to produce a compact style summary. Stores the result in
 * church_profiles.derived_tone_description. No-op if the user has no manuscripts.
 */
export async function analyzeManuscripts(userId: string): Promise<void> {
  const manuscripts = await db
    .select()
    .from(pastorManuscriptsTable)
    .where(eq(pastorManuscriptsTable.userId, userId));

  if (manuscripts.length === 0) {
    await db
      .update(churchProfilesTable)
      .set({ derivedToneDescription: "" })
      .where(eq(churchProfilesTable.userId, userId));
    return;
  }

  const MAX_CHARS_PER_DOC = 8000;
  const MAX_TOTAL_CHARS = 20000;
  const textChunks: string[] = [];
  let totalChars = 0;

  for (const ms of manuscripts) {
    if (totalChars >= MAX_TOTAL_CHARS) break;
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(
        ms.storedPath,
      );
      const [fileContents] = await objectFile.download();
      const buf = Buffer.isBuffer(fileContents)
        ? fileContents
        : Buffer.from(fileContents as ArrayBuffer);
      const raw = await extractTextFromBuffer(buf, "", ms.fileName);
      const trimmed = raw.slice(0, MAX_CHARS_PER_DOC).trim();
      if (trimmed.length > 100) {
        textChunks.push(`--- ${ms.fileName} ---\n${trimmed}`);
        totalChars += trimmed.length;
      }
    } catch (err) {
      logger.warn({ err, manuscriptId: ms.id }, "Failed to fetch/parse manuscript");
    }
  }

  if (textChunks.length === 0) {
    return;
  }

  const combinedText = textChunks.join("\n\n").slice(0, MAX_TOTAL_CHARS);

  const prompt = `You are analyzing a pastor's writing style from their sermon manuscripts.

Read the following manuscript excerpts carefully, then write a concise paragraph (100–180 words) describing this pastor's distinctive writing and speaking style. Cover: their overall tone, vocabulary level, how they use illustrations or stories, their sentence rhythm, theological language they favor, and any other distinctive patterns. Write the description in third person as if briefing an AI assistant that will write content in this pastor's voice.

MANUSCRIPTS:
${combinedText}

Respond with ONLY the style description paragraph — no preamble, no labels, no markdown.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  recordAiUsage({
    userId,
    generationType: "manuscript-analysis",
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    log: logger,
  });

  const block = message.content[0];
  const summary =
    block && block.type === "text" ? block.text.trim() : "";

  if (summary) {
    await db
      .update(churchProfilesTable)
      .set({ derivedToneDescription: summary })
      .where(eq(churchProfilesTable.userId, userId));
  }
}
