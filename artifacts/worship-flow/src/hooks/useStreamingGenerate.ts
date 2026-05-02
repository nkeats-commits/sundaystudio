import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";

export interface StreamingGenerateState<TData> {
  data: TData | null;
  error: Error | null;
  isPending: boolean;
  /** Concatenated raw text streamed back so far. Useful for showing progress. */
  partialText: string;
  /**
   * Submit a new generation request. Resolves with the parsed result, or
   * `null` if the request was aborted. Throws on failure.
   */
  mutate: (body: unknown) => Promise<TData | null>;
  /** Cancel any in-flight request and clear all state. */
  reset: () => void;
}

/**
 * Module-level callback invoked when the streaming endpoint returns 401.
 * Mirrors `setOnUnauthorized` in `@workspace/api-client-react`, kept local so
 * the hook stays self-contained and doesn't need to import the API client
 * package just for one symbol.
 */
type UnauthorizedHandler = () => void;
let _onUnauthorized: UnauthorizedHandler | null = null;

export function setStreamingOnUnauthorized(
  handler: UnauthorizedHandler | null,
): void {
  _onUnauthorized = handler;
}

/**
 * Hook for endpoints that stream a generated JSON document over
 * Server-Sent Events using this protocol:
 *   event: delta  -> { text }   token chunks
 *   event: done   -> { ...parsed JSON result }
 *   event: error  -> { message }
 *   : ping        -> keepalive comments are ignored
 *
 * Mirrors the slice of the React Query `useMutation` API that the
 * generator pages actually use (`mutate`, `data`, `isPending`), and adds
 * `error`, `partialText`, and `reset`.
 *
 * State writes are gated by a per-request id so that an aborted or stale
 * request can never overwrite the state of a newer in-flight request.
 * The active request is also aborted on component unmount.
 *
 * Authentication: every request fetches a fresh Clerk session JWT via
 * `useAuth().getToken()` and attaches it as `Authorization: Bearer <token>`.
 * The browser session cookie is also sent (`credentials: "include"`) as a
 * fallback for environments where header-based auth is not yet active.
 */
