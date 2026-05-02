import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListSermonSeries,
  useCreateSermonSeries,
  useDeleteSermonSeries,
  getListSermonSeriesQueryKey,
} from '@workspace/api-client-react';
import { AppLayout } from '../components/layout/AppLayout';
import {
  Plus,
  Search,
  Layers,
  Trash2,
  ExternalLink,
  Calendar,
  Lightbulb,
  X,
} from 'lucide-react';

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSpan(start: string | null | undefined, end: string | null | undefined): string | null {
  if (!start && !end) return null;
  if (start && end) return `${fmtDate(start)} → ${fmtDate(end)}`;
  if (start) return `Starts ${fmtDate(start)}`;
  return `Ends ${fmtDate(end)}`;
}

const STATUS_LABELS: Record<string, string> = {
  planning: 'Planning',
  active: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

export default function SermonSeriesArchive() {
  const queryClient = useQueryClient();
  const list = useListSermonSeries();
  const create = useCreateSermonSeries();
  const del = useDeleteSermonSeries();
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    summary: '',
    bigIdea: '',
    startDate: '',
    endDate: '',
    plannedSermonCount: '',
  });

  const filtered = useMemo(() => {
    const items = list.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => {
      const hay = [s.title, s.summary, s.bigIdea, ...s.tags].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [list.data, search]);

  const submitNew = async () => {
    if (!draft.title.trim()) {
      toast.error('Give your series a title');
      return;
    }
    try {
      await create.mutateAsync({
        data: {
          title: draft.title.trim(),
          summary: draft.summary.trim(),
          bigIdea: draft.bigIdea.trim(),
          startDate: draft.startDate ? new Date(draft.startDate).toISOString() : null,
          endDate: draft.endDate ? new Date(draft.endDate).toISOString() : null,
          plannedSermonCount: draft.plannedSermonCount ? Number(draft.plannedSermonCount) : null,
          status: 'planning',
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListSermonSeriesQueryKey() });
      toast.success('Series created');
      setDraft({ title: '', summary: '', bigIdea: '', startDate: '', endDate: '', plannedSermonCount: '' });
      setShowNew(false);
    } catch {
      toast.error('Could not create series');
    }
  };

  const remove = (id: number, title: string) => {
    if (!window.confirm(`Delete "${title}"? Sermons will stay but lose their series link.`)) return;
    del.mutate(
      { id },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: getListSermonSeriesQueryKey() });
          toast.success('Series deleted');
        },
        onError: () => toast.error('Failed to delete series'),
      },
    );
  };

  return (
    <AppLayout title="Sermon Series">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-serif text-[var(--worship-navy)]">Sermon Series</h1>
            <p className="text-sm mt-1 text-[var(--worship-slate)] max-w-xl">
              Group multi-week sermons under one big idea. The big idea you set here becomes context for every sermon you write inside the series.
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="worship-btn-gold px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 self-start md:self-auto"
          >
            <Plus className="w-4 h-4" /> New series
          </button>
        </div>

        <div className="worship-card !p-3 mb-6 flex items-center gap-3">
          <Search className="w-4 h-4 text-[var(--worship-muted-slate)] ml-2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, big idea, summary…"
            className="flex-1 bg-transparent outline-none text-sm py-1.5"
          />
        </div>

        {list.isLoading ? (
          <div className="worship-card text-sm text-[var(--worship-slate)]">Loading series…</div>
        ) : filtered.length === 0 ? (
          <div className="worship-card text-center py-16">
            <Layers className="w-12 h-12 mx-auto mb-3 text-[var(--worship-muted-slate)] opacity-60" />
            <h3 className="font-serif text-xl text-[var(--worship-navy)]">No series yet</h3>
            <p className="text-sm text-[var(--worship-slate)] mt-1 mb-5 max-w-md mx-auto">
              Series let you anchor several weeks of sermons to one overarching truth. Start one and the Builder will offer it as a "Part of series" option.
            </p>
            <button onClick={() => setShowNew(true)} className="worship-btn-primary px-4 py-2 rounded-lg text-sm inline-block">
              Plan a series
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((s) => {
              const span = formatSpan(s.startDate, s.endDate);
              return (
                <div key={s.id} className="worship-card !p-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--worship-gold)] font-bold mb-0.5">Series</div>
                      <h3 className="font-serif text-lg text-[var(--worship-navy)] leading-tight">{s.title}</h3>
                      {s.summary && (
                        <p className="text-xs text-[var(--worship-slate)] mt-1 line-clamp-2">{s.summary}</p>
                      )}
                    </div>
                    <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full font-semibold shrink-0 bg-[var(--worship-pale-gold)] text-[var(--worship-gold)]">
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                  </div>
                  {s.bigIdea && (
                    <div className="p-2.5 rounded-lg bg-[var(--worship-cream)] border" style={{ borderColor: 'var(--worship-border)' }}>
                      <div className="flex items-start gap-2">
                        <Lightbulb className="w-3.5 h-3.5 text-[var(--worship-gold)] mt-0.5 shrink-0" />
                        <p className="text-xs text-[var(--worship-charcoal)] leading-relaxed line-clamp-3">{s.bigIdea}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--worship-slate)]">
                    {span && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {span}</span>}
                    {s.plannedSermonCount != null && <span>• {s.plannedSermonCount} weeks planned</span>}
                  </div>
                  {s.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {s.tags.map((t) => (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--worship-sand)] text-[var(--worship-navy)]">{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <Link
                      href={`/sermons/series/${s.id}`}
                      className="worship-btn-primary px-3 py-1.5 rounded-lg text-xs flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open series
                    </Link>
                    <button
                      onClick={() => remove(s.id, s.title)}
                      className="px-3 py-1.5 rounded-lg text-xs border flex items-center gap-1 text-red-600 hover:bg-red-50 ml-auto"
                      style={{ borderColor: 'var(--worship-border)' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center bg-black/40 p-0 md:p-6" onClick={() => setShowNew(false)}>
          <div className="bg-white w-full md:max-w-lg md:rounded-2xl shadow-xl flex flex-col max-h-screen md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--worship-border)' }}>
              <h2 className="font-serif text-xl text-[var(--worship-navy)]">Plan a new series</h2>
              <button onClick={() => setShowNew(false)} className="p-1.5 rounded hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">TITLE *</label>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="e.g. Romans: Good News for the Restless"
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]"
                  style={{ borderColor: 'var(--worship-border)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">BIG IDEA</label>
                <textarea
                  rows={3}
                  value={draft.bigIdea}
                  onChange={(e) => setDraft({ ...draft, bigIdea: e.target.value })}
                  placeholder="The single overarching truth this series will preach across every sermon."
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)] resize-y"
                  style={{ borderColor: 'var(--worship-border)' }}
                />
                <p className="text-[10px] text-[var(--worship-muted-slate)] mt-1">
                  Used as context for every Big Idea / Outline / Manuscript generation inside this series.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">SUMMARY</label>
                <textarea
                  rows={3}
                  value={draft.summary}
                  onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                  placeholder="Short pitch for your congregation — what this series is about, why now."
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)] resize-y"
                  style={{ borderColor: 'var(--worship-border)' }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">START</label>
                  <input
                    type="date"
                    value={draft.startDate}
                    onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]"
                    style={{ borderColor: 'var(--worship-border)' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">END</label>
                  <input
                    type="date"
                    value={draft.endDate}
                    onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]"
                    style={{ borderColor: 'var(--worship-border)' }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">PLANNED WEEKS</label>
                <input
                  type="number"
                  min={1}
                  value={draft.plannedSermonCount}
                  onChange={(e) => setDraft({ ...draft, plannedSermonCount: e.target.value })}
                  placeholder="e.g. 6"
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]"
                  style={{ borderColor: 'var(--worship-border)' }}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-[var(--worship-cream)] flex items-center justify-end gap-2" style={{ borderColor: 'var(--worship-border)' }}>
              <button onClick={() => setShowNew(false)} className="px-3 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--worship-border)' }}>
                Cancel
              </button>
              <button
                onClick={submitNew}
                disabled={create.isPending || !draft.title.trim()}
                className="worship-btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-60"
              >
                {create.isPending ? 'Creating…' : 'Create series'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
