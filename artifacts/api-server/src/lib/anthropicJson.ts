import { anthropic } from "@workspace/integrations-anthropic-ai";

const MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 4096;

const SYSTEM = [
  "You are Sunday Studio, an AI assistant for Christian worship pastors.",
  "Your tone is warm, theologically grounded, and pastoral.",
  "You produce content suitable for Sunday worship: liturgy, prayers, songs, devotionals, and speaking moments.",
  "You always respect the church's denominational context when provided.",
  "You write concisely without padding or repetition; finish within the requested length.",
  "When asked to return JSON, you return ONLY valid JSON — no markdown fences, no commentary, no preamble.",
].join(" ");

export function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = trimmed.search(/[\[{]/);
  const lastObj = trimmed.lastIndexOf("}");
  const lastArr = trimmed.lastIndexOf("]");
  const end = Math.max(lastObj, lastArr);
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

export interface StreamOptions {
  maxTokens?: number;
}

export function streamMessage(prompt: string, opts: StreamOptions = {}) {
  return anthropic.messages.stream({
    model: MODEL,
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
}

export async function generateJson<T>(
  prompt: string,
  opts: StreamOptions = {},
): Promise<T> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  const block = message.content[0];
  const text = block && block.type === "text" ? block.text : "";
  const jsonText = extractJson(text);
  return JSON.parse(jsonText) as T;
}

export interface ChurchContext {
  churchName?: string;
  denomination?: string;
  theology?: string;
  musicStyle?: string;
  traditions?: string;
}

export function churchContextBlurb(ctx: ChurchContext | null | undefined): string {
  if (!ctx) return "No specific church context was provided.";
  const lines = [
    `Church: ${ctx.churchName ?? "Unspecified"}`,
    ctx.denomination ? `Denomination: ${ctx.denomination}` : "",
    ctx.theology ? `Theology: ${ctx.theology}` : "",
    ctx.musicStyle ? `Music style: ${ctx.musicStyle}` : "",
    ctx.traditions ? `Traditions: ${ctx.traditions}` : "",
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : "No specific church context was provided.";
}
