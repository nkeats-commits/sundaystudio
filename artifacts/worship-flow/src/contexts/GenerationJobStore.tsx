import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';

const POLL_INTERVAL_MS = 1500;
const POLL_BASE_PATH = '/api/generate/jobs';
const UNKNOWN_TOLERANCE_MS = 45_000;
const PARTIAL_TAIL_CAP = 4000;

export interface JobEntry {
  jobId: string;
  startPath: string;
  status: 'pending' | 'done' | 'error';
  partialTail: string;
  charsReceived: number;
  result: unknown | null;
  error: Error | null;
  label: string;
  firstUnknownAt: number | null;
}

type Listener = () => void;

export interface GenerationJobStoreValue {
  registerJob: (startPath: string, jobId: string, label: string) => void;
  cancelJob: (startPath: string) => void;
  /**
   * Record a pre-registration failure (e.g. POST returned non-OK) so that
   * hook callers can read it from `entry.error` and render inline error UIs,
   * just as they would for a mid-poll failure.
   */
  recordJobError: (startPath: string, error: Error, label: string) => void;
  getEntry: (startPath: string) => JobEntry | undefined;
  getAllEntries: () => JobEntry[];
  subscribe: (startPath: string, cb: Listener) => () => void;
  subscribeToAny: (cb: Listener) => () => void;
}

const GenerationJobStoreCtx = createContext<GenerationJobStoreValue | null>(null);

/**
 * Module-level token getter set by ClerkAuthBootstrap so the polling loop
 * can attach auth headers without being inside a Clerk component.
 */
let _tokenGetter: (() => Promise<string | null>) | null = null;

export function setGenerationJobStoreTokenGetter(
  getter: (() => Promise<string | null>) | null,
): void {
  _tokenGetter = getter;
}

/**
 * Module-level 401/402 callbacks — wired by ClerkAuthBootstrap, mirror the
 * same handlers used in the API client and useJobGenerate.
 */
let _onUnauthorized: (() => void) | null = null;
let _onPaymentRequired: ((info: { url: string }) => void) | null = null;

/**
 * Module-level completion callback — fired when a job transitions from
 * "pending" to "done".  Wired by GenerationCompleteToaster in App.tsx.
 */
let _onJobComplete: ((entry: JobEntry) => void) | null = null;

export function setGenerationJobStoreOnJobComplete(
  handler: ((entry: JobEntry) => void) | null,
): void {
  _onJobComplete = handler;
}

export function setGenerationJobStoreOnUnauthorized(
  handler: (() => void) | null,
): void {
  _onUnauthorized = handler;
}

export function setGenerationJobStoreOnPaymentRequired(
  handler: ((info: { url: string }) => void) | null,
): void {
  _onPaymentRequired = handler;
}

async function buildPollHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  try {
    if (_tokenGetter) {
      const token = await _tokenGetter();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    /* fall back to cookie */
  }
  return headers;
}

