import { useMemo, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import {
  useListSermonResources,
  useCreateSermonResource,
  useUpdateSermonResource,
  useDeleteSermonResource,
  type SermonResource,
} from '@workspace/api-client-react';
import { toast } from 'sonner';
import { Plus, Search, BookOpen, Link as LinkIcon, X, Trash2, Pencil, Save } from 'lucide-react';
import { ScholarlySourcesPanel } from '../components/ScholarlySourcesPanel';

const RESOURCE_TYPES = [
  { value: 'commentary', label: 'Commentary' },
  { value: 'journal', label: 'Journal article' },
  { value: 'book', label: 'Book' },
  { value: 'sermon', label: 'Sermon' },
  { value: 'lexicon', label: 'Lexicon / word study' },
  { value: 'web', label: 'Web' },
  { value: 'note', label: 'Personal note' },
  { value: 'other', label: 'Other' },
];

type Draft = {
  id?: number;
  resourceType: string;
  title: string;
  author: string;
  publisher: string;
  year: string;
  pageOrLocation: string;
  url: string;
  excerpt: string;
  summary: string;
  notes: string;
  relatedPassage: string;
  tagsText: string;
};

const blankDraft = (): Draft => ({
  resourceType: 'commentary',
  title: '',
  author: '',
  publisher: '',
  year: '',
  pageOrLocation: '',
  url: '',
  excerpt: '',
  summary: '',
  notes: '',
  relatedPassage: '',
  tagsText: '',
});

function fromResource(r: SermonResource): Draft {
  return {
    id: r.id,
    resourceType: r.resourceType,
    title: r.title,
    author: r.author,
    publisher: r.publisher,
    year: r.year,
    pageOrLocation: r.pageOrLocation,
    url: r.url,
    excerpt: r.excerpt,
    summary: r.summary,
    notes: r.notes,
    relatedPassage: r.relatedPassage,
    tagsText: r.tags.join(', '),
  };
}

function tagsFromText(s: string): string[] {
  return s.split(',').map((t) => t.trim()).filter(Boolean);
}

export default function ResourceLibrary() {
  const list = useListSermonResources();
  const createResource = useCreateSermonResource();
  const updateResource = useUpdateSermonResource();
  const deleteResource = useDeleteSermonResource();

  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = list.data ?? [];
    if (!q) return items;
    return items.filter((r) => {
      const hay = [r.title, r.author, r.relatedPassage, r.excerpt, r.summary, ...r.tags].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [list.data, search]);

  const openNew = () => {
    setDraft(blankDraft());
    setEditorOpen(true);
  };

  const openEdit = (r: SermonResource) => {
    setDraft(fromResource(r));
    setEditorOpen(true);
  };

  const save = () => {
    if (!draft.title.trim()) {
      toast.error('A title is required.');
      return;
    }
    const payload = {
      resourceType: draft.resourceType,
      title: draft.title.trim(),
      author: draft.author,
      publisher: draft.publisher,
      year: draft.year,
      pageOrLocation: draft.pageOrLocation,
      url: draft.url,
      excerpt: draft.excerpt,
      summary: draft.summary,
      notes: draft.notes,
      relatedPassage: draft.relatedPassage,
      tags: tagsFromText(draft.tagsText),
    };
    if (draft.id) {
      updateResource.mutate(
        { id: draft.id, data: payload },
        {
          onSuccess: () => {
            toast.success('Resource updated');
            setEditorOpen(false);
          },
          onError: () => toast.error('Failed to save resource'),
        },
      );
    } else {
      createResource.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast.success('Resource added');
            setEditorOpen(false);
          },
          onError: () => toast.error('Failed to save resource'),
        },
      );
    }
  };

  const remove = (r: SermonResource) => {
    if (!window.confirm(`Delete "${r.title}"?`)) return;
    deleteResource.mutate(
      { id: r.id },
      {
        onSuccess: () => toast.success('Resource deleted'),
        onError: () => toast.error('Failed to delete resource'),
      },
    );
  };

  return (
    <AppLayout title="Resource Library">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-serif text-[var(--worship-navy)]">Resource Library</h1>
          <p className="text-sm mt-1 text-[var(--worship-slate)] max-w-2xl">
            Everything the Sermon Builder is allowed to quote on your behalf, with attribution. Toggle which bundled public-domain commentaries it may consult, and save your own commentary excerpts, articles, and sermons below.
          </p>
        </div>

        <section id="commentaries" className="mb-10 scroll-mt-24">
          <div className="mb-3">
            <h2 className="text-xl font-serif text-[var(--worship-navy)]">Public-domain commentaries</h2>
            <p className="text-xs text-[var(--worship-slate)] mt-1 max-w-2xl">
              Bundled sources the Sermon Builder may quietly consult on your behalf. Toggle any source off to keep it out of generated content.
            </p>
          </div>
          <ScholarlySourcesPanel />
        </section>

        <section id="my-resources" className="scroll-mt-24">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-3">
            <div>
              <h2 className="text-xl font-serif text-[var(--worship-navy)]">My resources</h2>
              <p className="text-xs text-[var(--worship-slate)] mt-1 max-w-2xl">
                Your own saved commentary excerpts, journal articles, and sermons. The Sermon Builder will quote these with the attribution exactly as you saved it.
              </p>
            </div>
            <button onClick={openNew} className="worship-btn-gold px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 self-start md:self-auto">
              <Plus className="w-4 h-4" /> Add resource
            </button>
          </div>

        <div className="worship-card !p-3 mb-6 flex items-center gap-3">
          <Search className="w-4 h-4 text-[var(--worship-muted-slate)] ml-2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, author, passage, tags…"
            className="flex-1 bg-transparent outline-none text-sm py-1.5"
          />
        </div>

        {list.isLoading ? (
          <div className="worship-card text-sm text-[var(--worship-slate)]">Loading resources…</div>
        ) : filtered.length === 0 ? (
          <div className="worship-card text-center py-16">
            <BookOpen className="w-12 h-12 mx-auto mb-3 text-[var(--worship-muted-slate)] opacity-60" />
            <h3 className="font-serif text-xl text-[var(--worship-navy)]">Your library is empty</h3>
            <p className="text-sm text-[var(--worship-slate)] mt-1 mb-5">Paste an excerpt from a commentary or article you trust to start building your reference set.</p>
            <button onClick={openNew} className="worship-btn-primary px-4 py-2 rounded-lg text-sm">Add your first resource</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((r) => (
              <div key={r.id} className="worship-card !p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--worship-gold)] font-bold mb-0.5">
                      {RESOURCE_TYPES.find((t) => t.value === r.resourceType)?.label ?? r.resourceType}
                    </div>
                    <h3 className="font-serif text-lg text-[var(--worship-navy)] leading-tight truncate">{r.title}</h3>
                    {(r.author || r.publisher || r.year) && (
                      <p className="text-xs text-[var(--worship-slate)] mt-0.5 truncate">
                        {[r.author, r.publisher, r.year].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-slate-100" title="Edit">
                      <Pencil className="w-4 h-4 text-[var(--worship-slate)]" />
                    </button>
                    <button onClick={() => remove(r)} className="p-1.5 rounded hover:bg-red-50" title="Delete">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
                {r.relatedPassage && (
                  <div className="text-xs"><span className="font-semibold text-[var(--worship-navy)]">Passage:</span> <span className="text-[var(--worship-slate)]">{r.relatedPassage}</span></div>
                )}
                {r.excerpt && (
                  <p className="text-sm text-[var(--worship-charcoal)] line-clamp-4 leading-relaxed bg-[var(--worship-cream)] rounded-md p-3 italic">
                    "{r.excerpt}"
                  </p>
                )}
                {r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.tags.map((t) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--worship-sand)] text-[var(--worship-navy)]">{t}</span>
                    ))}
                  </div>
                )}
                {r.url && (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--worship-gold)] hover:underline flex items-center gap-1">
                    <LinkIcon className="w-3 h-3" /> Open source
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
        </section>
      </div>

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center bg-black/40 p-0 md:p-6" onClick={() => setEditorOpen(false)}>
          <div className="bg-white w-full md:max-w-2xl md:rounded-2xl shadow-xl flex flex-col max-h-screen md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--worship-border)' }}>
              <h2 className="font-serif text-xl text-[var(--worship-navy)]">{draft.id ? 'Edit resource' : 'Add resource'}</h2>
              <button onClick={() => setEditorOpen(false)} className="p-1.5 rounded hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto p-6 space-y-4 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">TYPE</label>
                  <select value={draft.resourceType} onChange={(e) => setDraft({ ...draft, resourceType: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }}>
                    {RESOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">RELATED PASSAGE</label>
                  <input value={draft.relatedPassage} onChange={(e) => setDraft({ ...draft, relatedPassage: e.target.value })} placeholder="e.g. John 1:1-14" className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">TITLE *</label>
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">AUTHOR</label>
                  <input value={draft.author} onChange={(e) => setDraft({ ...draft, author: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">PUBLISHER</label>
                  <input value={draft.publisher} onChange={(e) => setDraft({ ...draft, publisher: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">YEAR</label>
                  <input value={draft.year} onChange={(e) => setDraft({ ...draft, year: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">PAGE / LOCATION</label>
                  <input value={draft.pageOrLocation} onChange={(e) => setDraft({ ...draft, pageOrLocation: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">URL</label>
                <input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://…" className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">EXCERPT (the actual quoted text you want available to draw on)</label>
                <textarea value={draft.excerpt} onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })} rows={6} className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)] resize-y" style={{ borderColor: 'var(--worship-border)' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">SUMMARY</label>
                <textarea value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)] resize-y" style={{ borderColor: 'var(--worship-border)' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">NOTES</label>
                <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)] resize-y" style={{ borderColor: 'var(--worship-border)' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">TAGS (comma-separated)</label>
                <input value={draft.tagsText} onChange={(e) => setDraft({ ...draft, tagsText: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }} />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex items-center justify-end gap-2 bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }}>
              <button onClick={() => setEditorOpen(false)} className="px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--worship-border)' }}>Cancel</button>
              <button onClick={save} disabled={createResource.isPending || updateResource.isPending} className="worship-btn-primary px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-60">
                <Save className="w-4 h-4" /> {draft.id ? 'Save changes' : 'Add resource'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
