import { useCallback, useEffect, useRef, useState } from "react";

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
 */
export function useStreamingGenerate<TData>(
  path: string,
): StreamingGenerateState<TData> {
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

      try {
        const res = await fetch(path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify(body),
          credentials: "include",
          signal: ac.signal,
        });

        if (!res.ok) {
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
                try {
                  done = JSON.parse(dataStr) as TData;
                } catch {
                  errorMessage = "Failed to parse generated content.";
                }
              } else if (event === "error") {
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
          // Stale/aborted: do not touch state — a newer request owns it now,
          // or the component has unmounted.
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
    [path],
  );

  return { data, error, isPending, partialText, mutate, reset };
}
