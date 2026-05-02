import { randomUUID } from "crypto";
import type { Logger } from "pino";
import { extractJson, streamMessage } from "./anthropicJson";

/**
 * In-memory generation-job runtime.
 *
 * Why this exists: the deployed Replit autoscale proxy buffers SSE response
 * bodies — `event: delta` chunks never reach the browser until the response
 * is fully closed, which makes long Anthropic generations look "frozen" and
 * causes Chrome to show "Page Unresponsive". Streaming JSON over SSE is
 * therefore unreliable in production. Instead we run the Anthropic call in
 * the background on the server, expose a short `{ jobId }` start endpoint and
 * a fast poll endpoint that the client hits every ~1.5s. Each individual
 * HTTP request is short and trivially proxied.
 *
 * The runtime is in-memory and per-process. Autoscale may run multiple
 * instances; if a poll lands on a different instance than the one running
 * the job, `get()` returns `null` (the route translates that to
 * `{ status: "unknown" }`). The client tolerates a small number of `unknown`
 * responses with backoff before giving up.
 */

/** Maximum tail of accumulated text exposed to the polling client. */
const PARTIAL_TAIL_CAP = 4000;
/** How long without a poll before we abort a still-pending job. */
const ABANDON_AFTER_MS = 60_000;
/** How long completed/errored jobs remain queryable before eviction. */
const COMPLETED_TTL_MS = 5 * 60_000;
/** Janitor interval. */
const SWEEP_INTERVAL_MS = 15_000;

export type JobStatus = "pending" | "done" | "error";

export interface JobSnapshot {
  status: JobStatus;
  /** Total characters of model text accumulated so far. */
  charsReceived: number;
  /** Last `PARTIAL_TAIL_CAP` chars of the model text. */
  partialTail: string;
  /** Final parsed result; only present when `status === "done"`. */
  result?: unknown;
  /** Friendly error message; only present when `status === "error"`. */
  errorMessage?: string;
}

interface SafeParseable<T> {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: unknown } };
}

interface JobInternal {
  userId: string;
  status: JobStatus;
  charsReceived: number;
  partialTail: string;
  result?: unknown;
  errorMessage?: string;
  createdAt: number;
  finishedAt?: number;
  lastPolledAt: number;
  abort: () => void;
}

export interface StartJobOptions<T> {
  userId: string;
  prompt: string;
  maxTokens: number;
  /** Short label for log lines (e.g. `"sermon study"`, `"songs"`). */
  label: string;
  log: Logger;
  /** Optional zod schema validation of the parsed JSON. */
  responseSchema?: SafeParseable<T>;
  /** Optional async post-process that may rewrite the parsed result. */
  transform?: (parsed: T) => T | Promise<T>;
}

class JobManager {
  private jobs = new Map<string, JobInternal>();
  private sweeperStarted = false;

  private startSweeper(): void {
    if (this.sweeperStarted) return;
    this.sweeperStarted = true;
    const handle = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    handle.unref();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.status === "pending") {
        if (now - job.lastPolledAt > ABANDON_AFTER_MS) {
          try {
            job.abort();
          } catch {
            /* ignore */
          }
          this.jobs.delete(id);
        }
      } else if (job.finishedAt && now - job.finishedAt > COMPLETED_TTL_MS) {
        this.jobs.delete(id);
      }
    }
  }

  start<T>(opts: StartJobOptions<T>): string {
    this.startSweeper();
    const jobId = randomUUID();
    const stream = streamMessage(opts.prompt, { maxTokens: opts.maxTokens });

    let fullText = "";
    const job: JobInternal = {
      userId: opts.userId,
      status: "pending",
      charsReceived: 0,
      partialTail: "",
      createdAt: Date.now(),
      lastPolledAt: Date.now(),
      abort: () => {
        try {
          if (!stream.ended && !stream.aborted) stream.abort();
        } catch {
          /* ignore */
        }
      },
    };
    this.jobs.set(jobId, job);

    stream.on("text", (delta: string) => {
      fullText += delta;
      job.charsReceived = fullText.length;
      job.partialTail =
        fullText.length > PARTIAL_TAIL_CAP
          ? fullText.slice(-PARTIAL_TAIL_CAP)
          : fullText;
    });

    void (async () => {
      try {
        await stream.finalMessage();
      } catch (err) {
        opts.log.error({ err }, `${opts.label} streaming failed`);
        job.status = "error";
        job.errorMessage = "Generation failed. Please try again.";
        job.finishedAt = Date.now();
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(extractJson(fullText));
      } catch (err) {
        opts.log.error(
          { err, sample: fullText.slice(0, 500) },
          `${opts.label} JSON parse failed`,
        );
        job.status = "error";
        job.errorMessage =
          "We received a response from the model but couldn't parse it as JSON. Please try again.";
        job.finishedAt = Date.now();
        return;
      }

      if (opts.responseSchema) {
        const check = opts.responseSchema.safeParse(parsed);
        if (!check.success) {
          opts.log.error(
            { issues: check.error.issues, sample: fullText.slice(0, 500) },
            `${opts.label} response schema validation failed`,
          );
          job.status = "error";
          job.errorMessage =
            "The model returned a response in an unexpected shape. Please try again.";
          job.finishedAt = Date.now();
          return;
        }
        parsed = check.data;
      }

      if (opts.transform) {
        try {
          parsed = await opts.transform(parsed as T);
        } catch (err) {
          opts.log.error({ err }, `${opts.label} response transform failed`);
          job.status = "error";
          job.errorMessage =
            "We received a response from the model but couldn't process it. Please try again.";
          job.finishedAt = Date.now();
          return;
        }
      }

      job.status = "done";
      job.result = parsed;
      job.finishedAt = Date.now();
    })();

    return jobId;
  }

  /**
   * Cancel a running job and evict it. No-op if the job doesn't exist on
   * this instance or isn't owned by `userId`. Returns `true` when a job
   * was found and cancelled.
   */
  cancel(jobId: string, userId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    if (job.userId !== userId) return false;
    if (job.status === "pending") {
      try {
        job.abort();
      } catch {
        /* ignore */
      }
    }
    this.jobs.delete(jobId);
    return true;
  }

  /**
   * Returns a snapshot of the job, or `null` if no such job exists on this
   * instance OR the requesting user does not own it. Successful lookups
   * refresh the abandon-detection clock.
   */
  get(jobId: string, userId: string): JobSnapshot | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    if (job.userId !== userId) return null;
    job.lastPolledAt = Date.now();
    return {
      status: job.status,
      charsReceived: job.charsReceived,
      partialTail: job.partialTail,
      ...(job.result !== undefined ? { result: job.result } : {}),
      ...(job.errorMessage !== undefined
        ? { errorMessage: job.errorMessage }
        : {}),
    };
  }
}

export const jobManager = new JobManager();
