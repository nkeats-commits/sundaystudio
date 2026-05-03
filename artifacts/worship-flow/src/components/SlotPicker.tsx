import { useEffect, useMemo, useState } from 'react';
import {
  useListSermons,
  useListLibraryItems,
  getListSermonsQueryKey,
  getListLibraryItemsQueryKey,
  type ServicePlanItem,
  type LibraryItem,
} from '@workspace/api-client-react';
import { X, Search, BookOpen, Music, Mic, Users, Sprout, ScrollText, Link2 } from 'lucide-react';
import { libraryKindsForSlot, libraryItemBodyPreview } from '../lib/slotMatching';

/**
 * SlotPicker — pick a saved sermon or library item to link into a service
 * plan slot. The exact source list depends on the slot's `kind`:
 *
 *   sermon                        → user's sermons archive
 *   song                          → library items, kind=song
 *   prayer/welcome/benediction/
 *   communion/scripture/transition→ library items, kind=liturgy
 *   custom                        → library items, kind=speaking_moment OR devotional
 *
 * The modal returns a partial ServicePlanItem patch (link fields plus a
 * fresh body snapshot) which the parent merges into the slot. The slot's
 * kind is preserved — we never re-type the slot from underneath the user.
 */

type SlotPickerProps = {
  slot: ServicePlanItem;
  onApply: (patch: Partial<ServicePlanItem>) => void;
  onClose: () => void;
};

/**
 * Returns true when the SlotPicker has a sensible source list for this slot
 * kind. Parents should hide the "Use saved" button when this is false so we
 * never offer the picker for slots like `offering` that have no saved source.
 */
export function slotPickerSupported(kind: ServicePlanItem['kind']): boolean {
  return kind === 'sermon' || libraryKindsForSlot(kind) !== null;
}

function libraryIcon(kind: string) {
  const cls = 'w-4 h-4 text-[var(--worship-navy)]';
  switch (kind) {
    case 'song':
      return <Music className={cls} />;
    case 'liturgy':
      return <BookOpen className={cls} />;
    case 'speaking_moment':
      return <Mic className={cls} />;
    case 'devotional':
      return <Users className={cls} />;
    case 'soul_care':
      return <Sprout className={cls} />;
    default:
      return <BookOpen className={cls} />;
  }
}

