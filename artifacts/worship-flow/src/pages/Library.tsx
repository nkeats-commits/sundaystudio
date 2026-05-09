import { AppLayout } from '../components/layout/AppLayout';
import {
  useListLibraryItems,
  useDeleteLibraryItem,
  useListServicesLinkedToLibraryItem,
  useCreateLibraryItem,
  useSetLibraryItemRepertoire,
  useBulkImportRepertoire,
  useUpdateLibraryItem,
  getListLibraryItemsQueryKey,
  useListServiceTemplates,
  useUpdateServiceTemplate,
  useDeleteServiceTemplate,
  getListServiceTemplatesQueryKey,
  type ServiceTemplate,
} from '@workspace/api-client-react';
import {
  BookOpen,
  Music,
  Mic,
  Users,
  Sprout,
  Trash2,
  Link2,
  Star,
  Plus,
  ClipboardList,
  FileUp,
  X,
  Loader2,
  Copy,
  Pencil,
  Check,
} from 'lucide-react';
import { CsvImportModal } from '../components/library/CsvImportModal';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import type { LibraryItem } from '@workspace/api-client-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';

/**
 * Per-item badge showing how many service plans pull this library item
 * into one of their slots. Cheap query, cached by React Query.
 */
function UsedInBadge({ itemId }: { itemId: number }) {
  const q = useListServicesLinkedToLibraryItem(itemId);
  const count = q.data?.length ?? 0;
  if (q.isLoading || count === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--worship-pale-gold)] text-[var(--worship-gold)] font-bold"
      title={q.data?.map((s) => s.title).join(', ')}
    >
      <Link2 className="w-3 h-3" /> Used in {count}
    </span>
  );
}

type TabType =
  | 'all'
  | 'repertoire'
  | 'liturgy'
  | 'speaking_moment'
  | 'devotional'
  | 'soul_care'
  | 'flows';

type SongView = 'repertoire' | 'all';

/**
 * Parse a free-text paste of song titles into structured rows.
 * Accepts one song per line in any of these formats:
 *   - "Title"
 *   - "Title - Artist"
 *   - "Title — Artist" (em dash)
 * Empty lines and obvious header rows are dropped.
 */
function parseSongList(
  text: string,
): { title: string; artist?: string; bpm?: number }[] {
  const out: { title: string; artist?: string; bpm?: number }[] = [];
  // Pull a trailing tempo annotation off either the artist or the title.
  // Accepts "(120 BPM)", "[120bpm]", or "— 120 bpm" at the very end of the
  // string (case-insensitive). Returns the BPM (clamped to a sane range) and
  // the cleaned remainder.
  const extractBpm = (
    s: string,
  ): { rest: string; bpm: number | undefined } => {
    const m = s.match(
      /\s*(?:[—–-]\s*)?[\(\[]?\s*(\d{2,3})\s*bpm\s*[\)\]]?\s*$/i,
    );
    if (!m) return { rest: s, bpm: undefined };
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 30 || n > 300) {
      return { rest: s, bpm: undefined };
    }
    return { rest: s.slice(0, m.index).trim(), bpm: Math.round(n) };
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // Try em dash first, then hyphen with surrounding spaces so titles
    // with internal hyphens (e.g. "How He Loves - Live") aren't split.
    const dash = line.search(/\s[—–-]\s/);
    if (dash > 0) {
      const title = line.slice(0, dash).trim();
      const artistRaw = line.slice(dash + 3).trim();
      const { rest: artist, bpm } = extractBpm(artistRaw);
      if (title) {
        out.push({
          title,
          artist: artist || undefined,
          ...(bpm !== undefined ? { bpm } : {}),
        });
      }
    } else {
      const { rest: title, bpm } = extractBpm(line);
      if (title) {
        out.push({ title, ...(bpm !== undefined ? { bpm } : {}) });
      }
    }
  }
  return out;
}

function PasteListModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [text, setText] = useState('');
  const bulkImport = useBulkImportRepertoire();
  const preview = useMemo(() => parseSongList(text), [text]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (preview.length === 0) {
      toast.error('Paste at least one song.');
      return;
    }
    try {
      const res = await bulkImport.mutateAsync({
        data: { songs: preview },
      });
      const parts: string[] = [];
      if (res.added) parts.push(`${res.added} added`);
      if (res.skippedDuplicates)
        parts.push(`${res.skippedDuplicates} already in repertoire`);
      if (res.invalidLines) parts.push(`${res.invalidLines} skipped`);
      toast.success(parts.length ? parts.join(' · ') : 'No new songs to add.');
      onImported();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not import that list.',
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--worship-navy)]/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--worship-border)]">
          <div>
            <h3 className="font-serif text-xl text-[var(--worship-navy)]">
              Paste your song list
            </h3>
            <p className="text-xs text-[var(--worship-slate)] mt-1">
              One song per line. Use <code>Title - Artist</code> for both.
              Add a tempo like <code>(120 BPM)</code> at the end of any line.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--worship-cream)] text-[var(--worship-slate)]"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
          <div className="p-6 space-y-3 flex-1 overflow-y-auto">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Goodness of God - Bethel Music (76 BPM)\nHoly Spirit - Jesus Culture\nIn Christ Alone (66 BPM)\n10,000 Reasons — Matt Redman (73 BPM)`}
              rows={10}
              className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)] font-mono text-sm leading-relaxed"
              autoFocus
              data-testid="textarea-paste-list"
            />
            <p className="text-xs text-[var(--worship-slate)]">
              {preview.length === 0
                ? 'Nothing to import yet.'
                : `Ready to import ${preview.length} song${preview.length === 1 ? '' : 's'}. Duplicates of titles already in your repertoire will be skipped automatically.`}
            </p>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--worship-border)] bg-[var(--worship-cream)]/40">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[var(--worship-slate)] hover:text-[var(--worship-navy)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={bulkImport.isPending || preview.length === 0}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white worship-btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              data-testid="button-import-list"
            >
              {bulkImport.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Importing…
                </>
              ) : (
                <>Import {preview.length || ''} song{preview.length === 1 ? '' : 's'}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddSongForm({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [style, setStyle] = useState('');
  const [bpm, setBpm] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const create = useCreateLibraryItem();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const a = artist.trim();
    const s = style.trim();
    // BPM is a free-form text input so the user can clear it; coerce to a
    // sane integer or drop it entirely. Out-of-range values are silently
    // ignored — the matching number input also caps the range.
    const bpmTrimmed = bpm.trim();
    const bpmNum = bpmTrimmed ? Number(bpmTrimmed) : NaN;
    const content: Record<string, string | number> = {};
    if (a) content.artist = a;
    if (s) content.style = s;
    if (Number.isFinite(bpmNum) && bpmNum >= 30 && bpmNum <= 300) {
      content.bpm = Math.round(bpmNum);
    }
    const tags = tagsInput
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    try {
      await create.mutateAsync({
        data: {
          kind: 'song',
          title: t,
          content,
          tags,
          isRepertoire: true,
        },
      });
      toast.success(`"${t}" added to your repertoire`);
      setTitle('');
      setArtist('');
      setStyle('');
      setBpm('');
      setTagsInput('');
      onAdded();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not add that song.',
      );
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-4 bg-white rounded-xl border border-[var(--worship-border)]"
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Song title"
        className="px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)] text-sm"
        required
        data-testid="input-add-song-title"
      />
      <input
        value={artist}
        onChange={(e) => setArtist(e.target.value)}
        placeholder="Artist (optional)"
        className="px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)] text-sm"
        data-testid="input-add-song-artist"
      />
      <input
        value={style}
        onChange={(e) => setStyle(e.target.value)}
        placeholder="Style — e.g. Hymn, Modern (optional)"
        className="px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)] text-sm"
        data-testid="input-add-song-style"
      />
      <input
        value={bpm}
        onChange={(e) => setBpm(e.target.value)}
        placeholder="BPM — e.g. 120 (optional)"
        type="number"
        inputMode="numeric"
        min={30}
        max={300}
        step={1}
        className="px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)] text-sm"
        data-testid="input-add-song-bpm"
      />
      <input
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        placeholder="Tags, comma-separated (optional)"
        className="px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)] text-sm"
        data-testid="input-add-song-tags"
      />
      <button
        type="submit"
        disabled={create.isPending || !title.trim()}
        className="sm:col-span-2 px-4 py-2 rounded-lg text-sm font-medium text-white worship-btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        data-testid="button-add-song"
      >
        {create.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Plus className="w-4 h-4" />
        )}
        Add to repertoire
      </button>
    </form>
  );
}

export default function Library() {
  const [activeTab, setActiveTab] = useState<TabType>('repertoire');
  const [songView, setSongView] = useState<SongView>('repertoire');
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const [pendingCsvFile, setPendingCsvFile] = useState<File | null>(null);
  const [viewingItem, setViewingItem] = useState<LibraryItem | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  // Translate the active tab into a query for the list endpoint. The
  // Repertoire tab shows either repertoire songs or all songs based on songView.
  const listQuery =
    activeTab === 'all' || activeTab === 'flows'
      ? undefined
      : activeTab === 'repertoire'
        ? songView === 'all'
          ? { kind: 'song' as const }
          : { kind: 'song' as const, repertoire: true }
        : { kind: activeTab };

  const { data: items, isLoading } = useListLibraryItems(listQuery);
  // Always fetch the repertoire count, even when on a different tab, so the
  // tab label can show it without a tab switch.
  const repertoireQuery = useListLibraryItems({
    kind: 'song',
    repertoire: true,
  });
  const repertoireCount = repertoireQuery.data?.length ?? 0;

  const deleteItem = useDeleteLibraryItem();
  const setRepertoire = useSetLibraryItemRepertoire();
  const queryClient = useQueryClient();

  const invalidateLibrary = () =>
    queryClient.invalidateQueries({ queryKey: getListLibraryItemsQueryKey() });

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this item?')) return;
    deleteItem.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success('Item removed from library');
          invalidateLibrary();
        },
        onError: () => toast.error('Failed to delete item'),
      },
    );
  };

  const handleToggleRepertoire = (
    id: number,
    isRepertoire: boolean,
    title: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    setRepertoire.mutate(
      { id, data: { isRepertoire: !isRepertoire } },
      {
        onSuccess: () => {
          toast.success(
            !isRepertoire
              ? `"${title}" added to your repertoire`
              : `"${title}" removed from your repertoire`,
          );
          invalidateLibrary();
        },
        onError: () => toast.error('Could not update that song.'),
      },
    );
  };

  const tabs: { id: TabType; label: string; suffix?: string }[] = [
    {
      id: 'repertoire',
      label: 'Repertoire',
      suffix: repertoireCount > 0 ? `(${repertoireCount})` : undefined,
    },
    { id: 'all', label: 'All' },
    { id: 'liturgy', label: 'Liturgies' },
    { id: 'speaking_moment', label: 'Speaking Moments' },
    { id: 'devotional', label: 'Devotionals' },
    { id: 'soul_care', label: 'Soul Care' },
    { id: 'flows', label: 'Service Flows' },
  ];

  const getIcon = (kind: string) => {
    switch (kind) {
      case 'liturgy':
        return <BookOpen className="w-4 h-4" />;
      case 'song':
        return <Music className="w-4 h-4" />;
      case 'speaking_moment':
        return <Mic className="w-4 h-4" />;
      case 'devotional':
        return <Users className="w-4 h-4" />;
      case 'soul_care':
        return <Sprout className="w-4 h-4" />;
      default:
        return <BookOpen className="w-4 h-4" />;
    }
  };

  const formatKind = (kind: string) =>
    kind
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  const isRepertoireTab = activeTab === 'repertoire';
  const isRepertoireSubView = isRepertoireTab && songView === 'repertoire';
  const isFlowsTab = activeTab === 'flows';

  // Collect unique PCS content.tags across all loaded items for the theme
  // filter chip bar. Only meaningful on the Repertoire sub-view.
  const allThemes = useMemo(() => {
    if (!isRepertoireSubView || !items) return [];
    const set = new Set<string>();
    items.forEach((item) => {
      const ct = (item.content as Record<string, unknown>).tags;
      if (Array.isArray(ct)) ct.forEach((t) => typeof t === 'string' && set.add(t));
    });
    return Array.from(set).sort();
  }, [isRepertoireSubView, items]);

  // Apply optional theme filter for the Repertoire sub-view only (client-side,
  // no extra network request needed since all repertoire songs are already loaded).
  // Other tabs/sub-views bypass filtering entirely.
  const displayItems = useMemo(() => {
    if (!items) return [];
    if (!isRepertoireSubView || !selectedTheme) return items;
    return items.filter((item) => {
      const ct = (item.content as Record<string, unknown>).tags;
      return Array.isArray(ct) && ct.includes(selectedTheme);
    });
  }, [items, isRepertoireSubView, selectedTheme]);

  return (
    <AppLayout title="Library">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="pb-6 border-b border-[var(--worship-border)]">
          <h1 className="text-2xl font-serif text-[var(--worship-navy)] mb-1">
            Your Library
          </h1>
          <p className="text-sm text-[var(--worship-slate)]">
            Saved liturgies, songs, devotionals, and the songs your team
            already knows.
          </p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 border-b border-[var(--worship-border)]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedTheme(null);
                if (tab.id !== 'repertoire') setSongView('repertoire');
              }}
              data-testid={`tab-${tab.id}`}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-[var(--worship-navy)] border-b-2 border-[var(--worship-navy)] bg-white/50'
                  : 'text-[var(--worship-slate)] hover:text-[var(--worship-navy)] hover:bg-white/30'
              }`}
            >
              {tab.label}
              {tab.suffix ? (
                <span className="ml-1.5 text-xs text-[var(--worship-gold)] font-semibold">
                  {tab.suffix}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {isRepertoireTab && (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 pt-2">
              <div className="max-w-xl">
                <h2 className="font-serif text-lg text-[var(--worship-navy)]">
                  Songs your team already knows
                </h2>
                <p className="text-sm text-[var(--worship-slate)] mt-1">
                  The Song Assistant will lean on this list when picking
                  songs, so suggestions feel familiar to your worship team.
                </p>
              </div>
              <div className="self-start flex flex-wrap items-center gap-2">
                {/* Sub-view pill switcher */}
                <div className="inline-flex items-center rounded-lg border border-[var(--worship-border)] bg-white overflow-hidden">
                  <button
                    onClick={() => { setSongView('repertoire'); setSelectedTheme(null); }}
                    data-testid="song-view-repertoire"
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                      songView === 'repertoire'
                        ? 'bg-[var(--worship-navy)] text-white'
                        : 'text-[var(--worship-slate)] hover:text-[var(--worship-navy)] hover:bg-[var(--worship-cream)]'
                    }`}
                  >
                    Repertoire
                  </button>
                  <button
                    onClick={() => { setSongView('all'); setSelectedTheme(null); }}
                    data-testid="song-view-all"
                    className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-[var(--worship-border)] ${
                      songView === 'all'
                        ? 'bg-[var(--worship-navy)] text-white'
                        : 'text-[var(--worship-slate)] hover:text-[var(--worship-navy)] hover:bg-[var(--worship-cream)]'
                    }`}
                  >
                    All Songs
                  </button>
                </div>
                {isRepertoireSubView && (
                  <>
                    <button
                      onClick={() => setShowPasteModal(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--worship-border)] bg-white text-sm font-medium text-[var(--worship-navy)] hover:border-[var(--worship-gold)] hover:text-[var(--worship-gold)] transition-colors"
                      data-testid="button-open-paste-modal"
                    >
                      <ClipboardList className="w-4 h-4" />
                      Paste a list
                    </button>
                    {/*
                      Hidden file input + button that clicks it. We open the
                      OS file picker directly from the user's button gesture
                      (NOT from a useEffect inside the modal) so browsers
                      don't block the dialog. Once the user picks a file the
                      onChange handler stashes it and opens the modal, which
                      parses + previews + submits.
                    */}
                    <input
                      ref={csvFileInputRef}
                      type="file"
                      accept=".csv,text/csv,application/vnd.ms-excel"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setPendingCsvFile(f);
                          setShowCsvModal(true);
                        }
                        // Reset value so picking the same file twice in a
                        // row still triggers onChange.
                        if (csvFileInputRef.current) {
                          csvFileInputRef.current.value = '';
                        }
                      }}
                      className="hidden"
                      data-testid="input-csv-file"
                    />
                    <button
                      onClick={() => csvFileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--worship-border)] bg-white text-sm font-medium text-[var(--worship-navy)] hover:border-[var(--worship-gold)] hover:text-[var(--worship-gold)] transition-colors"
                      data-testid="button-open-csv-modal"
                    >
                      <FileUp className="w-4 h-4" />
                      Import from CSV
                    </button>
                  </>
                )}
              </div>
            </div>
            {isRepertoireSubView && <AddSongForm onAdded={invalidateLibrary} />}
          </div>
        )}

        {isRepertoireSubView && allThemes.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => setSelectedTheme(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                selectedTheme === null
                  ? 'bg-[var(--worship-navy)] text-white border-[var(--worship-navy)]'
                  : 'bg-white text-[var(--worship-slate)] border-[var(--worship-border)] hover:border-[var(--worship-gold)] hover:text-[var(--worship-gold)]'
              }`}
            >
              All themes
            </button>
            {allThemes.map((theme) => (
              <button
                key={theme}
                onClick={() =>
                  setSelectedTheme((prev) => (prev === theme ? null : theme))
                }
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                  selectedTheme === theme
                    ? 'bg-[var(--worship-gold)] text-white border-[var(--worship-gold)]'
                    : 'bg-white text-[var(--worship-slate)] border-[var(--worship-border)] hover:border-[var(--worship-gold)] hover:text-[var(--worship-gold)]'
                }`}
              >
                {theme}
              </button>
            ))}
          </div>
        )}

        {isFlowsTab ? (
          <SavedFlowsPanel />
        ) : isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C99A3D]"></div>
          </div>
        ) : !items?.length || !displayItems.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--worship-cream)] flex items-center justify-center mb-4 text-[var(--worship-gold)]">
              {isRepertoireTab ? (
                <Star className="w-8 h-8" />
              ) : (
                <BookOpen className="w-8 h-8" />
              )}
            </div>
            <h3 className="text-lg font-serif text-[var(--worship-navy)] mb-2">
              {isRepertoireSubView && selectedTheme
                ? `No songs tagged "${selectedTheme}"`
                : isRepertoireSubView
                  ? 'Your repertoire is empty'
                  : isRepertoireTab
                    ? 'No songs in your library yet'
                    : 'Nothing here yet'}
            </h3>
            <p className="text-[var(--worship-slate)] max-w-sm">
              {isRepertoireSubView && selectedTheme
                ? 'Try a different theme or clear the filter to see all your songs.'
                : isRepertoireSubView
                  ? 'Add songs your team already knows so the Song Assistant can prefer or restrict to them.'
                  : isRepertoireTab
                    ? 'Songs saved by the AI generators will appear here. Star any song to add it to your repertoire.'
                    : 'Use the generators from the Dashboard or Sidebar to create and save content to your library.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
            {displayItems.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  // Ignore clicks that originated on a nested control
                  // (Star, Trash) — those handlers already stopPropagation
                  // but this is defense in depth.
                  if (e.target !== e.currentTarget && (e.target as HTMLElement).closest('button')) {
                    return;
                  }
                  setViewingItem(item);
                }}
                onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                  // Only open when the card itself has focus, not when
                  // Enter/Space is fired on a nested button (Star/Trash).
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setViewingItem(item);
                  }
                }}
                className="worship-card p-5 group flex flex-col text-left cursor-pointer hover:border-[var(--worship-gold)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--worship-gold)] focus-visible:border-[var(--worship-gold)]"
                data-testid={`library-card-${item.id}`}
                aria-label={`View ${item.title}`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2 px-2 py-1 bg-[var(--worship-cream)] rounded-md text-xs font-medium text-[var(--worship-slate)]">
                    {getIcon(item.kind)}
                    {formatKind(item.kind)}
                  </div>
                  <div className="flex items-center gap-1">
                    {item.kind === 'song' && (
                      <button
                        onClick={(e) =>
                          handleToggleRepertoire(
                            item.id,
                            item.isRepertoire,
                            item.title,
                            e,
                          )
                        }
                        className={`p-1 rounded transition-colors ${
                          item.isRepertoire
                            ? 'text-[var(--worship-gold)]'
                            : 'text-slate-300 hover:text-[var(--worship-gold)] opacity-0 group-hover:opacity-100'
                        }`}
                        title={
                          item.isRepertoire
                            ? 'Remove from repertoire'
                            : 'Add to repertoire'
                        }
                        data-testid={`button-toggle-repertoire-${item.id}`}
                        aria-pressed={item.isRepertoire}
                      >
                        <Star
                          className={`w-4 h-4 ${item.isRepertoire ? 'fill-current' : ''}`}
                        />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDelete(item.id, e)}
                      className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                      title="Delete item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <h3 className="font-serif text-lg text-[var(--worship-navy)] mb-2">
                  {item.title}
                </h3>

                <div className="text-sm text-[var(--worship-slate)] mb-2 flex-1">
                  {item.kind === 'song' ? (
                    <div className="space-y-2">
                      {!!(item.content.artist || item.content.style || item.content.bpm) && (
                        <p className="line-clamp-1">
                          {!!item.content.artist && (
                            <span className="italic">
                              {String(item.content.artist)}
                            </span>
                          )}
                          {!!(item.content.artist && item.content.style) && (
                            <span className="text-[var(--worship-muted-slate)]">
                              {' · '}
                            </span>
                          )}
                          {!!item.content.style && (
                            <span>{String(item.content.style)}</span>
                          )}
                          {!!(item.content.artist || item.content.style) &&
                            typeof item.content.bpm === 'number' && (
                              <span className="text-[var(--worship-muted-slate)]">
                                {' · '}
                              </span>
                            )}
                          {typeof item.content.bpm === 'number' && (
                            <span className="font-medium text-[var(--worship-gold)]">
                              {item.content.bpm} BPM
                            </span>
                          )}
                        </p>
                      )}
                      {(() => {
                        const availableKeys = Array.isArray((item.content as Record<string, unknown>).availableKeys)
                          ? ((item.content as Record<string, unknown>).availableKeys as unknown[]).filter(k => typeof k === 'string') as string[]
                          : [];
                        const primaryKey = typeof (item.content as Record<string, unknown>).key === 'string'
                          ? ((item.content as Record<string, unknown>).key as string)
                          : null;
                        const displayKeys = availableKeys.length > 0 ? availableKeys : primaryKey ? [primaryKey] : [];
                        if (displayKeys.length === 0) return null;
                        return (
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[10px] uppercase tracking-wide text-[var(--worship-muted-slate)] font-semibold">Keys:</span>
                            {displayKeys.slice(0, 6).map((k) => (
                              <span
                                key={k}
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium border ${
                                  k === primaryKey
                                    ? 'bg-[var(--worship-pale-gold)] text-[var(--worship-gold)] border-[var(--worship-pale-gold)]'
                                    : 'bg-[var(--worship-cream)] text-[var(--worship-slate)] border-[var(--worship-border)]'
                                }`}
                              >
                                {k}
                              </span>
                            ))}
                            {displayKeys.length > 6 && (
                              <span className="text-[10px] text-[var(--worship-muted-slate)]">
                                +{displayKeys.length - 6}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      {(() => {
                        // Prefer content.tags (PCS organizational tags); fall back to
                        // top-level item.tags so manually-tagged songs still show labels.
                        const contentTags = Array.isArray((item.content as Record<string, unknown>).tags)
                          ? ((item.content as Record<string, unknown>).tags as unknown[]).filter(t => typeof t === 'string') as string[]
                          : [];
                        const displayTags = contentTags.length > 0 ? contentTags : (item.tags ?? []);
                        if (displayTags.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-1">
                            {displayTags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="text-[10px] px-2 py-0.5 bg-[var(--worship-sand)] text-[var(--worship-navy)] rounded-full font-medium"
                              >
                                {t}
                              </span>
                            ))}
                            {displayTags.length > 3 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full text-[var(--worship-muted-slate)]">
                                +{displayTags.length - 3}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      {!item.content.artist && !item.content.style && !item.content.bpm &&
                        !(Array.isArray((item.content as Record<string, unknown>).availableKeys) && ((item.content as Record<string, unknown>).availableKeys as unknown[]).length > 0) &&
                        !(Array.isArray((item.content as Record<string, unknown>).tags) && ((item.content as Record<string, unknown>).tags as unknown[]).length > 0) &&
                        !(item.tags && item.tags.length > 0) && (
                        <span className="text-[var(--worship-muted-slate)] italic text-xs">No preview available</span>
                      )}
                    </div>
                  ) : item.content.body ? (
                    <p className="line-clamp-3">{String(item.content.body)}</p>
                  ) : item.content.reflection ? (
                    <p className="line-clamp-3">{String(item.content.reflection)}</p>
                  ) : (
                    'No preview available'
                  )}
                </div>

                <div className="flex justify-between items-center mt-auto pt-4 border-t border-[var(--worship-border)]">
                  <span className="text-xs text-[var(--worship-muted-slate)]">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <UsedInBadge itemId={item.id} />
                    {item.kind !== 'song' && item.tags && item.tags.length > 0 && (
                      <div className="flex gap-1">
                        {item.tags.slice(0, 2).map((t) => (
                          <span
                            key={t}
                            className="text-[10px] px-2 py-0.5 bg-[var(--worship-sand)] text-[var(--worship-navy)] rounded-full"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showPasteModal && (
        <PasteListModal
          onClose={() => setShowPasteModal(false)}
          onImported={invalidateLibrary}
        />
      )}

      {showCsvModal && (
        <CsvImportModal
          onClose={() => {
            setShowCsvModal(false);
            setPendingCsvFile(null);
          }}
          onImported={invalidateLibrary}
          existingTitles={
            repertoireQuery.data?.map((it) => it.title) ?? []
          }
          initialFile={pendingCsvFile}
        />
      )}

      <LibraryItemDetailDialog
        item={viewingItem}
        onClose={() => setViewingItem(null)}
        onDeleted={() => {
          setViewingItem(null);
          invalidateLibrary();
        }}
        onUpdated={(updated) => {
          setViewingItem(updated);
          invalidateLibrary();
        }}
        deleteItem={deleteItem}
        getIcon={getIcon}
        formatKind={formatKind}
      />
    </AppLayout>
  );
}

function SavedFlowsPanel() {
  const queryClient = useQueryClient();
  const { data: flows, isLoading } = useListServiceTemplates();
  const updateTemplate = useUpdateServiceTemplate();
  const deleteTemplate = useDeleteServiceTemplate();
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const [, setLocation] = useLocation();

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getListServiceTemplatesQueryKey(),
    });

  const startRename = (flow: ServiceTemplate) => {
    setRenamingId(flow.id);
    setDraftName(flow.name);
  };

  const commitRename = (flow: ServiceTemplate) => {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === flow.name) {
      setRenamingId(null);
      return;
    }
    updateTemplate.mutate(
      { id: flow.id, data: { name: trimmed } },
      {
        onSuccess: () => {
          toast.success('Renamed');
          setRenamingId(null);
          invalidate();
        },
        onError: (err: Error) => {
          toast.error(err.message || 'Could not rename that flow');
        },
      },
    );
  };

  const handleDelete = (flow: ServiceTemplate) => {
    if (
      !confirm(
        `Delete "${flow.name}"? This won't affect service plans you've already saved.`,
      )
    )
      return;
    deleteTemplate.mutate(
      { id: flow.id },
      {
        onSuccess: () => {
          toast.success('Service flow deleted');
          invalidate();
        },
        onError: () => toast.error('Could not delete that flow'),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C99A3D]"></div>
      </div>
    );
  }

  if (!flows || flows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-[var(--worship-cream)] flex items-center justify-center mb-4 text-[var(--worship-gold)]">
          <ClipboardList className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-serif text-[var(--worship-navy)] mb-2">
          No saved service flows yet
        </h3>
        <p className="text-[var(--worship-slate)] max-w-sm mb-4">
          Build a service in the Service Builder, then save the order as a
          reusable template you can apply with one click.
        </p>
        <button
          type="button"
          onClick={() => setLocation('/service-builder')}
          className="px-4 py-2 rounded-lg text-sm worship-btn-primary text-white"
          data-testid="button-build-a-template"
        >
          Build a template →
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
      {flows.map((flow) => (
        <div
          key={flow.id}
          className="worship-card p-5 flex flex-col"
          data-testid={`flow-card-${flow.id}`}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              {renamingId === flow.id ? (
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => commitRename(flow)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(flow);
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  className="w-full px-2 py-1 rounded border text-base font-serif text-[var(--worship-navy)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
                  style={{ borderColor: 'var(--worship-border)' }}
                  data-testid={`input-rename-flow-${flow.id}`}
                />
              ) : (
                <h3 className="font-serif text-lg text-[var(--worship-navy)] truncate">
                  {flow.name}
                </h3>
              )}
              {flow.description && (
                <p className="text-xs text-[var(--worship-slate)] mt-1 line-clamp-2">
                  {flow.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => startRename(flow)}
                className="p-1.5 rounded text-slate-400 hover:text-[var(--worship-navy)] hover:bg-[var(--worship-cream)]"
                title="Rename"
                data-testid={`button-rename-flow-${flow.id}`}
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(flow)}
                className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"
                title="Delete"
                data-testid={`button-delete-flow-${flow.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <ol className="space-y-1 text-sm text-[var(--worship-charcoal)] list-decimal list-inside">
            {flow.flow.map((step, i) => (
              <li key={i} className="truncate">
                <span className="text-[var(--worship-navy)]">
                  {step.stepName}
                </span>
                <span className="text-[var(--worship-muted-slate)] text-xs ml-2 uppercase tracking-wide">
                  {step.kind}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-3 pt-3 border-t border-[var(--worship-border)] text-xs text-[var(--worship-muted-slate)]">
            {flow.flow.length} step{flow.flow.length === 1 ? '' : 's'} ·
            updated {new Date(flow.updatedAt).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
}

function buildCopyText(item: LibraryItem): string {
  const c = item.content as Record<string, unknown>;
  const str = (k: string) => (typeof c[k] === 'string' ? (c[k] as string) : '');
  const arr = (k: string) => (Array.isArray(c[k]) ? (c[k] as unknown[]) : []);

  if (item.kind === 'liturgy' || item.kind === 'speaking_moment') {
    const parts = [item.title, str('body')].filter(Boolean);
    const notes = str('notes') || str('deliveryNotes');
    if (notes) parts.push(`\nNotes: ${notes}`);
    return parts.join('\n\n');
  }
  if (item.kind === 'devotional') {
    const opening = str('opening');
    const scripture = str('scripture');
    const body = str('body');
    const questions = arr('discussionQuestions')
      .map((q, i) => `${i + 1}. ${String(q)}`)
      .join('\n');
    const prayer = str('closingPrayer');
    return [
      item.title,
      scripture,
      opening,
      body,
      questions ? `Discussion:\n${questions}` : '',
      prayer ? `Closing Prayer:\n${prayer}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  if (item.kind === 'soul_care') {
    const tradition = str('practiceTradition');
    const minsRaw = c.durationMinutes;
    const mins = typeof minsRaw === 'number' ? `${minsRaw} min` : '';
    const headerBits = [tradition, mins].filter(Boolean).join(' · ');
    const leaderNotes = str('leaderNotes');
    const opening = str('opening');
    const sc = (c.scripture as Record<string, unknown> | undefined) ?? {};
    const scRef = typeof sc.reference === 'string' ? sc.reference : '';
    const scText = typeof sc.text === 'string' ? sc.text : '';
    const scRefl = typeof sc.reflection === 'string' ? sc.reflection : '';
    const practices = (Array.isArray(c.practices) ? c.practices : [])
      .map((p, i) => {
        const pp = p as Record<string, unknown>;
        const name = typeof pp.name === 'string' ? pp.name : `Practice ${i + 1}`;
        const dur =
          typeof pp.durationMinutes === 'number' ? ` (${pp.durationMinutes} min)` : '';
        const ins = typeof pp.instructions === 'string' ? pp.instructions : '';
        return `${i + 1}. ${name}${dur}\n${ins}`;
      })
      .join('\n\n');
    const prompts = arr('journalingPrompts')
      .map((q, i) => `${i + 1}. ${String(q)}`)
      .join('\n');
    const closing = str('closing');
    const takeHome = str('takeHomePractice');
    return [
      item.title,
      headerBits ? `(${headerBits})` : '',
      leaderNotes ? `Leader notes:\n${leaderNotes}` : '',
      opening ? `Opening:\n${opening}` : '',
      scRef
        ? `Scripture — ${scRef}\n${scText}${scRefl ? `\n\n${scRefl}` : ''}`
        : '',
      practices,
      prompts ? `Journaling Prompts:\n${prompts}` : '',
      closing ? `Closing:\n${closing}` : '',
      takeHome ? `Take-home practice:\n${takeHome}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  // song
  const artist = str('artist');
  const style = str('style');
  const themes = arr('themes').map(String).join(', ');
  const why = str('whyItFits');
  const bpmRaw = (item.content as Record<string, unknown>).bpm;
  const bpm = typeof bpmRaw === 'number' ? bpmRaw : null;
  return [
    item.title,
    artist && `Artist: ${artist}`,
    style && `Style: ${style}`,
    bpm !== null && `Tempo: ${bpm} BPM`,
    themes && `Themes: ${themes}`,
    why && `Why it fits: ${why}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Local draft model for the editor. Keeps every field as a string (or
 * string[] for the questions list) so the inputs stay simple and we only
 * coerce when persisting.
 */
type EditDraft = {
  title: string;
  // liturgy / speaking_moment
  body: string;
  notes: string;
  deliveryNotes: string;
  // devotional
  opening: string;
  scripture: string;
  discussionQuestions: string[];
  closingPrayer: string;
  // soul_care (opening is shared with devotional)
  leaderNotes: string;
  closing: string;
  takeHomePractice: string;
  // song
  artist: string;
  style: string;
  bpm: string;
  themes: string;
  whyItFits: string;
};

function emptyDraft(): EditDraft {
  return {
    title: '',
    body: '',
    notes: '',
    deliveryNotes: '',
    opening: '',
    scripture: '',
    discussionQuestions: [],
    closingPrayer: '',
    leaderNotes: '',
    closing: '',
    takeHomePractice: '',
    artist: '',
    style: '',
    bpm: '',
    themes: '',
    whyItFits: '',
  };
}

function draftFromItem(item: LibraryItem): EditDraft {
  const c = item.content as Record<string, unknown>;
  const str = (k: string) =>
    typeof c[k] === 'string' ? (c[k] as string) : '';
  const arr = (k: string) =>
    Array.isArray(c[k]) ? (c[k] as unknown[]).map(String) : [];
  // Songs: the view body falls back to item.tags when content.themes is
  // empty (so imported / manually-added songs surface tags as themes).
  // Mirror that fallback here so the editor opens with what the user sees.
  const contentThemes = arr('themes');
  const songThemes =
    item.kind === 'song' && contentThemes.length === 0
      ? (item.tags ?? []).map(String)
      : contentThemes;
  return {
    title: item.title,
    body: str('body'),
    notes: str('notes'),
    deliveryNotes: str('deliveryNotes'),
    opening: str('opening'),
    scripture: str('scripture'),
    discussionQuestions: arr('discussionQuestions'),
    closingPrayer: str('closingPrayer'),
    leaderNotes: str('leaderNotes'),
    closing: str('closing'),
    takeHomePractice: str('takeHomePractice'),
    artist: str('artist'),
    style: str('style'),
    bpm:
      typeof c.bpm === 'number' && Number.isFinite(c.bpm)
        ? String(c.bpm)
        : '',
    themes: songThemes.join(', '),
    whyItFits: str('whyItFits'),
  };
}

/**
 * Build the new content blob for a kind from the editor draft, preserving
 * any keys we don't expose so we never silently strip data the generator
 * may have added (e.g. song scripture refs, structured metadata).
 */
function contentFromDraft(
  item: LibraryItem,
  draft: EditDraft,
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...(item.content as Record<string, unknown>),
  };
  const setOrDelete = (key: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed) next[key] = trimmed;
    else delete next[key];
  };
  if (item.kind === 'liturgy') {
    setOrDelete('body', draft.body);
    setOrDelete('notes', draft.notes);
  } else if (item.kind === 'speaking_moment') {
    setOrDelete('body', draft.body);
    setOrDelete('deliveryNotes', draft.deliveryNotes);
  } else if (item.kind === 'devotional') {
    setOrDelete('opening', draft.opening);
    setOrDelete('scripture', draft.scripture);
    setOrDelete('body', draft.body);
    setOrDelete('closingPrayer', draft.closingPrayer);
    const qs = draft.discussionQuestions
      .map((q) => q.trim())
      .filter(Boolean);
    if (qs.length > 0) next.discussionQuestions = qs;
    else delete next.discussionQuestions;
  } else if (item.kind === 'soul_care') {
    setOrDelete('leaderNotes', draft.leaderNotes);
    setOrDelete('opening', draft.opening);
    setOrDelete('closing', draft.closing);
    setOrDelete('takeHomePractice', draft.takeHomePractice);
  } else if (item.kind === 'song') {
    setOrDelete('artist', draft.artist);
    setOrDelete('style', draft.style);
    setOrDelete('whyItFits', draft.whyItFits);
    const bpmTrimmed = draft.bpm.trim();
    const bpmNum = bpmTrimmed ? Number(bpmTrimmed) : NaN;
    if (Number.isFinite(bpmNum) && bpmNum >= 30 && bpmNum <= 300) {
      next.bpm = Math.round(bpmNum);
    } else {
      delete next.bpm;
    }
    const themes = draft.themes
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (themes.length > 0) next.themes = themes;
    else delete next.themes;
  }
  return next;
}

function LibraryItemDetailDialog({
  item,
  onClose,
  onDeleted,
  onUpdated,
  deleteItem,
  getIcon,
  formatKind,
}: {
  item: LibraryItem | null;
  onClose: () => void;
  onDeleted: () => void;
  onUpdated: (updated: LibraryItem) => void;
  deleteItem: ReturnType<typeof useDeleteLibraryItem>;
  getIcon: (kind: string) => React.ReactNode;
  formatKind: (kind: string) => string;
}) {
  const open = item !== null;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft>(emptyDraft);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const updateItem = useUpdateLibraryItem();

  // Reset draft whenever a new item is opened or the dialog closes.
  useEffect(() => {
    if (item) {
      setDraft(draftFromItem(item));
      setTitleError(null);
      setSaveError(null);
      setIsEditing(false);
    } else {
      setIsEditing(false);
      setTitleError(null);
      setSaveError(null);
    }
  }, [item?.id]);

  const handleCopy = () => {
    if (!item) return;
    navigator.clipboard
      .writeText(buildCopyText(item))
      .then(() => toast.success('Copied to clipboard'))
      .catch(() => toast.error('Could not copy'));
  };

  const handleDelete = () => {
    if (!item) return;
    if (!confirm('Are you sure you want to delete this item?')) return;
    deleteItem.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          toast.success('Item removed from library');
          onDeleted();
        },
        onError: () => toast.error('Failed to delete item'),
      },
    );
  };

  const handleStartEdit = () => {
    if (!item) return;
    setDraft(draftFromItem(item));
    setTitleError(null);
    setSaveError(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    if (item) setDraft(draftFromItem(item));
    setTitleError(null);
    setSaveError(null);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!item) return;
    const title = draft.title.trim();
    if (!title) {
      setTitleError('Title is required.');
      return;
    }
    setTitleError(null);
    setSaveError(null);
    try {
      // For songs, always keep tags in sync with the edited themes so the
      // card badges and view-mode fallback render the user's latest input
      // regardless of whether the song originally had content.themes.
      const themesList = draft.themes
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const updated = await updateItem.mutateAsync({
        id: item.id,
        data: {
          title,
          content: contentFromDraft(item, draft),
          ...(item.kind === 'song' ? { tags: themesList } : {}),
        },
      });
      toast.success('Changes saved');
      setIsEditing(false);
      onUpdated(updated);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not save changes.';
      setSaveError(message);
      toast.error(message);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col p-0 gap-0 bg-white">
        {item && (
          <>
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-[var(--worship-border)] space-y-3">
              <div className="flex items-center gap-2 px-2 py-1 bg-[var(--worship-cream)] rounded-md text-xs font-medium text-[var(--worship-slate)] w-fit">
                {getIcon(item.kind)}
                {formatKind(item.kind)}
              </div>
              {isEditing ? (
                <div className="space-y-1">
                  <input
                    value={draft.title}
                    onChange={(e) => {
                      setDraft({ ...draft, title: e.target.value });
                      if (titleError) setTitleError(null);
                    }}
                    className={`w-full font-serif text-2xl text-[var(--worship-navy)] px-3 py-2 rounded-lg border bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)] ${
                      titleError
                        ? 'border-red-400'
                        : 'border-[var(--worship-border)]'
                    }`}
                    placeholder="Title"
                    data-testid="input-detail-title"
                  />
                  {titleError && (
                    <p
                      className="text-xs text-red-600"
                      data-testid="error-detail-title"
                    >
                      {titleError}
                    </p>
                  )}
                </div>
              ) : (
                <DialogTitle className="font-serif text-2xl text-[var(--worship-navy)] pr-8">
                  {item.title}
                </DialogTitle>
              )}
            </DialogHeader>

            <div
              className="flex-1 overflow-y-auto px-6 py-6"
              data-testid="library-detail-body"
            >
              {isEditing ? (
                <ItemEditBody
                  item={item}
                  draft={draft}
                  setDraft={setDraft}
                />
              ) : (
                <ItemDetailBody item={item} />
              )}
            </div>

            {isEditing && saveError && (
              <div
                className="px-6 py-2 border-t border-[var(--worship-border)] bg-red-50 text-xs text-red-700"
                data-testid="error-detail-save"
                role="alert"
              >
                {saveError}
              </div>
            )}
            <div className="px-6 py-4 border-t border-[var(--worship-border)] flex justify-between items-center gap-2 bg-[var(--worship-cream)]/50">
              {isEditing ? (
                <>
                  <button
                    onClick={handleCancel}
                    disabled={updateItem.isPending}
                    className="px-4 py-2 rounded-lg font-medium text-sm text-[var(--worship-slate)] hover:bg-white transition-colors disabled:opacity-50"
                    data-testid="button-detail-cancel"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={updateItem.isPending}
                    className="px-4 py-2 rounded-lg font-medium text-sm text-white worship-btn-primary disabled:opacity-50 flex items-center gap-2"
                    data-testid="button-detail-save"
                  >
                    {updateItem.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    {updateItem.isPending ? 'Saving…' : 'Save'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleDelete}
                    disabled={deleteItem.isPending}
                    className="px-4 py-2 rounded-lg font-medium text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2 disabled:opacity-50"
                    data-testid="button-detail-delete"
                  >
                    <Trash2 className="w-4 h-4" />
                    {deleteItem.isPending ? 'Deleting…' : 'Delete'}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleStartEdit}
                      className="px-4 py-2 rounded-lg font-medium text-sm border border-[var(--worship-border)] text-[var(--worship-slate)] hover:bg-white transition-colors flex items-center gap-2"
                      data-testid="button-detail-edit"
                    >
                      <Pencil className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={handleCopy}
                      className="px-4 py-2 rounded-lg font-medium text-sm border border-[var(--worship-border)] text-[var(--worship-slate)] hover:bg-white transition-colors flex items-center gap-2"
                      data-testid="button-detail-copy"
                    >
                      <Copy className="w-4 h-4" />
                      Copy
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Editable counterpart to ItemDetailBody. Shows just the fields that are
 * relevant to the item's kind so users can tweak wording in place.
 */
function ItemEditBody({
  item,
  draft,
  setDraft,
}: {
  item: LibraryItem;
  draft: EditDraft;
  setDraft: (d: EditDraft) => void;
}) {
  const labelClass =
    'block text-xs font-semibold uppercase tracking-wider text-[var(--worship-slate)] mb-1';
  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)] text-sm';
  const textareaClass = inputClass + ' font-serif leading-relaxed';

  if (item.kind === 'liturgy') {
    return (
      <div className="space-y-5">
        <div>
          <label className={labelClass}>Body</label>
          <textarea
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            rows={12}
            className={textareaClass}
            data-testid="input-edit-body"
          />
        </div>
        <div>
          <label className={labelClass}>Pastoral Notes</label>
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            rows={4}
            className={textareaClass}
            data-testid="input-edit-notes"
          />
        </div>
      </div>
    );
  }

  if (item.kind === 'speaking_moment') {
    return (
      <div className="space-y-5">
        <div>
          <label className={labelClass}>Body</label>
          <textarea
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            rows={12}
            className={textareaClass}
            data-testid="input-edit-body"
          />
        </div>
        <div>
          <label className={labelClass}>Delivery Notes</label>
          <textarea
            value={draft.deliveryNotes}
            onChange={(e) =>
              setDraft({ ...draft, deliveryNotes: e.target.value })
            }
            rows={4}
            className={textareaClass}
            data-testid="input-edit-delivery-notes"
          />
        </div>
      </div>
    );
  }

  if (item.kind === 'devotional') {
    return (
      <div className="space-y-5">
        <div>
          <label className={labelClass}>Opening</label>
          <textarea
            value={draft.opening}
            onChange={(e) => setDraft({ ...draft, opening: e.target.value })}
            rows={3}
            className={textareaClass}
            data-testid="input-edit-opening"
          />
        </div>
        <div>
          <label className={labelClass}>Scripture</label>
          <input
            value={draft.scripture}
            onChange={(e) =>
              setDraft({ ...draft, scripture: e.target.value })
            }
            className={inputClass}
            data-testid="input-edit-scripture"
          />
        </div>
        <div>
          <label className={labelClass}>Body</label>
          <textarea
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            rows={10}
            className={textareaClass}
            data-testid="input-edit-body"
          />
        </div>
        <div>
          <label className={labelClass}>Discussion Questions</label>
          <div className="space-y-2">
            {draft.discussionQuestions.map((q, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="mt-2 text-sm text-[var(--worship-muted-slate)] w-5">
                  {i + 1}.
                </span>
                <textarea
                  value={q}
                  onChange={(e) => {
                    const next = [...draft.discussionQuestions];
                    next[i] = e.target.value;
                    setDraft({ ...draft, discussionQuestions: next });
                  }}
                  rows={2}
                  className={textareaClass + ' flex-1'}
                  data-testid={`input-edit-question-${i}`}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = draft.discussionQuestions.filter(
                      (_, idx) => idx !== i,
                    );
                    setDraft({ ...draft, discussionQuestions: next });
                  }}
                  className="mt-1 p-1 text-[var(--worship-muted-slate)] hover:text-red-500"
                  aria-label={`Remove question ${i + 1}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  discussionQuestions: [...draft.discussionQuestions, ''],
                })
              }
              className="inline-flex items-center gap-1 text-xs text-[var(--worship-gold)] hover:text-[var(--worship-navy)]"
              data-testid="button-add-question"
            >
              <Plus className="w-3 h-3" /> Add question
            </button>
          </div>
        </div>
        <div>
          <label className={labelClass}>Closing Prayer</label>
          <textarea
            value={draft.closingPrayer}
            onChange={(e) =>
              setDraft({ ...draft, closingPrayer: e.target.value })
            }
            rows={4}
            className={textareaClass}
            data-testid="input-edit-closing-prayer"
          />
        </div>
      </div>
    );
  }

  if (item.kind === 'soul_care') {
    return (
      <div className="space-y-5">
        <p className="text-xs italic text-[var(--worship-muted-slate)]">
          Scripture, practices, and journaling prompts are preserved as the AI
          generated them. Edit the framing fields below.
        </p>
        <div>
          <label className={labelClass}>Leader Notes</label>
          <textarea
            value={draft.leaderNotes}
            onChange={(e) =>
              setDraft({ ...draft, leaderNotes: e.target.value })
            }
            rows={3}
            className={textareaClass}
            data-testid="input-edit-leader-notes"
          />
        </div>
        <div>
          <label className={labelClass}>Opening</label>
          <textarea
            value={draft.opening}
            onChange={(e) => setDraft({ ...draft, opening: e.target.value })}
            rows={4}
            className={textareaClass}
            data-testid="input-edit-opening"
          />
        </div>
        <div>
          <label className={labelClass}>Closing</label>
          <textarea
            value={draft.closing}
            onChange={(e) => setDraft({ ...draft, closing: e.target.value })}
            rows={4}
            className={textareaClass}
            data-testid="input-edit-closing"
          />
        </div>
        <div>
          <label className={labelClass}>Take-home Practice</label>
          <textarea
            value={draft.takeHomePractice}
            onChange={(e) =>
              setDraft({ ...draft, takeHomePractice: e.target.value })
            }
            rows={3}
            className={textareaClass}
            data-testid="input-edit-take-home"
          />
        </div>
      </div>
    );
  }

  // song
  return (
    <div className="space-y-5">
      <div>
        <label className={labelClass}>Artist</label>
        <input
          value={draft.artist}
          onChange={(e) => setDraft({ ...draft, artist: e.target.value })}
          className={inputClass}
          data-testid="input-edit-artist"
        />
      </div>
      <div>
        <label className={labelClass}>Style</label>
        <input
          value={draft.style}
          onChange={(e) => setDraft({ ...draft, style: e.target.value })}
          className={inputClass}
          data-testid="input-edit-style"
        />
      </div>
      <div>
        <label className={labelClass}>BPM (optional)</label>
        <input
          value={draft.bpm}
          onChange={(e) => setDraft({ ...draft, bpm: e.target.value })}
          type="number"
          inputMode="numeric"
          min={30}
          max={300}
          step={1}
          placeholder="e.g. 120"
          className={inputClass}
          data-testid="input-edit-bpm"
        />
      </div>
      <div>
        <label className={labelClass}>Themes (comma-separated)</label>
        <input
          value={draft.themes}
          onChange={(e) => setDraft({ ...draft, themes: e.target.value })}
          className={inputClass}
          placeholder="e.g. Grace, Hope, Renewal"
          data-testid="input-edit-themes"
        />
      </div>
      <div>
        <label className={labelClass}>Why it fits</label>
        <textarea
          value={draft.whyItFits}
          onChange={(e) => setDraft({ ...draft, whyItFits: e.target.value })}
          rows={4}
          className={textareaClass}
          data-testid="input-edit-why-it-fits"
        />
      </div>
    </div>
  );
}

function ItemDetailBody({ item }: { item: LibraryItem }) {
  const c = item.content as Record<string, unknown>;
  const str = (k: string) =>
    typeof c[k] === 'string' ? (c[k] as string) : '';
  const arr = (k: string) =>
    Array.isArray(c[k]) ? (c[k] as unknown[]) : [];

  if (item.kind === 'liturgy') {
    const body = str('body');
    const notes = str('notes');
    return (
      <div className="space-y-6">
        {body ? (
          <pre className="font-serif text-base leading-relaxed text-[var(--worship-charcoal)] whitespace-pre-wrap font-medium bg-transparent p-0 border-0 m-0">
            {body}
          </pre>
        ) : (
          <p className="text-sm italic text-[var(--worship-muted-slate)]">
            No body content saved.
          </p>
        )}
        {notes && (
          <div className="p-4 bg-[var(--worship-cream)] rounded-lg border-l-2 border-[var(--worship-gold)]">
            <h4 className="text-xs font-semibold text-[var(--worship-slate)] uppercase mb-1">
              Pastoral Notes
            </h4>
            <p className="text-sm italic font-serif text-[var(--worship-charcoal)]">
              {notes}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (item.kind === 'speaking_moment') {
    const body = str('body');
    const deliveryNotes = str('deliveryNotes');
    return (
      <div className="space-y-6">
        {body ? (
          <pre className="font-serif text-lg leading-relaxed text-[var(--worship-charcoal)] whitespace-pre-wrap font-medium bg-transparent p-0 border-0 m-0">
            {body}
          </pre>
        ) : (
          <p className="text-sm italic text-[var(--worship-muted-slate)]">
            No body content saved.
          </p>
        )}
        {deliveryNotes && (
          <div className="p-4 bg-[var(--worship-cream)] rounded-lg border-l-2 border-[var(--worship-gold)]">
            <h4 className="text-xs font-semibold text-[var(--worship-slate)] uppercase mb-1">
              Delivery Notes
            </h4>
            <p className="text-sm text-[var(--worship-charcoal)]">
              {deliveryNotes}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (item.kind === 'devotional') {
    const opening = str('opening');
    const scripture = str('scripture');
    const body = str('body');
    const questions = arr('discussionQuestions');
    const prayer = str('closingPrayer');
    const hasAny = opening || scripture || body || questions.length > 0 || prayer;
    if (!hasAny) {
      return (
        <p className="text-sm italic text-[var(--worship-muted-slate)]">
          No devotional content saved.
        </p>
      );
    }
    return (
      <div className="space-y-8 text-[var(--worship-charcoal)]">
        {(opening || scripture) && (
          <div className="p-5 bg-[var(--worship-cream)] rounded-xl border-l-2 border-[var(--worship-gold)]">
            {opening && (
              <p className="font-serif italic text-lg leading-relaxed text-[var(--worship-navy)] mb-3">
                "{opening}"
              </p>
            )}
            {scripture && (
              <p className="text-sm font-medium uppercase tracking-widest text-[var(--worship-slate)]">
                — {scripture}
              </p>
            )}
          </div>
        )}
        {body && (
          <div className="space-y-4 text-base leading-relaxed">
            {body.split('\n\n').map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        )}
        {questions.length > 0 && (
          <div className="pt-6 border-t border-[var(--worship-border)]">
            <h3 className="font-serif text-xl text-[var(--worship-navy)] mb-4">
              For Discussion
            </h3>
            <ol className="list-decimal pl-5 space-y-3 marker:text-[var(--worship-gold)] marker:font-medium">
              {questions.map((q, i) => (
                <li key={i} className="pl-2">
                  {String(q)}
                </li>
              ))}
            </ol>
          </div>
        )}
        {prayer && (
          <div className="p-6 bg-[var(--worship-navy)] text-white rounded-xl">
            <h3 className="font-serif text-lg text-[var(--worship-pale-gold)] mb-3">
              Closing Prayer
            </h3>
            <p className="font-serif italic leading-relaxed">{prayer}</p>
          </div>
        )}
      </div>
    );
  }

  if (item.kind === 'soul_care') {
    const tradition = str('practiceTradition');
    const minsRaw = c.durationMinutes;
    const mins = typeof minsRaw === 'number' ? minsRaw : null;
    const leaderNotes = str('leaderNotes');
    const opening = str('opening');
    const sc = (c.scripture as Record<string, unknown> | undefined) ?? {};
    const scRef = typeof sc.reference === 'string' ? sc.reference : '';
    const scText = typeof sc.text === 'string' ? sc.text : '';
    const scRefl = typeof sc.reflection === 'string' ? sc.reflection : '';
    const practices = Array.isArray(c.practices)
      ? (c.practices as Record<string, unknown>[])
      : [];
    const prompts = arr('journalingPrompts');
    const closing = str('closing');
    const takeHome = str('takeHomePractice');
    const hasAny =
      tradition || opening || scRef || practices.length > 0 || closing;
    if (!hasAny) {
      return (
        <p className="text-sm italic text-[var(--worship-muted-slate)]">
          No soul-care session content saved.
        </p>
      );
    }
    return (
      <div className="space-y-8 text-[var(--worship-charcoal)]">
        {(tradition || mins !== null) && (
          <div className="flex flex-wrap gap-2">
            {tradition && (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--worship-pale-gold)] text-[var(--worship-gold)] font-bold">
                {tradition}
              </span>
            )}
            {mins !== null && (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--worship-cream)] text-[var(--worship-slate)] font-bold border border-[var(--worship-border)]">
                {mins} min
              </span>
            )}
          </div>
        )}
        {leaderNotes && (
          <div className="text-xs italic text-[var(--worship-slate)] bg-[var(--worship-cream)]/60 border-l-2 border-[var(--worship-gold)] pl-3 py-2">
            {leaderNotes}
          </div>
        )}
        {opening && (
          <section>
            <h3 className="font-serif text-xs uppercase tracking-widest text-[var(--worship-slate)] mb-2">
              Opening
            </h3>
            <div className="space-y-3 text-base leading-relaxed">
              {opening.split('\n\n').map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        )}
        {scRef && (
          <section className="p-5 bg-[var(--worship-cream)] rounded-xl border-l-2 border-[var(--worship-gold)]">
            <p className="text-xs uppercase tracking-widest text-[var(--worship-slate)] font-semibold mb-2">
              Scripture — {scRef}
            </p>
            {scText && (
              <p className="font-serif italic text-lg leading-relaxed text-[var(--worship-navy)] mb-3">
                "{scText}"
              </p>
            )}
            {scRefl && (
              <p className="text-sm leading-relaxed">{scRefl}</p>
            )}
          </section>
        )}
        {practices.length > 0 && (
          <section className="space-y-6">
            <h3 className="font-serif text-xs uppercase tracking-widest text-[var(--worship-slate)]">
              Guided Practice
            </h3>
            {practices.map((p, idx) => {
              const name =
                typeof p.name === 'string' ? p.name : `Practice ${idx + 1}`;
              const ins =
                typeof p.instructions === 'string' ? p.instructions : '';
              const dur =
                typeof p.durationMinutes === 'number'
                  ? p.durationMinutes
                  : null;
              return (
                <div
                  key={idx}
                  className="border-l-2 border-[var(--worship-navy)]/20 pl-4"
                >
                  <div className="flex items-baseline justify-between mb-2 gap-3">
                    <h4 className="font-serif text-lg text-[var(--worship-navy)]">
                      {idx + 1}. {name}
                    </h4>
                    {dur !== null && (
                      <span className="text-xs text-[var(--worship-gold)] font-medium shrink-0">
                        {dur} min
                      </span>
                    )}
                  </div>
                  <div className="space-y-3 text-base leading-relaxed">
                    {ins.split('\n\n').map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}
        {prompts.length > 0 && (
          <section className="pt-6 border-t border-[var(--worship-border)]">
            <h3 className="font-serif text-xl text-[var(--worship-navy)] mb-4">
              Journaling Prompts
            </h3>
            <ol className="list-decimal pl-5 space-y-3 marker:text-[var(--worship-gold)] marker:font-medium">
              {prompts.map((q, i) => (
                <li key={i} className="pl-2">
                  {String(q)}
                </li>
              ))}
            </ol>
          </section>
        )}
        {closing && (
          <section className="p-6 bg-[var(--worship-navy)] text-white rounded-xl">
            <h3 className="font-serif text-lg text-[var(--worship-pale-gold)] mb-3">
              Closing
            </h3>
            <p className="font-serif italic leading-relaxed">{closing}</p>
          </section>
        )}
        {takeHome && (
          <section>
            <h3 className="font-serif text-xs uppercase tracking-widest text-[var(--worship-slate)] mb-2">
              Take-home practice
            </h3>
            <p className="text-base leading-relaxed">{takeHome}</p>
          </section>
        )}
      </div>
    );
  }

  // song
  const artist = str('artist');
  const style = str('style');
  const bpmRaw = (item.content as Record<string, unknown>).bpm;
  const bpm = typeof bpmRaw === 'number' ? bpmRaw : null;
  // Generated songs save themes on `content.themes`; manually added or
  // bulk-imported repertoire songs may only have user tags. Fall back to
  // `item.tags` so the detail panel surfaces something either way.
  const contentThemes = arr('themes');
  const themes = contentThemes.length > 0 ? contentThemes : (item.tags ?? []);
  const why = str('whyItFits');

  // PCS-synced fields
  const primaryKey = typeof (item.content as Record<string, unknown>).key === 'string'
    ? ((item.content as Record<string, unknown>).key as string)
    : null;
  const availableKeys = arr('availableKeys').filter(k => typeof k === 'string') as string[];
  const contentTags = arr('tags').filter(t => typeof t === 'string') as string[];
  const ccli = str('ccli');
  const copyright = str('copyright');

  const hasAnyInfo = !!(artist || style || bpm !== null || themes.length > 0 || availableKeys.length > 0 || primaryKey || contentTags.length > 0 || ccli || copyright || why);

  return (
    <div className="space-y-5">
      {artist && (
        <p className="text-base text-[var(--worship-slate)] font-medium">
          {artist}
        </p>
      )}
      {(style || bpm !== null || themes.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {style && (
            <span className="text-xs px-2 py-0.5 rounded-md bg-[var(--worship-cream)] text-[var(--worship-slate)] border border-[var(--worship-border)]">
              {style}
            </span>
          )}
          {bpm !== null && (
            <span className="text-xs px-2 py-0.5 rounded-md bg-[var(--worship-pale-gold)] text-[var(--worship-gold)] font-medium border border-[var(--worship-pale-gold)]">
              {bpm} BPM
            </span>
          )}
          {themes.map((t, i) => (
            <span
              key={i}
              className="text-xs px-2 py-0.5 rounded-md bg-[var(--worship-sand)] text-[var(--worship-navy)]"
            >
              {String(t)}
            </span>
          ))}
        </div>
      )}

      {(availableKeys.length > 0 || primaryKey) && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--worship-slate)] mb-2">
            Available Keys
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(availableKeys.length > 0 ? availableKeys : primaryKey ? [primaryKey] : []).map((k) => (
              <span
                key={k}
                className={`text-xs px-2 py-0.5 rounded font-mono font-medium border ${
                  k === primaryKey
                    ? 'bg-[var(--worship-pale-gold)] text-[var(--worship-gold)] border-[var(--worship-pale-gold)]'
                    : 'bg-[var(--worship-cream)] text-[var(--worship-slate)] border-[var(--worship-border)]'
                }`}
              >
                {k}
              </span>
            ))}
          </div>
        </div>
      )}

      {contentTags.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--worship-slate)] mb-2">
            Tags
          </p>
          <div className="flex flex-wrap gap-1.5">
            {contentTags.map((t) => (
              <span
                key={t}
                className="text-xs px-2 py-0.5 rounded-full bg-[var(--worship-sand)] text-[var(--worship-navy)] font-medium"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {why && (
        <p className="text-base italic font-serif text-[var(--worship-charcoal)] leading-relaxed">
          "{why}"
        </p>
      )}

      {(ccli || copyright) && (
        <div className="pt-4 border-t border-[var(--worship-border)] space-y-1">
          {ccli && (
            <p className="text-xs text-[var(--worship-muted-slate)]">
              <span className="font-semibold">CCLI #</span> {ccli}
            </p>
          )}
          {copyright && (
            <p className="text-xs text-[var(--worship-muted-slate)]">
              {copyright}
            </p>
          )}
        </div>
      )}

      {!hasAnyInfo && (
        <p className="text-sm italic text-[var(--worship-muted-slate)]">
          No additional details saved for this song.
        </p>
      )}
    </div>
  );
}
