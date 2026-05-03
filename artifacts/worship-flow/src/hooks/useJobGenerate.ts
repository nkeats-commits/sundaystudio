import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";

/**
 * Polling-based replacement for the old SSE-based `useStreamingGenerate`.
 *
 * Why polling: the deployed Replit autoscale proxy buffers SSE response
 * bodies entirely, so streaming `event: delta` chunks never reach the
 * browser until the response closes. We instead POST to the start endpoint
 * (which returns `{ jobId }` immediately), then poll
 * `GET /api/generate/jobs/:jobId` every ~1.5s. Each request is short and
 * proxies cleanly.
 *
 * The hook surface deliberately matches the old streaming hook so callers
 * needed only an import rename.
 */

const PARTIAL_TEXT_DISPLAY_CAP = 4000;
const POLL_INTERVAL_MS = 1500;
const POLL_BASE_PATH = "/api/generate/jobs";
/**
 * How long we tolerate consecutive `unknown` poll responses before giving
 * up. Autoscale runs multiple workers and routing is not sticky, so polls
 * can repeatedly land on a worker that doesn't own the job. We give the
 * routing plenty of time to land on the right worker before failing.
 */
const UNKNOWN_TOLERANCE_MS = 45_000;

interface JobSnapshotResponse {
  status: "pending" | "done" | "error" | "unknown";
  charsReceived?: number;
  partialTail?: string;
  result?: unknown;
  errorMessage?: string;
}

export interface JobGenerateState<TData> {
  data: TData | null;
  error: Error | null;
  isPending: boolean;
  /** Tail of model text accumulated so far. */
  partialText: string;
  mutate: (body: unknown) => Promise<TData | null>;
  reset: () => void;
}

type UnauthorizedHandler = () => void;
let _onUnauthorized: UnauthorizedHandler | null = null;

export function setJobGenerateOnUnauthorized(
  handler: UnauthorizedHandler | null,
): void {
  _onUnauthorized = handler;
}

type PaymentRequiredHandler = (info: { url: string }) => void;
let _onPaymentRequired: PaymentRequiredHandler | null = null;

export function setJobGenerateOnPaymentRequired(
  handler: PaymentRequiredHandler | null,
): void {
  _onPaymentRequired = handler;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort);
  });
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("json")) {
      const j: unknown = await res.json();
      if (j && typeof j === "object") {
        const obj = j as Record<string, unknown>;
        const detail =
          (typeof obj.error === "string" && obj.error) ||
          (typeof obj.message === "string" && obj.message) ||
          "";
        if (detail) return detail;
      }
    } else {
      const t = await res.text();
      if (t.trim()) return t.slice(0, 300);
    }
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

