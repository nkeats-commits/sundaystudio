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
/** Time between polls treated as a soft elapsed-time tick for the UI. */
const POLL_BASE_PATH = "/api/generate/jobs";
/** How many consecutive `unknown` responses to tolerate before failing. */
const UNKNOWN_RETRY_LIMIT = 4;

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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (!mountedRef.current) return;
    setData(null);
    setError(null);
    setIsPending(false);
    setPartialText("");
  }, []);

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
          throw new Error(await readErrorMessage(startRes));
        }

        const startJson = (await startRes.json()) as { jobId?: unknown };
        const jobId =
          typeof startJson.jobId === "string" ? startJson.jobId : null;
        if (!jobId) throw new Error("Server did not return a jobId.");

        // 2. Poll until done / error / aborted.
        let lastPartial = "";
        let unknownCount = 0;
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
            throw new Error(await readErrorMessage(pollRes));
          }

          const snap = (await pollRes.json()) as JobSnapshotResponse;

          if (snap.status === "unknown") {
            unknownCount += 1;
            if (unknownCount > UNKNOWN_RETRY_LIMIT) {
              throw new Error(
                "Lost track of this generation. Please try again.",
              );
            }
            continue;
          }
          unknownCount = 0;

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
              setData(result);
              setIsPending(false);
            }
            return result;
          }
          if (snap.status === "error") {
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
