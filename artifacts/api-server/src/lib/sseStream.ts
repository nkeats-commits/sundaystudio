import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { extractJson, streamMessage } from "./anthropicJson";

function canWrite(res: Response): boolean {
  return !res.writableEnded && !res.destroyed;
}

function writeSseEvent(res: Response, event: string, data: unknown): void {
  if (!canWrite(res)) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Stream a generated JSON document over Server-Sent Events.
 *
 * Wire protocol:
 *   - `event: delta`  -> { text: string }   incremental token text
 *   - `event: done`   -> parsed JSON object (final result)
 *   - `event: error`  -> { message: string }
 *   - `: ping`        -> keepalive comment every 10s
 *
 * SSE keeps a steady byte stream flowing so the deployment proxy
 * (autoscale, ~30s idle limit) does not abort long Anthropic responses.
 */
export async function streamGenerate(
  req: Request,
  res: Response,
  prompt: string,
  maxTokens: number,
  label: string,
  responseSchema?: ZodType<unknown>,
): Promise<void> {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Disable nginx-style proxy buffering so chunks flush immediately.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  if (canWrite(res)) res.write(": ready\n\n");

  const ping = setInterval(() => {
    if (canWrite(res)) res.write(": ping\n\n");
  }, 10_000);

  const stream = streamMessage(prompt, { maxTokens });

  const onClientClose = () => {
    if (!stream.ended && !stream.aborted) {
      stream.abort();
    }
  };
  req.on("close", onClientClose);

  let fullText = "";

  stream.on("text", (delta: string) => {
    fullText += delta;
    writeSseEvent(res, "delta", { text: delta });
  });

  const safeEnd = () => {
    if (canWrite(res)) res.end();
  };

  try {
    await stream.finalMessage();
  } catch (err) {
    clearInterval(ping);
    req.off("close", onClientClose);
    req.log.error({ err }, `${label} streaming failed`);
    writeSseEvent(res, "error", {
      message: "Generation failed. Please try again.",
    });
    safeEnd();
    return;
  }

  clearInterval(ping);
  req.off("close", onClientClose);

  if (!canWrite(res)) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(fullText));
  } catch (err) {
    req.log.error(
      { err, sample: fullText.slice(0, 500) },
      `${label} JSON parse failed`,
    );
    writeSseEvent(res, "error", {
      message:
        "We received a response from the model but couldn't parse it as JSON. Please try again.",
    });
    safeEnd();
    return;
  }

  // Optional shape check: if a zod schema was supplied, validate the parsed
  // output before sending it to the client. This guards against model
  // drift / prompt injection producing the wrong JSON shape, which would
  // otherwise cascade into broken DB writes downstream.
  if (responseSchema) {
    const check = responseSchema.safeParse(parsed);
    if (!check.success) {
      req.log.error(
        { issues: check.error.issues, sample: fullText.slice(0, 500) },
        `${label} response schema validation failed`,
      );
      writeSseEvent(res, "error", {
        message:
          "The model returned a response in an unexpected shape. Please try again.",
      });
      safeEnd();
      return;
    }
    parsed = check.data;
  }

  writeSseEvent(res, "done", parsed);
  safeEnd();
}