export function useJobGenerate<TData>(
  startPath: string,
): JobGenerateState<TData> {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const [data, setData] = useState<TData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [partialText, setPartialText] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  /** Most-recent active jobId, used for fire-and-forget cancel on abort. */
  const activeJobIdRef = useRef<string | null>(null);

  /**
   * Best-effort cancel of a server-side job. Fire-and-forget: we use
   * `keepalive` so the request still goes out if the page is being torn
   * down. Failures are silently ignored — the server's idle sweeper will
   * clean up eventually.
   */
  const cancelJob = useCallback(async (jobId: string): Promise<void> => {
    try {
      const headers = await (async (): Promise<Record<string, string>> => {
        const h: Record<string, string> = { Accept: "application/json" };
        try {
          const token = await getTokenRef.current();
          if (token) h.Authorization = `Bearer ${token}`;
        } catch {
          /* fall through */
        }
        return h;
      })();
      await fetch(`${POLL_BASE_PATH}/${jobId}`, {
        method: "DELETE",
        headers,
        credentials: "include",
        keepalive: true,
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
      const id = activeJobIdRef.current;
      if (id) {
        activeJobIdRef.current = null;
        void cancelJob(id);
      }
    };
  }, [cancelJob]);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    const id = activeJobIdRef.current;
    if (id) {
      activeJobIdRef.current = null;
      void cancelJob(id);
    }
    if (!mountedRef.current) return;
    setData(null);
    setError(null);
    setIsPending(false);
    setPartialText("");
  }, [cancelJob]);

  const buildAuthHeaders = useCallback(async (): Promise<
    Record<string, string>
  > => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    try {
      const token = await getTokenRef.current();
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      /* fall back to cookie */
    }
    return headers;
  }, []);

  const mutate = useCallback(
    async (body: unknown): Promise<TData | null> => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const myId = ++requestIdRef.current;
      const isCurrent = () =>
        mountedRef.current && requestIdRef.current === myId;

      if (isCurrent()) {
        setData(null);
        setError(null);
        setPartialText("");
        setIsPending(true);
      }

      // Cancel any prior in-flight job server-side before starting a new one.
      const previousJobId = activeJobIdRef.current;
      if (previousJobId) {
        activeJobIdRef.current = null;
        void cancelJob(previousJobId);
      }

      try {
        // 1. Start the job.
        const startHeaders = await buildAuthHeaders();
        const startRes = await fetch(startPath, {
          method: "POST",
          headers: startHeaders,
          body: JSON.stringify(body),
          credentials: "include",
          signal: ac.signal,
        });

        if (!startRes.ok) {
          if (startRes.status === 401 && _onUnauthorized) {
            try {
              _onUnauthorized();
            } catch {
              /* ignore */
            }
          }
          if (startRes.status === 402 && _onPaymentRequired) {
            try {
              _onPaymentRequired({ url: startPath });
            } catch {
              /* ignore */
            }
          }
          throw new Error(await readErrorMessage(startRes));
        }

        const startJson = (await startRes.json()) as { jobId?: unknown };
        const jobId =
          typeof startJson.jobId === "string" ? startJson.jobId : null;
        if (!jobId) throw new Error("Server did not return a jobId.");
        if (isCurrent()) activeJobIdRef.current = jobId;

        // 2. Poll until done / error / aborted.
        let lastPartial = "";
        let firstUnknownAt: number | null = null;
        // First poll happens immediately (so if Anthropic was very fast we
        // don't make the user wait the full interval).
        let firstPoll = true;
        while (true) {
          if (!firstPoll) await sleep(POLL_INTERVAL_MS, ac.signal);
          firstPoll = false;

          const pollHeaders = await buildAuthHeaders();
          const pollRes = await fetch(`${POLL_BASE_PATH}/${jobId}`, {
            method: "GET",
            headers: pollHeaders,
            credentials: "include",
            signal: ac.signal,
          });

          if (!pollRes.ok) {
            if (pollRes.status === 401 && _onUnauthorized) {
              try {
                _onUnauthorized();
              } catch {
                /* ignore */
              }
            }
            if (pollRes.status === 402 && _onPaymentRequired) {
              try {
                _onPaymentRequired({ url: `${POLL_BASE_PATH}/${jobId}` });
              } catch {
                /* ignore */
              }
            }
            throw new Error(await readErrorMessage(pollRes));
          }

          const snap = (await pollRes.json()) as JobSnapshotResponse;

          if (snap.status === "unknown") {
            // Autoscale may route this poll to a worker that doesn't own
            // the job; tolerate sustained unknowns up to a time budget
            // before giving up.
            if (firstUnknownAt === null) firstUnknownAt = Date.now();
            else if (Date.now() - firstUnknownAt > UNKNOWN_TOLERANCE_MS) {
              throw new Error(
                "Lost track of this generation. Please try again.",
              );
            }
            continue;
          }
          firstUnknownAt = null;

          if (typeof snap.partialTail === "string") {
            const next = snap.partialTail.slice(-PARTIAL_TEXT_DISPLAY_CAP);
            if (next !== lastPartial) {
              lastPartial = next;
              if (isCurrent()) setPartialText(next);
            }
          }

          if (snap.status === "done") {
            const result = snap.result as TData | undefined;
            if (result === undefined) {
              throw new Error("Generation finished without producing a result.");
            }
            if (isCurrent()) {
              activeJobIdRef.current = null;
              setData(result);
              setIsPending(false);
            }
            return result;
          }
          if (snap.status === "error") {
            if (isCurrent()) activeJobIdRef.current = null;
            throw new Error(snap.errorMessage || "Generation failed.");
          }
          // status === "pending" → continue polling.
        }
      } catch (e) {
        if (
          (e instanceof DOMException && e.name === "AbortError") ||
          (e instanceof Error && e.name === "AbortError")
        ) {
          if (isCurrent()) setIsPending(false);
          return null;
        }
        const errObj = e instanceof Error ? e : new Error(String(e));
        if (isCurrent()) {
          setError(errObj);
          setIsPending(false);
        }
        throw errObj;
      }
    },
    [startPath, buildAuthHeaders],
  );

  return { data, error, isPending, partialText, mutate, reset };
}
