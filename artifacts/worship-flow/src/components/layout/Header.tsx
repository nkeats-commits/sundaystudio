import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, FileText, BookOpen, Mic, Music, X } from 'lucide-react';
import { useLocation } from 'wouter';
import {
  useListSermons,
  useListServicePlans,
  useListLibraryItems,
  getListSermonsQueryKey,
  getListServicePlansQueryKey,
  getListLibraryItemsQueryKey,
} from '@workspace/api-client-react';

type SearchHit = {
  id: string;
  href: string;
  title: string;
  subtitle: string;
  kind: 'sermon' | 'service' | 'library';
};

function useDebounced<T>(value: T, delay = 150): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function Header({ title = 'Dashboard' }: { title?: string }) {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const debounced = useDebounced(query.trim().toLowerCase(), 150);

  // Only fetch lists once the user starts searching, to avoid unnecessary
  // network on every page nav. React Query caches them across the session.
  const enabled = debounced.length >= 2;
  const sermonsQ = useListSermons({
    query: { enabled, queryKey: getListSermonsQueryKey() },
  });
  const servicesQ = useListServicePlans({
    query: { enabled, queryKey: getListServicePlansQueryKey() },
  });
  const libraryQ = useListLibraryItems(undefined, {
    query: { enabled, queryKey: getListLibraryItemsQueryKey() },
  });

  const hits = useMemo<SearchHit[]>(() => {
    if (debounced.length < 2) return [];
    const out: SearchHit[] = [];
    const match = (s: string | null | undefined) =>
      !!s && s.toLowerCase().includes(debounced);

    for (const s of sermonsQ.data ?? []) {
      if (match(s.title) || match(s.passage) || match(s.theme) || match(s.series)) {
        out.push({
          id: `sermon-${s.id}`,
          href: `/sermons/${s.id}`,
          title: s.title,
          subtitle:
            [s.passage, s.theme, s.series].filter(Boolean).join(' · ') ||
            'Sermon',
          kind: 'sermon',
        });
      }
    }
    for (const sp of servicesQ.data ?? []) {
      if (match(sp.title) || match(sp.scripture) || match(sp.theme) || match(sp.season)) {
        out.push({
          id: `service-${sp.id}`,
          href: `/services/${sp.id}`,
          title: sp.title,
          subtitle:
            [sp.scripture, sp.theme, sp.season].filter(Boolean).join(' · ') ||
            'Service plan',
          kind: 'service',
        });
      }
    }
    for (const li of libraryQ.data ?? []) {
      if (match(li.title) || (li.tags ?? []).some((t) => match(t))) {
        out.push({
          id: `lib-${li.id}`,
          href: `/library`,
          title: li.title,
          subtitle: li.kind.replace(/_/g, ' '),
          kind: 'library',
        });
      }
    }
    return out.slice(0, 8);
  }, [debounced, sermonsQ.data, servicesQ.data, libraryQ.data]);

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const go = (hit: SearchHit) => {
    setLocation(hit.href);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      (e.currentTarget as HTMLInputElement).blur();
    } else if (e.key === 'Enter' && hits.length > 0) {
      e.preventDefault();
      go(hits[0]!);
    }
  };

  const iconFor = (kind: SearchHit['kind']) => {
    if (kind === 'sermon') return <Mic className="w-3.5 h-3.5" />;
    if (kind === 'service') return <FileText className="w-3.5 h-3.5" />;
    return <Music className="w-3.5 h-3.5" />;
  };

  return (
    <header
      className="h-16 flex items-center justify-between px-8 border-b shrink-0 worship-app-chrome"
      style={{
        backgroundColor: 'var(--worship-white)',
        borderColor: 'var(--worship-border)',
      }}
    >
      <h2
        className="text-xl font-medium"
        style={{
          color: 'var(--worship-navy)',
          fontFamily: 'var(--font-serif)',
        }}
      >
        {title}
      </h2>

      <div className="flex items-center gap-6">
        <div ref={containerRef} className="relative hidden md:block">
          <Search
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--worship-muted-slate)' }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search sermons, services, library..."
            className="pl-9 pr-8 py-1.5 rounded-full text-sm outline-none w-64 transition-all focus:w-80"
            style={{
              backgroundColor: 'var(--worship-cream)',
              color: 'var(--worship-charcoal)',
              border: '1px solid var(--worship-border)',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setOpen(false);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-white"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" style={{ color: 'var(--worship-muted-slate)' }} />
            </button>
          )}

          {open && debounced.length >= 2 && (
            <div
              className="absolute right-0 top-[110%] w-96 max-h-96 overflow-y-auto rounded-xl shadow-lg border z-50"
              style={{
                backgroundColor: 'var(--worship-white)',
                borderColor: 'var(--worship-border)',
              }}
            >
              {hits.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-[var(--worship-muted-slate)]">
                  <BookOpen className="w-5 h-5 mx-auto mb-2 opacity-50" />
                  No matches for "{query}"
                </div>
              ) : (
                <ul className="py-1">
                  {hits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        onClick={() => go(hit)}
                        className="w-full text-left px-4 py-2.5 hover:bg-[var(--worship-cream)] flex items-start gap-3 transition-colors"
                      >
                        <span
                          className="mt-0.5 w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: 'var(--worship-pale-gold)',
                            color: 'var(--worship-navy)',
                          }}
                        >
                          {iconFor(hit.kind)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-[var(--worship-navy)] truncate">
                            {hit.title}
                          </span>
                          <span className="block text-xs text-[var(--worship-muted-slate)] truncate">
                            {hit.subtitle}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
