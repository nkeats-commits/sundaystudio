import { Link } from 'wouter';
import { BookOpen, Library as LibraryIcon } from 'lucide-react';
import { useListScholarlySources } from '@workspace/api-client-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from './ui/hover-card';

/**
 * Compact pill shown in the Sermon Builder context column to remind the
 * pastor how many scholarly sources will be consulted on every generate.
 * Hover reveals the active source titles; clicking jumps to the Resource
 * Library, anchored to the Bible references section.
 */
export function ScholarlySourcesChip() {
  const { data } = useListScholarlySources();
  if (!data) return null;
  const enabled = data.enabledSourceIds.length;
  const total = data.sources.length;
  const enabledSet = new Set(data.enabledSourceIds);
  const activeSources = data.sources.filter((s) => enabledSet.has(s.id));

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <Link
          href="/resources#bible-references"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border bg-[var(--worship-cream)] text-[var(--worship-navy)] hover:bg-white transition-colors"
          style={{ borderColor: 'var(--worship-border)' }}
        >
          <BookOpen className="w-3 h-3" />
          {enabled === 0
            ? 'No scholarly sources active'
            : `${enabled} of ${total} scholarly sources active`}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-72 p-3 text-sm"
      >
        <div className="text-xs uppercase tracking-wider text-[var(--worship-slate)] mb-2 font-bold">
          Active scholarly sources
        </div>
        {activeSources.length === 0 ? (
          <p className="text-[var(--worship-slate)]">
            No sources are currently enabled. The Sermon Builder will not
            inject commentary or Bible reference context on your behalf.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {activeSources.map((s) => (
              <li
                key={s.id}
                className="text-[var(--worship-charcoal)] leading-snug"
              >
                <span className="font-medium text-[var(--worship-navy)]">
                  {s.title}
                </span>{' '}
                <span className="text-xs text-[var(--worship-slate)]">
                  · {s.kind} · {s.author}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/resources#bible-references"
          className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--worship-navy)] underline"
        >
          <LibraryIcon className="w-3 h-3" />
          Manage sources
        </Link>
      </HoverCardContent>
    </HoverCard>
  );
}
