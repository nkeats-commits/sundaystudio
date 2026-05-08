import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import { AppLayout } from '../components/layout/AppLayout';
import {
  useListSermonResources,
  useCreateSermonResource,
  useUpdateSermonResource,
  useDeleteSermonResource,
  useListScholarlySources,
  useUpdateScholarlySourcePreferences,
  getListSermonResourcesQueryKey,
  getListScholarlySourcesQueryKey,
  type SermonResource,
  type ScholarlySourceManifest,
  type SourcesResponse,
} from '@workspace/api-client-react';
import { toast } from 'sonner';
import {
  Plus,
  Search,
  BookOpen,
  Link as LinkIcon,
  X,
  Trash2,
  Pencil,
  Save,
  ShieldCheck,
  Upload,
  Globe,
  Loader2,
} from 'lucide-react';
import { AddCommentaryModal } from '../components/AddCommentaryModal';
import { CoverageBadge } from '../components/CoverageBadge';

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

  const sources = useListScholarlySources();
  const updateSources = useUpdateScholarlySourcePreferences();
  const qc = useQueryClient();
  const { getToken } = useAuth();

  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [addCommentaryOpen, setAddCommentaryOpen] = useState(false);

  // Loading states for the two utility actions
  const [extracting, setExtracting] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close modal on Escape key
  useEffect(() => {
    if (!editorOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditorOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editorOpen]);

  // wouter's <Link> uses pushState for navigation, which preserves any
  // `#hash` in the URL but does NOT trigger native fragment scrolling.
  // This effect reads the current hash on mount and on hash/location
  // changes, then scrolls the matching section into view so deep links
  // from the Sermon Builder chip and Settings card actually land on
  // #commentaries.
  const [location] = useLocation();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const el = document.getElementById(hash);
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [location]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Virtual "added commentary" rows derived from the bundled-source registry
  // intersected with the user's enabled-id list. These are rendered inside
  // My Resources alongside real saved excerpts, but are NOT editable — the
  // actual quoted text is fetched per-passage at sermon-generation time.
  const addedCommentaries: ScholarlySourceManifest[] = useMemo(() => {
    if (!sources.data) return [];
    const enabled = new Set(sources.data.enabledSourceIds);
    return sources.data.sources.filter((s) => enabled.has(s.id));
  }, [sources.data]);
  const totalCommentaries = sources.data?.sources.length ?? 0;

  const filteredSaved = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = list.data ?? [];
    if (!q) return items;
    return items.filter((r) => {
      const hay = [r.title, r.author, r.relatedPassage, r.excerpt, r.summary, ...r.tags].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [list.data, search]);

  const filteredCommentaries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return addedCommentaries;
    return addedCommentaries.filter((s) => {
      const hay = [s.title, s.author, s.year, s.description, s.license].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [addedCommentaries, search]);

  const totalRows = filteredSaved.length + filteredCommentaries.length;

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
            void qc.invalidateQueries({ queryKey: getListSermonResourcesQueryKey() });
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
            void qc.invalidateQueries({ queryKey: getListSermonResourcesQueryKey() });
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
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getListSermonResourcesQueryKey() });
          toast.success('Resource deleted');
        },
        onError: () => toast.error('Failed to delete resource'),
      },
    );
  };

  const removeCommentary = (s: ScholarlySourceManifest) => {
    if (!sources.data) return;
    if (
      !window.confirm(
        `Remove "${s.title}"? The Sermon Builder will stop quoting it on your behalf. You can add it back any time.`,
      )
    ) {
      return;
    }
    const next = sources.data.enabledSourceIds.filter((id) => id !== s.id);
    updateSources.mutate(
      { data: { enabledSourceIds: next } },
      {
        onSuccess: (resp) => {
          qc.setQueryData(
            getListScholarlySourcesQueryKey(),
            resp as SourcesResponse,
          );
          toast.success(`Removed ${s.title}`);
        },
        onError: (err) => {
          toast.error(
            err instanceof Error
              ? err.message
              : 'Could not remove that commentary — please try again.',
          );
        },
      },
    );
  };

  // ── Task #77: Upload a PDF or .txt file and extract its text ───────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    if (!file) return;

    const allowed = ['application/pdf', 'text/plain'];
    if (!allowed.includes(file.type)) {
      toast.error('Only PDF and plain-text (.txt) files are supported.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be 5 MB or smaller.');
      return;
    }

    setExtracting(true);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', file);
      const resp = await fetch('/api/sermon-resources/extract-text', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
        body: formData,
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server error (${resp.status})`);
      }
      const { text } = await resp.json() as { text: string };
      setDraft((d) => ({ ...d, excerpt: text }));
      toast.success('Text extracted — review and trim as needed.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to extract text from file.');
    } finally {
      setExtracting(false);
    }
  };

  // ── Task #78: Fetch webpage content from the URL field ────────────────────
  const handleFetchUrl = async () => {
    if (!draft.url.trim()) return;
    setFetchingUrl(true);
    try {
      const token = await getToken();
      const resp = await fetch('/api/sermon-resources/fetch-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ url: draft.url.trim() }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server error (${resp.status})`);
      }
      const data = await resp.json() as { title: string; author: string; text: string };
      setDraft((d) => ({
        ...d,
        title: d.title.trim() || data.title,
        author: d.author.trim() || data.author,
        excerpt: d.excerpt.trim() || data.text,
      }));
      toast.success('Page content fetched — review and trim as needed.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch page content.');
    } finally {
      setFetchingUrl(false);
    }
  };

  return (
    <AppLayout title="Resource Library">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-serif text-[var(--worship-navy)]">Resource Library</h1>
          <p className="text-sm mt-1 text-[var(--worship-slate)] max-w-2xl">
            Everything the Sermon Builder is allowed to quote on your behalf, with attribution. Add bundled public-domain commentaries below, and save your own commentary excerpts, articles, and sermons.
          </p>
        </div>

        <section id="commentaries" className="mb-10 scroll-mt-24">
          <div className="worship-card flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <BookOpen className="w-5 h-5 text-[var(--worship-gold)] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h2 className="text-lg font-serif text-[var(--worship-navy)]">Public-domain commentaries</h2>
                <p className="text-xs text-[var(--worship-slate)] mt-1 max-w-2xl">
                  Bundled, attribution-ready works the Sermon Builder may quietly consult. Pick the ones you trust — they'll appear as rows below.
                  {' '}
                  {sources.data ? (
                    <span className="text-[var(--worship-navy)] font-medium">
                      {addedCommentaries.length} of {totalCommentaries} added.
                    </span>
                  ) : null}
                  {' '}
                  <span className="text-[var(--worship-muted-slate)]">
                    Up to ~300 words of scholarly context per generation, shared across all active sources.
                  </span>
                </p>
              </div>
            </div>
            <button
              onClick={() => setAddCommentaryOpen(true)}
              disabled={updateSources.isPending}
              title={updateSources.isPending ? 'Saving previous change…' : undefined}
              className="worship-btn-primary px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 self-start md:self-auto shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" /> Add commentary
            </button>
          </div>
        </section>

        <section id="my-resources" className="scroll-mt-24">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-3">
            <div>
              <h2 className="text-xl font-serif text-[var(--worship-navy)]">My resources</h2>
              <p className="text-xs text-[var(--worship-slate)] mt-1 max-w-2xl">
                Added commentaries and your own saved excerpts, all in one place. The Sermon Builder will quote any of these with attribution.
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

        {list.isLoading || sources.isLoading ? (
          <div className="worship-card text-sm text-[var(--worship-slate)]">Loading resources…</div>
        ) : totalRows === 0 ? (
          <div className="worship-card text-center py-16">
            <BookOpen className="w-12 h-12 mx-auto mb-3 text-[var(--worship-muted-slate)] opacity-60" />
            <h3 className="font-serif text-xl text-[var(--worship-navy)]">Your library is empty</h3>
            <p className="text-sm text-[var(--worship-slate)] mt-1 mb-5 max-w-md mx-auto">
              Add a bundled public-domain commentary above, or paste an excerpt from a commentary or article you trust to start building your reference set.
            </p>
            <button onClick={openNew} className="worship-btn-primary px-4 py-2 rounded-lg text-sm">Add your first resource</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredCommentaries.map((s) => (
              <div
                key={`pd:${s.id}`}
                className="worship-card !p-5 flex flex-col gap-3 border-l-4"
                style={{ borderLeftColor: 'var(--worship-gold)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--worship-gold)] font-bold mb-0.5 flex items-center gap-1.5">
                      <ShieldCheck className="w-3 h-3" /> Public domain · auto-consulted
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <h3 className="font-serif text-lg text-[var(--worship-navy)] leading-tight">
                        {s.title}
                      </h3>
                      <CoverageBadge source={s} />
                    </div>
                    <p className="text-xs text-[var(--worship-slate)] mt-0.5 truncate">
                      {[s.author, s.year].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => removeCommentary(s)}
                      disabled={updateSources.isPending}
                      className="p-1.5 rounded hover:bg-red-50 disabled:opacity-50"
                      title="Remove from library"
                      aria-label={`Remove ${s.title}`}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-[var(--worship-charcoal)] leading-relaxed">
                  {s.description}
                </p>
                <p className="text-[11px] text-[var(--worship-slate)] italic">
                  The Sermon Builder will pull the matching chapter from this work for whatever passage you're preaching, and cite it inline.
                </p>
                {s.sourceUrl && (
                  <a
                    href={s.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--worship-gold)] hover:underline flex items-center gap-1"
                  >
                    <LinkIcon className="w-3 h-3" /> Source · {s.license}
                  </a>
                )}
              </div>
            ))}
            {filteredSaved.map((r) => (
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

      <AddCommentaryModal
        open={addCommentaryOpen}
        onClose={() => setAddCommentaryOpen(false)}
      />

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

              {/* URL field with "Fetch content" button — Task #78 */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">URL</label>
                <div className="flex gap-2">
                  <input
                    value={draft.url}
                    onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                    placeholder="https://…"
                    className="flex-1 px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]"
                    style={{ borderColor: 'var(--worship-border)' }}
                  />
                  {draft.url.trim() && (
                    <button
                      type="button"
                      onClick={handleFetchUrl}
                      disabled={fetchingUrl}
                      title="Fetch page content and pre-fill Excerpt"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium text-[var(--worship-navy)] bg-[var(--worship-cream)] hover:bg-[var(--worship-sand)] disabled:opacity-60 disabled:cursor-not-allowed shrink-0 transition-colors"
                      style={{ borderColor: 'var(--worship-border)' }}
                    >
                      {fetchingUrl ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Globe className="w-3.5 h-3.5" />
                      )}
                      {fetchingUrl ? 'Fetching…' : 'Fetch content'}
                    </button>
                  )}
                </div>
                {draft.url.trim() && (
                  <p className="text-[11px] text-[var(--worship-slate)] mt-1">
                    Fetch will pre-fill Title, Author, and Excerpt from the page. Existing values won't be overwritten.
                  </p>
                )}
              </div>

              {/* Excerpt field with "Upload file" button — Task #77 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-[var(--worship-slate)]">EXCERPT (the actual quoted text you want available to draw on)</label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={extracting}
                    title="Upload a PDF or .txt file to extract text into this field"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium text-[var(--worship-navy)] bg-[var(--worship-cream)] hover:bg-[var(--worship-sand)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors shrink-0"
                    style={{ borderColor: 'var(--worship-border)' }}
                  >
                    {extracting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Upload className="w-3 h-3" />
                    )}
                    {extracting ? 'Extracting…' : 'Upload file'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,application/pdf,text/plain"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
                <textarea
                  value={draft.excerpt}
                  onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })}
                  rows={6}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)] resize-y"
                  style={{ borderColor: 'var(--worship-border)' }}
                />
                <p className="text-[11px] text-[var(--worship-slate)] mt-1">
                  Upload a PDF or .txt file to extract its text automatically, or type / paste directly.
                </p>
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
