import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetSermonSeries,
  useUpdateSermonSeries,
  useDeleteSermonSeries,
  useCreateSermon,
  getGetSermonSeriesQueryKey,
  getListSermonSeriesQueryKey,
  type SermonSeriesWithSermons,
  type Sermon,
} from '@workspace/api-client-react';
import { AppLayout } from '../components/layout/AppLayout';
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  Layers,
  Lightbulb,
  Loader2,
  Plus,
  ScrollText,
  Save,
  Trash2,
} from 'lucide-react';

const STATUSES: Array<{ value: string; label: string }> = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'archived', label: 'Archived' },
];

type Draft = {
  title: string;
  summary: string;
  bigIdea: string;
  startDate: string;
  endDate: string;
  plannedSermonCount: string;
  status: string;
};

function fromSeries(s: SermonSeriesWithSermons): Draft {
  return {
    title: s.title,
    summary: s.summary,
    bigIdea: s.bigIdea,
    startDate: s.startDate ? s.startDate.slice(0, 10) : '',
    endDate: s.endDate ? s.endDate.slice(0, 10) : '',
    plannedSermonCount: s.plannedSermonCount != null ? String(s.plannedSermonCount) : '',
    status: s.status || 'planning',
  };
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString();
}

export default function SermonSeriesDetail() {
  const [, params] = useRoute('/sermons/series/:id');
  const id = params?.id ? Number(params.id) : null;
  const valid = id !== null && Number.isInteger(id);
  const seriesQuery = useGetSermonSeries(valid ? id! : 0);
  const update = useUpdateSermonSeries();
  const del = useDeleteSermonSeries();
  const createSermon = useCreateSermon();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [hydratedFor, setHydratedFor] = useState<number | null>(null);

  // Reset draft whenever the route id changes so we don't carry over
  // edits from a previously viewed series.
  useEffect(() => {
    setDraft(null);
    setHydratedFor(null);
  }, [id]);

  // Hydrate the editable draft once per series id, after the fetch lands.
  useEffect(() => {
    if (seriesQuery.data && hydratedFor !== seriesQuery.data.id) {
      setDraft(fromSeries(seriesQuery.data));
      setHydratedFor(seriesQuery.data.id);
    }
  }, [seriesQuery.data, hydratedFor]);

  const series: SermonSeriesWithSermons | null = seriesQuery.data ?? null;

  const orderedSermons: Sermon[] = useMemo(() => {
    return series?.sermons ?? [];
  }, [series]);

  const nextOrder = useMemo(() => {
    const used = orderedSermons
      .map((s) => s.seriesOrder)
      .filter((n): n is number => typeof n === 'number');
    if (used.length === 0) return 1;
    return Math.max(...used) + 1;
  }, [orderedSermons]);

  const save = async () => {
    if (!draft || !valid) return;
    if (!draft.title.trim()) {
      toast.error('Series needs a title');
      return;
    }
    try {
      const updated = await update.mutateAsync({
        id: id!,
        data: {
          title: draft.title.trim(),
          summary: draft.summary,
          bigIdea: draft.bigIdea,
          startDate: draft.startDate ? new Date(draft.startDate).toISOString() : null,
          endDate: draft.endDate ? new Date(draft.endDate).toISOString() : null,
          plannedSermonCount: draft.plannedSermonCount ? Number(draft.plannedSermonCount) : null,
          status: draft.status,
        },
      });
      // Merge the freshly updated series into the cache, preserving the
      // joined `sermons` array which the PATCH endpoint does not return.
      queryClient.setQueryData<SermonSeriesWithSermons>(
        getGetSermonSeriesQueryKey(id!),
        (prev) => ({ ...(prev ?? series ?? updated), ...updated, sermons: prev?.sermons ?? series?.sermons ?? [] } as SermonSeriesWithSermons),
      );
      toast.success('Series saved');
    } catch {
      toast.error('Failed to save series');
    }
  };

  const removeSeries = () => {
    if (!series || !valid) return;
    if (!window.confirm(`Delete "${series.title}"? Sermons inside will keep existing but lose their series link.`)) return;
    del.mutate(
      { id: id! },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: getListSermonSeriesQueryKey() });
          toast.success('Series deleted');
          setLocation('/sermons/series');
        },
        onError: () => toast.error('Failed to delete series'),
      },
    );
  };

  const addSermon = async () => {
    if (!series || !valid) return;
    try {
      const created = await createSermon.mutateAsync({
        data: {
          title: `${series.title} — week ${nextOrder}`,
          seriesId: id!,
          seriesOrder: nextOrder,
          series: series.title,
          status: 'draft',
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetSermonSeriesQueryKey(id!) });
      toast.success('Sermon added to series');
      setLocation(`/sermons/${created.id}`);
    } catch {
      toast.error('Could not create sermon');
    }
  };

  if (!valid) {
    return (
      <AppLayout title="Sermon Series">
        <div className="worship-card text-center py-16 max-w-xl mx-auto">
          <h2 className="font-serif text-xl text-[var(--worship-navy)]">That series link looks invalid.</h2>
          <Link href="/sermons/series" className="worship-btn-primary px-4 py-2 rounded-lg text-sm inline-block mt-4">
            Back to series
          </Link>
        </div>
      </AppLayout>
    );
  }

  if (seriesQuery.isLoading) {
    return (
      <AppLayout title="Sermon Series">
        <div className="flex items-center gap-2 text-[var(--worship-slate)]">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading series…
        </div>
      </AppLayout>
    );
  }

  if (!series || !draft) {
    return (
      <AppLayout title="Sermon Series">
        <div className="worship-card text-center py-16 max-w-xl mx-auto">
          <Layers className="w-10 h-10 mx-auto mb-3 text-[var(--worship-muted-slate)] opacity-60" />
          <h2 className="font-serif text-xl text-[var(--worship-navy)]">Series not found</h2>
          <p className="text-sm text-[var(--worship-slate)] mt-1">It may have been deleted.</p>
          <Link href="/sermons/series" className="worship-btn-primary px-4 py-2 rounded-lg text-sm inline-block mt-4">
            Back to series
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={series.title}>
      <div className="max-w-6xl mx-auto">
        <div className="mb-4">
          <Link href="/sermons/series" className="text-xs text-[var(--worship-slate)] hover:text-[var(--worship-navy)] flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> All series
          </Link>
        </div>
        <div className="flex flex-col xl:flex-row gap-6">
          {/* LEFT: editable series details */}
          <div className="w-full xl:w-[40%] xl:max-w-md worship-card !p-0 overflow-hidden self-start xl:sticky xl:top-8">
            <div className="p-5 border-b bg-white" style={{ borderColor: 'var(--worship-border)' }}>
              <div className="text-[10px] uppercase tracking-widest text-[var(--worship-gold)] font-bold mb-1">Series</div>
              <input
                className="w-full text-2xl font-serif text-[var(--worship-navy)] bg-transparent outline-none border-b border-transparent focus:border-[var(--worship-gold)]"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Series title"
              />
            </div>
            <div className="p-5 space-y-5 bg-white">
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">BIG IDEA</label>
                <textarea
                  rows={4}
                  value={draft.bigIdea}
                  onChange={(e) => setDraft({ ...draft, bigIdea: e.target.value })}
                  placeholder="The single overarching truth this series will preach across every sermon."
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)] resize-y"
                  style={{ borderColor: 'var(--worship-border)' }}
                />
                <p className="text-[10px] text-[var(--worship-muted-slate)] mt-1">
                  Becomes context for the Big Idea, Outline, and Manuscript generators inside every sermon in this series.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">SUMMARY</label>
                <textarea
                  rows={3}
                  value={draft.summary}
                  onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                  placeholder="Short pitch — what this series is about and why."
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
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">STATUS</label>
                  <select
                    value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]"
                    style={{ borderColor: 'var(--worship-border)' }}
                  >
                    {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t bg-[var(--worship-cream)] flex items-center gap-2" style={{ borderColor: 'var(--worship-border)' }}>
              <button
                onClick={save}
                disabled={update.isPending}
                className="worship-btn-primary px-4 py-2 rounded-lg text-sm flex-1 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save series
              </button>
              <button
                onClick={removeSeries}
                disabled={del.isPending}
                className="px-3 py-2 rounded-lg text-sm border flex items-center gap-1 text-red-600 hover:bg-red-50 disabled:opacity-60"
                style={{ borderColor: 'var(--worship-border)' }}
                title="Delete series"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* RIGHT: ordered sermons */}
          <div className="flex-1 worship-card !p-0 overflow-hidden">
            <div className="px-6 py-5 border-b bg-white flex items-center justify-between gap-3" style={{ borderColor: 'var(--worship-border)' }}>
              <div>
                <h2 className="font-serif text-xl text-[var(--worship-navy)]">Sermons in this series</h2>
                <p className="text-xs text-[var(--worship-slate)] mt-0.5">
                  Ordered by part number, then by date. Edit each sermon to set its part number.
                </p>
              </div>
              <button
                onClick={addSermon}
                disabled={createSermon.isPending}
                className="worship-btn-gold px-3 py-2 rounded-lg text-xs flex items-center gap-1 shrink-0 disabled:opacity-60"
              >
                <Plus className="w-3.5 h-3.5" /> Add sermon
              </button>
            </div>
            <div className="p-6">
              {orderedSermons.length === 0 ? (
                <div className="text-center py-12 px-6 border border-dashed rounded-xl bg-white" style={{ borderColor: 'var(--worship-border)' }}>
                  <ScrollText className="w-10 h-10 mx-auto mb-3 text-[var(--worship-muted-slate)] opacity-60" />
                  <p className="text-sm text-[var(--worship-slate)] mb-3">No sermons yet — add the first week to get started.</p>
                  <button onClick={addSermon} className="worship-btn-primary px-4 py-2 rounded-lg text-sm inline-flex items-center gap-1">
                    <Plus className="w-4 h-4" /> Add first sermon
                  </button>
                </div>
              ) : (
                <ol className="space-y-3">
                  {orderedSermons.map((s, i) => {
                    const partLabel = s.seriesOrder != null ? `Part ${s.seriesOrder}` : `#${i + 1}`;
                    return (
                      <li key={s.id}>
                        <Link
                          href={`/sermons/${s.id}`}
                          className="block p-4 rounded-xl border bg-white hover:bg-[var(--worship-cream)] transition-colors"
                          style={{ borderColor: 'var(--worship-border)' }}
                        >
                          <div className="flex items-start gap-4">
                            <div className="shrink-0 w-12 h-12 rounded-full bg-[var(--worship-pale-gold)] text-[var(--worship-gold)] font-bold flex items-center justify-center text-xs">
                              {s.seriesOrder ?? i + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] uppercase tracking-wider text-[var(--worship-gold)] font-bold">{partLabel}</span>
                                <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${s.status === 'complete' ? 'bg-[var(--worship-success)]/10 text-[var(--worship-success)]' : 'bg-[var(--worship-pale-gold)] text-[var(--worship-gold)]'}`}>
                                  {s.status}
                                </span>
                              </div>
                              <h3 className="font-serif text-lg text-[var(--worship-navy)] leading-snug mt-0.5">{s.title}</h3>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--worship-slate)] mt-1">
                                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {fmtDate(s.sermonDate)}</span>
                                {s.passage && <span>• {s.passage}</span>}
                              </div>
                              {s.bigIdea?.selected && (
                                <p className="text-xs text-[var(--worship-slate)] mt-2 line-clamp-2 italic flex items-start gap-1">
                                  <Lightbulb className="w-3 h-3 text-[var(--worship-gold)] mt-0.5 shrink-0" />
                                  {s.bigIdea.selected}
                                </p>
                              )}
                            </div>
                            <ChevronRight className="w-4 h-4 text-[var(--worship-muted-slate)] shrink-0 mt-2" />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
