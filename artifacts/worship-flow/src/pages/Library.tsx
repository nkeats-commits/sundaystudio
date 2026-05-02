import { AppLayout } from '../components/layout/AppLayout';
import {
  useListLibraryItems,
  useDeleteLibraryItem,
  useListServicesLinkedToLibraryItem,
  useCreateLibraryItem,
  useSetLibraryItemRepertoire,
  useBulkImportRepertoire,
  getListLibraryItemsQueryKey,
} from '@workspace/api-client-react';
import {
  BookOpen,
  Music,
  Mic,
  Users,
  Trash2,
  Link2,
  Star,
  Plus,
  ClipboardList,
  X,
  Loader2,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

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
  | 'song'
  | 'speaking_moment'
  | 'devotional';

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
): { title: string; artist?: string }[] {
  const out: { title: string; artist?: string }[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // Try em dash first, then hyphen with surrounding spaces so titles
    // with internal hyphens (e.g. "How He Loves - Live") aren't split.
    const dash = line.search(/\s[—–-]\s/);
    if (dash > 0) {
      const title = line.slice(0, dash).trim();
      const artist = line.slice(dash + 3).trim();
      if (title) out.push({ title, artist: artist || undefined });
    } else {
      out.push({ title: line });
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
              One song per line. Use <code>Title - Artist</code> if you want
              both.
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
              placeholder={`Goodness of God - Bethel Music\nHoly Spirit - Jesus Culture\nIn Christ Alone\n10,000 Reasons — Matt Redman`}
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
  const [tagsInput, setTagsInput] = useState('');
  const create = useCreateLibraryItem();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const a = artist.trim();
    const s = style.trim();
    const content: Record<string, string> = {};
    if (a) content.artist = a;
    if (s) content.style = s;
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
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [showPasteModal, setShowPasteModal] = useState(false);

  // Translate the active tab into a query for the list endpoint. The
  // Repertoire tab is just a Songs-with-flag filter under the hood.
  const listQuery =
    activeTab === 'all'
      ? undefined
      : activeTab === 'repertoire'
        ? { kind: 'song' as const, repertoire: true }
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
    { id: 'all', label: 'All' },
    {
      id: 'repertoire',
      label: 'Our Repertoire',
      suffix: repertoireCount > 0 ? `(${repertoireCount})` : undefined,
    },
    { id: 'liturgy', label: 'Liturgies' },
    { id: 'song', label: 'Songs' },
    { id: 'speaking_moment', label: 'Speaking Moments' },
    { id: 'devotional', label: 'Devotionals' },
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
              onClick={() => setActiveTab(tab.id)}
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
              <button
                onClick={() => setShowPasteModal(true)}
                className="self-start inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--worship-border)] bg-white text-sm font-medium text-[var(--worship-navy)] hover:border-[var(--worship-gold)] hover:text-[var(--worship-gold)] transition-colors"
                data-testid="button-open-paste-modal"
              >
                <ClipboardList className="w-4 h-4" />
                Paste a list
              </button>
            </div>
            <AddSongForm onAdded={invalidateLibrary} />
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C99A3D]"></div>
          </div>
        ) : !items?.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--worship-cream)] flex items-center justify-center mb-4 text-[var(--worship-gold)]">
              {isRepertoireTab ? (
                <Star className="w-8 h-8" />
              ) : (
                <BookOpen className="w-8 h-8" />
              )}
            </div>
            <h3 className="text-lg font-serif text-[var(--worship-navy)] mb-2">
              {isRepertoireTab
                ? 'Your repertoire is empty'
                : 'Nothing here yet'}
            </h3>
            <p className="text-[var(--worship-slate)] max-w-sm">
              {isRepertoireTab
                ? 'Add songs your team already knows so the Song Assistant can prefer or restrict to them.'
                : 'Use the generators from the Dashboard or Sidebar to create and save content to your library.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="worship-card p-5 group flex flex-col hover:border-[var(--worship-gold)] transition-colors"
                data-testid={`library-card-${item.id}`}
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

                <div className="text-sm text-[var(--worship-slate)] line-clamp-3 mb-4 flex-1">
                  {item.kind === 'song' ? (
                    item.content.artist || item.content.style ? (
                      <>
                        {item.content.artist && (
                          <span className="italic">
                            {String(item.content.artist)}
                          </span>
                        )}
                        {item.content.artist && item.content.style && (
                          <span className="text-[var(--worship-muted-slate)]">
                            {' · '}
                          </span>
                        )}
                        {item.content.style && (
                          <span>{String(item.content.style)}</span>
                        )}
                      </>
                    ) : (
                      'No preview available'
                    )
                  ) : item.content.body ? (
                    String(item.content.body)
                  ) : item.content.reflection ? (
                    String(item.content.reflection)
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
                    {item.tags && item.tags.length > 0 && (
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
    </AppLayout>
  );
}
