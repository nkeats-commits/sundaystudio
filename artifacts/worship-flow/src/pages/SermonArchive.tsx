import { useMemo, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { Link, useLocation } from 'wouter';
import {
  useListSermons,
  useDeleteSermon,
  useDuplicateSermon,
  useListServicesLinkedToSermon,
} from '@workspace/api-client-react';
import { toast } from 'sonner';
import { Plus, Search, ScrollText, Copy, Trash2, ExternalLink, Calendar, Layers, Link2 } from 'lucide-react';

/**
 * Tiny per-card badge showing how many service plans link to this sermon.
 * Each card fires its own query — fine at this scale (typically <50 cards)
 * and React Query dedupes/caches identical keys.
 */
function UsedInBadge({ sermonId }: { sermonId: number }) {
  const q = useListServicesLinkedToSermon(sermonId);
  const count = q.data?.length ?? 0;
  if (q.isLoading || count === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--worship-pale-gold)] text-[var(--worship-gold)] font-bold"
      title={q.data?.map((s) => s.title).join(', ')}
    >
      <Link2 className="w-3 h-3" /> Used in {count} {count === 1 ? 'service' : 'services'}
    </span>
  );
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString();
}

export default function SermonArchive() {
  const list = useListSermons();
  const del = useDeleteSermon();
  const dup = useDuplicateSermon();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const items = list.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => {
      const hay = [s.title, s.passage, s.theme, s.series, s.occasion, ...s.tags].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [list.data, search]);

  const remove = (id: number, title: string) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    del.mutate(
      { id },
      {
        onSuccess: () => toast.success('Sermon deleted'),
        onError: () => toast.error('Failed to delete sermon'),
      },
    );
  };

  const duplicate = (id: number) => {
    dup.mutate(
      { id },
      {
        onSuccess: (s) => {
          toast.success('Sermon duplicated');
          setLocation(`/sermons/${s.id}`);
        },
        onError: () => toast.error('Failed to duplicate sermon'),
      },
    );
  };

  return (
    <AppLayout title="Sermon Archive">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-serif text-[var(--worship-navy)]">Sermon Archive</h1>
            <p className="text-sm mt-1 text-[var(--worship-slate)] max-w-xl">Every sermon you've drafted in the Builder lives here. Search, duplicate to start a follow-up, or jump back in.</p>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto">
            <Link
              href="/sermons/series"
              className="px-4 py-2.5 rounded-lg text-sm font-medium border bg-white text-[var(--worship-navy)] hover:bg-[var(--worship-cream)] flex items-center gap-2"
              style={{ borderColor: 'var(--worship-border)' }}
            >
              <Layers className="w-4 h-4" /> Series
            </Link>
            <Link href="/sermons/new" className="worship-btn-gold px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2">
              <Plus className="w-4 h-4" /> New sermon
            </Link>
          </div>
        </div>

        <div className="worship-card !p-3 mb-6 flex items-center gap-3">
          <Search className="w-4 h-4 text-[var(--worship-muted-slate)] ml-2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, passage, theme, series, tag…"
            className="flex-1 bg-transparent outline-none text-sm py-1.5"
          />
        </div>

        {list.isLoading ? (
          <div className="worship-card text-sm text-[var(--worship-slate)]">Loading sermons…</div>
        ) : filtered.length === 0 ? (
          <div className="worship-card text-center py-16">
            <ScrollText className="w-12 h-12 mx-auto mb-3 text-[var(--worship-muted-slate)] opacity-60" />
            <h3 className="font-serif text-xl text-[var(--worship-navy)]">No sermons yet</h3>
            <p className="text-sm text-[var(--worship-slate)] mt-1 mb-5">Open the Sermon Builder to start your first one.</p>
            <Link href="/sermons/new" className="worship-btn-primary px-4 py-2 rounded-lg text-sm inline-block">Open Sermon Builder</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((s) => (
              <div key={s.id} className="worship-card !p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {s.series && (
                      <div className="text-[10px] uppercase tracking-wider text-[var(--worship-gold)] font-bold mb-0.5">{s.series}</div>
                    )}
                    <h3 className="font-serif text-lg text-[var(--worship-navy)] leading-tight">{s.title}</h3>
                    {s.passage && <p className="text-xs text-[var(--worship-slate)] mt-1">{s.passage}</p>}
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full font-semibold shrink-0 ${s.status === 'complete' ? 'bg-[var(--worship-success)]/10 text-[var(--worship-success)]' : 'bg-[var(--worship-pale-gold)] text-[var(--worship-gold)]'}`}>{s.status}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--worship-slate)]">
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {fmtDate(s.sermonDate)}</span>
                  {s.theme && <span>• {s.theme}</span>}
                  {s.bigIdea?.selected && <span className="line-clamp-1">• {s.bigIdea.selected}</span>}
                </div>
                <UsedInBadge sermonId={s.id} />
                {s.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {s.tags.map((t) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--worship-sand)] text-[var(--worship-navy)]">{t}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <Link href={`/sermons/${s.id}`} className="worship-btn-primary px-3 py-1.5 rounded-lg text-xs flex items-center gap-1">
                    <ExternalLink className="w-3.5 h-3.5" /> Open
                  </Link>
                  <button onClick={() => duplicate(s.id)} className="px-3 py-1.5 rounded-lg text-xs border flex items-center gap-1 hover:bg-slate-50" style={{ borderColor: 'var(--worship-border)' }}>
                    <Copy className="w-3.5 h-3.5" /> Duplicate
                  </button>
                  <button onClick={() => remove(s.id, s.title)} className="px-3 py-1.5 rounded-lg text-xs border flex items-center gap-1 text-red-600 hover:bg-red-50 ml-auto" style={{ borderColor: 'var(--worship-border)' }}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