export function SlotPicker({ slot, onApply, onClose }: SlotPickerProps) {
  const [search, setSearch] = useState('');
  const isSermon = slot.kind === 'sermon';
  const libraryKinds = libraryKindsForSlot(slot.kind);

  // Close on Escape — modal a11y baseline.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Fire the right list query for this slot kind. Each query handles its
  // own enable so we never run both — the unused branch returns no data.
  const sermonsQuery = useListSermons({
    query: { enabled: isSermon, queryKey: getListSermonsQueryKey() },
  });
  const librarySingleKind =
    !isSermon && libraryKinds && libraryKinds.length === 1 ? libraryKinds[0] : null;
  // For multi-kind slots (e.g. custom → speaking_moment + devotional) we
  // grab the unfiltered list and filter client-side; the API only accepts
  // a single kind filter at a time.
  const libraryParams = librarySingleKind
    ? { kind: librarySingleKind as 'liturgy' | 'song' | 'speaking_moment' | 'devotional' | 'soul_care' }
    : undefined;
  const libraryQuery = useListLibraryItems(libraryParams, {
    query: { enabled: !isSermon, queryKey: getListLibraryItemsQueryKey(libraryParams) },
  });

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (isSermon) {
      const list = sermonsQuery.data ?? [];
      if (!q) return list;
      return list.filter((s) =>
        [s.title, s.passage, s.theme, s.series].join(' ').toLowerCase().includes(q),
      );
    }
    const list = libraryQuery.data ?? [];
    const kindFiltered = libraryKinds
      ? list.filter((l) => libraryKinds.includes(l.kind))
      : list;
    if (!q) return kindFiltered;
    return kindFiltered.filter((l) => l.title.toLowerCase().includes(q));
  }, [isSermon, sermonsQuery.data, libraryQuery.data, libraryKinds, search]);

  const isLoading = isSermon ? sermonsQuery.isLoading : libraryQuery.isLoading;

  const headerLabel = isSermon
    ? 'Use a saved sermon'
    : slot.kind === 'song'
      ? 'Use a saved song'
      : slot.kind === 'custom'
        ? 'Use a saved speaking moment or devotional'
        : 'Use a saved liturgy';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="slot-picker-title"
        className="bg-white w-full max-w-2xl rounded-2xl shadow-xl flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-5 py-4 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--worship-border)' }}
        >
          <div>
            <h2 id="slot-picker-title" className="font-serif text-lg text-[var(--worship-navy)]">{headerLabel}</h2>
            <p className="text-xs text-[var(--worship-slate)]">
              Replaces this slot's title and body, and links it back to the source.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--worship-border)' }}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--worship-cream)] border" style={{ borderColor: 'var(--worship-border)' }}>
            <Search className="w-4 h-4 text-[var(--worship-muted-slate)]" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="flex-1 bg-transparent outline-none text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-sm text-[var(--worship-slate)]">Loading…</div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center">
              <ScrollText className="w-10 h-10 mx-auto mb-3 text-[var(--worship-muted-slate)] opacity-60" />
              <p className="text-sm text-[var(--worship-slate)]">
                Nothing saved yet. {isSermon ? 'Open the Sermon Builder to create one.' : 'Use the generators or save items from the Library to populate this list.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--worship-border)' }}>
              {isSermon
                ? items.map((s) => {
                    const sermon = s as NonNullable<typeof sermonsQuery.data>[number];
                    const bodySnapshot =
                      sermon.bigIdea?.selected ??
                      sermon.bigIdea?.options?.[0]?.bigIdea ??
                      sermon.theme ??
                      '';
                    return (
                      <li key={sermon.id}>
                        <button
                          onClick={() => {
                            onApply({
                              title: sermon.title,
                              body: bodySnapshot,
                              linkedKind: 'sermon',
                              linkedId: sermon.id,
                              linkedTitle: sermon.title,
                            });
                            onClose();
                          }}
                          className="w-full text-left px-5 py-3 hover:bg-[var(--worship-cream)] flex items-start gap-3"
                        >
                          <Mic className="w-4 h-4 text-[var(--worship-navy)] shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-[var(--worship-navy)] truncate">{sermon.title}</div>
                            <div className="text-xs text-[var(--worship-slate)] truncate mt-0.5">
                              {[sermon.passage, sermon.theme].filter(Boolean).join(' • ') || 'No passage'}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })
                : items.map((l) => {
                    const item = l as LibraryItem;
                    const preview = libraryItemBodyPreview(item);
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => {
                            onApply({
                              title: item.title,
                              body: preview,
                              linkedKind: 'library_item',
                              linkedId: item.id,
                              linkedTitle: item.title,
                            });
                            onClose();
                          }}
                          className="w-full text-left px-5 py-3 hover:bg-[var(--worship-cream)] flex items-start gap-3"
                        >
                          <span className="shrink-0 mt-0.5">{libraryIcon(item.kind)}</span>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-[var(--worship-navy)] truncate">{item.title}</div>
                            {preview && (
                              <div className="text-xs text-[var(--worship-slate)] line-clamp-1 mt-0.5">{preview}</div>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Pill rendered next to a slot title when it is linked to a sermon or
 * library item. Clicking navigates to the source. The slot's `body` is a
 * snapshot, so the pill is what makes the underlying link discoverable.
 */
export function LinkedPill({
  slot,
}: {
  slot: ServicePlanItem;
}) {
  if (!slot.linkedKind || !slot.linkedId) return null;
  const href =
    slot.linkedKind === 'sermon'
      ? `/sermons/${slot.linkedId}`
      : '/library';
  const label = slot.linkedTitle ?? (slot.linkedKind === 'sermon' ? 'sermon' : 'library item');
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--worship-pale-gold)] text-[var(--worship-gold)] font-bold hover:underline"
      title={`Linked to ${label}`}
    >
      <Link2 className="w-3 h-3" /> Linked: {label}
    </a>
  );
}
