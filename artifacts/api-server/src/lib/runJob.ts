import type { Request, Response } from "express";
import { jobManager } from "./jobManager";

interface SafeParseable<T> {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: unknown } };
}

/**
 * Drop-in replacement for the old `streamGenerate` helper. Instead of
 * holding a long-lived SSE response open (which the deployed Replit
 * autoscale proxy buffers and breaks), this enqueues a background job and
 * returns `{ jobId }` immediately. The client polls
 * `GET /api/generate/jobs/:jobId` for status.
 *
 * Argument order matches the old `streamGenerate` so per-route call sites
 * stayed identical.
 */
export function runJob<T = unknown>(
  req: Request,
  res: Response,
  prompt: string,
  maxTokens: number,
  label: string,
  responseSchema?: SafeParseable<T>,
  transform?: (parsed: T) => T | Promise<T>,
): void {
  const jobId = jobManager.start<T>({
    userId: req.userId!,
    prompt,
    maxTokens,
    label,
    log: req.log,
    responseSchema,
    transform,
  });
  res.json({ jobId });
}
