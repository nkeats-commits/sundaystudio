import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@clerk/react";
import {
  useGenerationJob,
  useGenerationJobStore,
} from "../contexts/GenerationJobStore";

/**
 * Polling-based replacement for the old SSE-based `useStreamingGenerate`.
 *
 * Architecture (post-navigation-survival refactor):
 *  - On `mutate`, the job is started via POST and registered in the global
 *    `GenerationJobStore`, which owns the polling loop.  The hook reads its
 *    state from that store entry so state survives navigation.
 *  - On unmount (navigation away) the job is NOT cancelled — the store keeps
 *    polling so the result is ready when the user returns.
 *  - A new `mutate` call replaces the prior entry (and cancels its server
 *    job).  `reset()` cancels and removes the entry.
 */

const POLL_BASE_PATH = "/api/generate/jobs";

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

/** Map a generation API path to a human-readable label shown in the sidebar. */
function deriveLabel(startPath: string): string {
  if (startPath.includes("/generate/liturgy")) return "Generating liturgy…";
  if (startPath.includes("/generate/songs")) return "Generating songs…";
  if (startPath.includes("/generate/speaking-moment"))
    return "Generating speaking moment…";
  if (startPath.includes("/generate/devotional"))
    return "Generating devotional…";
  if (startPath.includes("/generate/soul-care")) return "Generating soul care…";
  if (startPath.includes("/generate/service-plan"))
    return "Building service plan…";
  if (startPath.includes("/generate/sermon")) return "Generating sermon…";
  return "Generating…";
}

export function useJobGenerate<TData>(
  startPath: string,
): JobGenerateState<TData> {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const store = useGenerationJobStore();
  const entry = useGenerationJob(startPath);

  /**
   * Monotonic counter that identifies the latest `mutate` call for this hook
   * instance. When an async POST resolves, it checks this counter to detect
   * whether a newer call has superseded it and should discard its result.
   */
  const mutateSeqRef = useRef(0);

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

  /** Fire-and-forget DELETE for a server-side job that we no longer track. */
  const cancelOrphanJob = useCallback(
    async (jobId: string): Promise<void> => {
      try {
        const h = await buildAuthHeaders();
        await fetch(`${POLL_BASE_PATH}/${jobId}`, {
          method: "DELETE",
          headers: { Accept: "application/json", ...(h.Authorization ? { Authorization: h.Authorization } : {}) },
          credentials: "include",
          keepalive: true,
        });
      } catch {
        /* ignore */
      }
    },
    [buildAuthHeaders],
  );

  const reset = useCallback(() => {
    mutateSeqRef.current += 1;
    store.cancelJob(startPath);
  }, [store, startPath]);

  const mutate = useCallback(
    async (body: unknown): Promise<TData | null> => {
      // Claim this sequence slot — any POST still in-flight from an earlier
      // call will notice it's been superseded once it resolves.
      const mySeq = ++mutateSeqRef.current;
      const isCurrent = () => mutateSeqRef.current === mySeq;

      // Eagerly clear the store entry so the UI reverts to idle immediately
      // rather than flashing a stale "done" result.
      store.cancelJob(startPath);

      try {
        const headers = await buildAuthHeaders();
        const startRes = await fetch(startPath, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          credentials: "include",
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
          const errMsg = await readErrorMessage(startRes);
          // Persist the failure to the store so `generate.error` is non-null
          // and generator pages can render their inline error UIs.
          if (isCurrent()) {
            store.recordJobError(startPath, new Error(errMsg), deriveLabel(startPath));
          }
          throw new Error(errMsg);
        }

        const startJson = (await startRes.json()) as { jobId?: unknown };
        const jobId =
          typeof startJson.jobId === "string" ? startJson.jobId : null;
        if (!jobId) {
          const err = new Error("Server did not return a jobId.");
          if (isCurrent()) {
            store.recordJobError(startPath, err, deriveLabel(startPath));
          }
          throw err;
        }

        // If a newer mutate already started while we awaited the POST, cancel
        // the server-side job we just created and bail out.
        if (!isCurrent()) {
          void cancelOrphanJob(jobId);
          return null;
        }

        const label = deriveLabel(startPath);
        store.registerJob(startPath, jobId, label);

        // Wait for the store's polling loop to signal done or error.
        return new Promise<TData | null>((resolve, reject) => {
          const unsubscribe = store.subscribe(startPath, () => {
            const current = store.getEntry(startPath);
            if (!current || current.jobId !== jobId) {
              // Entry was replaced (new generation started) or cancelled.
              unsubscribe();
              resolve(null);
              return;
            }
            if (current.status === "done") {
              unsubscribe();
              resolve(current.result as TData);
            } else if (current.status === "error") {
              unsubscribe();
              reject(current.error ?? new Error("Generation failed."));
            }
            // still pending — keep waiting
          });
        });
      } catch (e) {
        if (
          e instanceof DOMException ||
          (e instanceof Error && e.name === "AbortError")
        ) {
          return null;
        }
        throw e instanceof Error ? e : new Error(String(e));
      }
    },
    [startPath, store, buildAuthHeaders, cancelOrphanJob],
  );

  return {
    data: entry?.status === "done" ? (entry.result as TData) : null,
    error: entry?.error ?? null,
    isPending: entry?.status === "pending" ? true : false,
    partialText: entry?.partialTail ?? "",
    mutate,
    reset,
  };
}

/**
 * Map a generation startPath back to the page URL where that generator lives.
 * Used by the sidebar indicator so clicking navigates back to the right page.
 */
export function generatorPagePath(startPath: string): string {
  if (startPath.includes("/generate/liturgy")) return "/generators/liturgy";
  if (startPath.includes("/generate/songs")) return "/generators/songs";
  if (startPath.includes("/generate/speaking-moment"))
    return "/generators/speaking-moment";
  if (startPath.includes("/generate/devotional"))
    return "/generators/devotional";
  if (startPath.includes("/generate/soul-care")) return "/generators/soul-care";
  if (startPath.includes("/generate/service-plan")) return "/service-builder";
  if (startPath.includes("/generate/sermon")) return "/sermons";
  return "/dashboard";
}

// Keep the DELETE path for explicit cancellation (used by the store internally
// via cancelServerJob, but also re-exported here for any legacy callers).
export { POLL_BASE_PATH };