export function useStreamingGenerate<TData>(
  path: string,
): StreamingGenerateState<TData> {
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

  const mutate = useCallback(
    async (body: unknown): Promise<TData | null> => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const myId = ++requestIdRef.current;
      const isCurrent = () => mountedRef.current && requestIdRef.current === myId;

      if (isCurrent()) {
        setData(null);
        setError(null);
        setPartialText("");
        setIsPending(true);
      }

      // eslint-disable-next-line no-console
      const dbg = (...args: unknown[]) =>
        console.log(`[stream:${path}#${myId}]`, ...args);
      dbg("mutate start");

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        };

        // Attach a fresh Clerk session JWT.  We refetch on every request so
        // the server always sees a non-expired token even after Clerk has
        // rotated the session client-side.
        try {
          const token = await getTokenRef.current();
          if (token) headers.Authorization = `Bearer ${token}`;
        } catch {
          /* ignore — fall back to cookie-based auth */
        }

        const res = await fetch(path, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          credentials: "include",
          signal: ac.signal,
        });
        dbg("response", res.status, res.headers.get("content-type"));

        if (!res.ok) {
          if (res.status === 401 && _onUnauthorized) {
            try {
              _onUnauthorized();
            } catch {
              /* swallow handler errors */
            }
          }
          let message = `Request failed (${res.status})`;
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
                if (detail) message = detail;
              }
            } else {
              const t = await res.text();
              if (t.trim()) message = t.slice(0, 300);
            }
          } catch {
            /* ignore */
          }
          throw new Error(message);
        }

        if (!res.body) {
          throw new Error("Streaming response had no body");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let done: TData | null = null;
        let errorMessage: string | null = null;
        let textBuffer = "";
        let flushHandle: ReturnType<typeof setTimeout> | null = null;

        const flushPartial = () => {
          if (textBuffer.length === 0) return;
          const next = textBuffer;
          textBuffer = "";
          if (isCurrent()) {
            setPartialText((prev) => prev + next);
          }
        };

        const scheduleFlush = () => {
          if (flushHandle != null) return;
          flushHandle = setTimeout(() => {
            flushHandle = null;
            flushPartial();
          }, 50);
        };

        // Find the next SSE event boundary, accepting both LF/LF and CRLF/CRLF
        // framings. Returns the index of the first byte of the separator and
        // the separator length, or null if no boundary is present yet.
        const findEventBoundary = (
          s: string,
        ): { index: number; length: number } | null => {
          const lf = s.indexOf("\n\n");
          const crlf = s.indexOf("\r\n\r\n");
          if (lf < 0 && crlf < 0) return null;
          if (lf < 0) return { index: crlf, length: 4 };
          if (crlf < 0) return { index: lf, length: 2 };
          return crlf < lf
            ? { index: crlf, length: 4 }
            : { index: lf, length: 2 };
        };

        try {
          while (true) {
            const { value, done: streamDone } = await reader.read();
            if (streamDone) {
              // Flush any remaining bytes from the decoder at EOF.
              buf += decoder.decode();
              break;
            }
            buf += decoder.decode(value, { stream: true });

            let boundary = findEventBoundary(buf);
            while (boundary !== null) {
              const raw = buf.slice(0, boundary.index);
              buf = buf.slice(boundary.index + boundary.length);

              let event = "message";
              const dataLines: string[] = [];
              for (const line of raw.split(/\r?\n/)) {
                if (line === "" || line.startsWith(":")) continue;
                if (line.startsWith("event:")) {
                  event = line.slice(6).trim();
                } else if (line.startsWith("data:")) {
                  dataLines.push(line.slice(5).replace(/^ /, ""));
                }
              }
              if (dataLines.length === 0) continue;
              const dataStr = dataLines.join("\n");

              if (event === "delta") {
                try {
                  const parsed = JSON.parse(dataStr) as { text?: unknown };
                  if (typeof parsed.text === "string") {
                    textBuffer += parsed.text;
                    scheduleFlush();
                  }
                } catch {
                  /* ignore malformed delta */
                }
              } else if (event === "done") {
                dbg("done event received", dataStr.length, "bytes");
                try {
                  done = JSON.parse(dataStr) as TData;
                } catch (parseErr) {
                  dbg("done parse failed", parseErr);
                  errorMessage = "Failed to parse generated content.";
                }
              } else if (event === "error") {
                dbg("error event", dataStr);
                try {
                  const parsed = JSON.parse(dataStr) as { message?: unknown };
                  errorMessage =
                    typeof parsed.message === "string"
                      ? parsed.message
                      : "Generation failed.";
                } catch {
                  errorMessage = "Generation failed.";
                }
              }

              boundary = findEventBoundary(buf);
            }
          }
        } finally {
          if (flushHandle != null) clearTimeout(flushHandle);
          flushPartial();
        }
        dbg(
          "stream ended; done?",
          done !== null,
          "errorMessage?",
          errorMessage,
          "isCurrent?",
          isCurrent(),
        );

        if (errorMessage) throw new Error(errorMessage);
        if (done === null) {
          throw new Error("Generation finished without producing a result.");
        }

        if (isCurrent()) {
          setData(done);
          setIsPending(false);
        }
        return done;
      } catch (e) {
        if (
          (e instanceof DOMException && e.name === "AbortError") ||
          (e instanceof Error && e.name === "AbortError")
        ) {
          dbg("AbortError — returning null");
          // Stale/aborted: clear pending state on the *active* request only.
          // (For a stale/superseded request, the newer mutate call owns
          // pending state and we must not touch it.)
          if (isCurrent()) {
            setIsPending(false);
          }
          return null;
        }
        dbg("threw", e);
        const errObj = e instanceof Error ? e : new Error(String(e));
        if (isCurrent()) {
          setError(errObj);
          setIsPending(false);
        }
        throw errObj;
      }
    },
    [path],
  );

  return { data, error, isPending, partialText, mutate, reset };
}
