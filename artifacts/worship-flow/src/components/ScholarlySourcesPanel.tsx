import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListScholarlySources,
  useUpdateScholarlySourcePreferences,
  getListScholarlySourcesQueryKey,
  type SourcesResponse,
} from '@workspace/api-client-react';
import { BookOpen, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Settings panel: per-user toggles for which bundled public-domain
 * commentaries the Sermon Builder should consult automatically.
 *
 * Mutation is fire-and-forget with optimistic UI: clicking a row flips
 * the chip immediately and writes to the server in the background;
 * we revert on error and show a toast.
 */
export function ScholarlySourcesPanel() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useListScholarlySources();
  const update = useUpdateScholarlySourcePreferences();
  // Pending overlay so that clicking multiple rows in quick succession feels
  // instant — we keep the last-known good "ground truth" in the server data
  // and overlay the in-flight optimistic set on top.
  const [optimistic, setOptimistic] = useState<Set<string> | null>(null);

  const enabled = useMemo<Set<string>>(() => {
    if (optimistic) return optimistic;
    return new Set(data?.enabledSourceIds ?? []);
  }, [optimistic, data]);

  const queryKey = getListScholarlySourcesQueryKey();
  // Monotonic request token: only the response from the most recent toggle
  // is allowed to clear the optimistic overlay or write canonical state.
  // This prevents stale responses from clobbering newer user intent when
  // the user toggles multiple rows in quick succession.
  const reqSeq = useRef(0);
  const lastSettled = useRef(0);

  const toggle = (sourceId: string) => {
    const next = new Set(enabled);
    if (next.has(sourceId)) next.delete(sourceId);
    else next.add(sourceId);
    setOptimistic(next);
    const token = ++reqSeq.current;
    update.mutate(
      { data: { enabledSourceIds: Array.from(next) } },
      {
        onSuccess: (resp) => {
          if (token < lastSettled.current) return;
          lastSettled.current = token;
          if (token === reqSeq.current) {
            qc.setQueryData(queryKey, resp as SourcesResponse);
            setOptimistic(null);
          } else {
            // A newer toggle is still in flight — write server data through
            // but keep the optimistic overlay until the latest request lands.
            qc.setQueryData(queryKey, resp as SourcesResponse);
          }
        },
        onError: (err) => {
          if (token < lastSettled.current) return;
          lastSettled.current = token;
          if (token === reqSeq.current) {
            setOptimistic(null);
            void qc.invalidateQueries({ queryKey });
          }
          toast.error(
            err instanceof Error
              ? err.message
              : 'Could not update sources — please try again.',
          );
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="worship-card flex items-center gap-2 text-sm text-[var(--worship-slate)]">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading scholarly sources…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="worship-card text-sm text-red-700">
        Could not load scholarly sources. Please refresh.
      </div>
    );
  }

  const enabledCount = enabled.size;
  return (
    <div className="worship-card space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--worship-cream)] flex items-center justify-center text-[var(--worship-navy)] shrink-0">
          <BookOpen className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-medium text-[var(--worship-navy)]">
            Scholarly Sources
          </h2>
          <p className="text-sm text-[var(--worship-slate)] mt-0.5">
            Public-domain commentaries the Sermon Builder may quietly consult
            on your behalf. Toggle any source off to keep it out of generated
            content. {enabledCount} of {data.sources.length} sources active.
          </p>
        </div>
      </div>

      <ul className="divide-y border-t border-[var(--worship-border)]">
        {data.sources.map((s) => {
          const isOn = enabled.has(s.id);
          return (
            <li
              key={s.id}
              className="py-3 flex items-start gap-3"
            >
              <button
                onClick={() => toggle(s.id)}
                aria-pressed={isOn}
                aria-label={`${isOn ? 'Disable' : 'Enable'} ${s.title}`}
                className={[
                  'mt-0.5 shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                  isOn
                    ? 'bg-[var(--worship-navy)] text-white border-[var(--worship-navy)]'
                    : 'bg-white text-[var(--worship-slate)] border-[var(--worship-border)] hover:bg-[var(--worship-cream)]',
                ].join(' ')}
              >
                {isOn ? <Check className="w-3 h-3" /> : null}
                {isOn ? 'On' : 'Off'}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-medium text-[var(--worship-navy)]">
                    {s.title}
                  </span>
                  <span className="text-xs text-[var(--worship-slate)]">
                    {s.author} · {s.year}
                  </span>
                </div>
                <p className="text-sm text-[var(--worship-slate)] mt-0.5">
                  {s.description}
                </p>
                <a
                  href={s.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-xs text-[var(--worship-navy)] underline mt-1 inline-block"
                >
                  Source · {s.license}
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