async function cancelServerJob(jobId: string): Promise<void> {
  try {
    const headers = await buildPollHeaders();
    await fetch(`${POLL_BASE_PATH}/${jobId}`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}

export function GenerationJobStoreProvider({ children }: { children: ReactNode }) {
  const jobsRef = useRef<Map<string, JobEntry>>(new Map());
  const listenersRef = useRef<Map<string, Set<Listener>>>(new Map());
  const anyListenersRef = useRef<Set<Listener>>(new Set());

  function notify(startPath: string) {
    listenersRef.current.get(startPath)?.forEach((cb) => cb());
    anyListenersRef.current.forEach((cb) => cb());
  }

  const storeValue = useRef<GenerationJobStoreValue>({
    registerJob(startPath, jobId, label) {
      const existing = jobsRef.current.get(startPath);
      if (existing && existing.status === 'pending') {
        void cancelServerJob(existing.jobId);
      }
      jobsRef.current.set(startPath, {
        jobId,
        startPath,
        status: 'pending',
        partialTail: '',
        charsReceived: 0,
        result: null,
        error: null,
        label,
        firstUnknownAt: null,
      });
      notify(startPath);
    },

    cancelJob(startPath) {
      const entry = jobsRef.current.get(startPath);
      if (entry) {
        if (entry.status === 'pending') {
          void cancelServerJob(entry.jobId);
        }
        jobsRef.current.delete(startPath);
        notify(startPath);
      }
    },

    recordJobError(startPath, error, label) {
      jobsRef.current.set(startPath, {
        jobId: '__error',
        startPath,
        status: 'error',
        partialTail: '',
        charsReceived: 0,
        result: null,
        error,
        label,
        firstUnknownAt: null,
      });
      notify(startPath);
    },

    getEntry(startPath) {
      return jobsRef.current.get(startPath);
    },

    getAllEntries() {
      return Array.from(jobsRef.current.values());
    },

    subscribe(startPath, cb) {
      if (!listenersRef.current.has(startPath)) {
        listenersRef.current.set(startPath, new Set());
      }
      listenersRef.current.get(startPath)!.add(cb);
      return () => {
        listenersRef.current.get(startPath)?.delete(cb);
      };
    },

    subscribeToAny(cb) {
      anyListenersRef.current.add(cb);
      return () => {
        anyListenersRef.current.delete(cb);
      };
    },
  }).current;

  useEffect(() => {
    const interval = setInterval(async () => {
      for (const [startPath, entry] of jobsRef.current) {
        if (entry.status !== 'pending') continue;

        try {
          const headers = await buildPollHeaders();
          const res = await fetch(`${POLL_BASE_PATH}/${entry.jobId}`, {
            method: 'GET',
            headers,
            credentials: 'include',
          });

          if (!res.ok) {
            if (res.status === 401 && _onUnauthorized) {
              try { _onUnauthorized(); } catch { /* ignore */ }
            }
            if (res.status === 402 && _onPaymentRequired) {
              try { _onPaymentRequired({ url: `${POLL_BASE_PATH}/${entry.jobId}` }); } catch { /* ignore */ }
            }
            entry.status = 'error';
            entry.error = new Error(`Poll failed (${res.status})`);
            notify(startPath);
            continue;
          }

          const snap = (await res.json()) as {
            status: 'pending' | 'done' | 'error' | 'unknown';
            partialTail?: string;
            charsReceived?: number;
            result?: unknown;
            errorMessage?: string;
          };

          if (snap.status === 'unknown') {
            if (entry.firstUnknownAt === null) {
              entry.firstUnknownAt = Date.now();
            } else if (Date.now() - entry.firstUnknownAt > UNKNOWN_TOLERANCE_MS) {
              entry.status = 'error';
              entry.error = new Error('Lost track of this generation. Please try again.');
              notify(startPath);
            }
            continue;
          }
          entry.firstUnknownAt = null;

          if (typeof snap.partialTail === 'string') {
            entry.partialTail = snap.partialTail.slice(-PARTIAL_TAIL_CAP);
          }
          if (typeof snap.charsReceived === 'number') {
            entry.charsReceived = snap.charsReceived;
          }

          if (snap.status === 'done') {
            entry.status = 'done';
            entry.result = snap.result ?? null;
            try { _onJobComplete?.(entry); } catch { /* ignore */ }
            notify(startPath);
          } else if (snap.status === 'error') {
            entry.status = 'error';
            entry.error = new Error(snap.errorMessage || 'Generation failed.');
            notify(startPath);
          } else {
            notify(startPath);
          }
        } catch {
          /* network error – will retry on next tick */
        }
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  return (
    <GenerationJobStoreCtx.Provider value={storeValue}>
      {children}
    </GenerationJobStoreCtx.Provider>
  );
}

export function useGenerationJobStore(): GenerationJobStoreValue {
  const ctx = useContext(GenerationJobStoreCtx);
  if (!ctx) {
    throw new Error('useGenerationJobStore must be used within GenerationJobStoreProvider');
  }
  return ctx;
}

export function useGenerationJob(startPath: string): JobEntry | undefined {
  const store = useGenerationJobStore();
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => store.subscribe(startPath, rerender), [store, startPath]);
  return store.getEntry(startPath);
}

export function useAnyPendingGenerationJobs(): JobEntry[] {
  const store = useGenerationJobStore();
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => store.subscribeToAny(rerender), [store]);
  return store.getAllEntries().filter((e) => e.status === 'pending');
}
