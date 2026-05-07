import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListScholarlySources,
  useUpdateScholarlySourcePreferences,
  getListScholarlySourcesQueryKey,
  type SourcesResponse,
} from '@workspace/api-client-react';
import { X, Loader2, Check, Plus, BookOpen } from 'lucide-react';
import { CoverageBadge } from './CoverageBadge';
import { toast } from 'sonner';

/**
 * Modal that lets the pastor pick which bundled public-domain commentaries
 * the Sermon Builder may consult on their behalf. Local pending state lets
 * them flip multiple rows freely, then commit once on Save (or revert via
 * Cancel). Save writes the full enabled-id list to the existing preferences
 * endpoint; the parent re-renders the My Resources list from the resulting
 * SourcesResponse.
 */
export function AddCommentaryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useListScholarlySources();
  const update = useUpdateScholarlySourcePreferences();

  // Local working copy: starts from the server's enabled ids when the modal
  // opens and flips on each Add/Remove click. Discarded on Cancel.
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && data) {
      setPending(new Set(data.enabledSourceIds));
    }
  }, [open, data]);

  const initial = useMemo(
    () => new Set(data?.enabledSourceIds ?? []),
    [data],
  );
  const dirty = useMemo(() => {
    if (pending.size !== initial.size) return true;
    for (const id of pending) if (!initial.has(id)) return true;
    return false;
  }, [pending, initial]);

  if (!open) return null;

  const toggle = (id: string) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = () => {
    const ids = Array.from(pending);
    update.mutate(
      { data: { enabledSourceIds: ids } },
      {
        onSuccess: (resp) => {
          qc.setQueryData(
            getListScholarlySourcesQueryKey(),
            resp as SourcesResponse,
          );
          toast.success('Commentaries updated');
          onClose();
        },
        onError: (err) => {
          toast.error(
            err instanceof Error
              ? err.message
              : 'Could not update commentaries — please try again.',
          );
        },
      },
    );
  };

  const cancel = () => {
    if (update.isPending) return;
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center bg-black/40 p-0 md:p-6"
      onClick={cancel}
    >
      <div
        className="bg-white w-full md:max-w-2xl md:rounded-2xl shadow-xl flex flex-col max-h-screen md:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add commentary"
      >
        <div
          className="px-6 py-4 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--worship-border)' }}
        >
          <div className="min-w-0">
            <h2 className="font-serif text-xl text-[var(--worship-navy)]">
              Add commentary
            </h2>
            <p className="text-xs text-[var(--worship-slate)] mt-0.5">
              Bundled public-domain commentaries the Sermon Builder will quote
              on your behalf, with attribution. Add the ones you trust.
            </p>
          </div>
          <button
            onClick={cancel}
            className="p-1.5 rounded hover:bg-slate-100 shrink-0 ml-2"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 flex-1">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--worship-slate)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading commentaries…
            </div>
          ) : error || !data ? (
            <div className="text-sm text-red-700">
              Could not load commentaries. Please close and try again.
            </div>
          ) : data.sources.length === 0 ? (
            <div className="text-sm text-[var(--worship-slate)] text-center py-8">
              <BookOpen className="w-10 h-10 mx-auto mb-3 text-[var(--worship-muted-slate)] opacity-60" />
              No bundled commentaries are available yet. We're adding more —
              check back soon.
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--worship-border)' }}>
              {data.sources.map((s) => {
                const isAdded = pending.has(s.id);
                return (
                  <li key={s.id} className="py-4 flex items-start gap-4 first:pt-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-[var(--worship-navy)]">
                          {s.title}
                        </span>
                        <CoverageBadge source={s} />
                      </div>
                      <p className="text-xs text-[var(--worship-slate)] mt-0.5">
                        {s.author} · {s.year}
                      </p>
                      <p className="text-sm text-[var(--worship-slate)] mt-1">
                        {s.description}
                      </p>
                      <a
                        href={s.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-xs text-[var(--worship-navy)] underline mt-1.5 inline-block"
                      >
                        Source · {s.license}
                      </a>
                    </div>
                    <button
                      onClick={() => toggle(s.id)}
                      aria-pressed={isAdded}
                      className={[
                        'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                        isAdded
                          ? 'bg-[var(--worship-navy)] text-white border-[var(--worship-navy)] hover:bg-[var(--worship-navy)]/90'
                          : 'bg-white text-[var(--worship-navy)] border-[var(--worship-border)] hover:bg-[var(--worship-cream)]',
                      ].join(' ')}
                    >
                      {isAdded ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Added
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" /> Add
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div
          className="px-6 py-4 border-t flex items-center justify-between gap-2 bg-[var(--worship-cream)]"
          style={{ borderColor: 'var(--worship-border)' }}
        >
          <span className="text-xs text-[var(--worship-slate)]">
            {pending.size} {pending.size === 1 ? 'commentary' : 'commentaries'} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={cancel}
              disabled={update.isPending}
              className="px-4 py-2 text-sm rounded-lg border disabled:opacity-60"
              style={{ borderColor: 'var(--worship-border)' }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!dirty || update.isPending}
              className="worship-btn-primary px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-60"
            >
              {update.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
