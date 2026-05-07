import { BookOpen } from 'lucide-react';
import type { ScholarlySourceManifest } from '@workspace/api-client-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

/**
 * Small pill showing how many Bible books a scholarly source covers
 * (e.g. "Whole Bible", "Old Testament", "48 books", "Psalms only").
 * Hovering reveals a tooltip with the full book list in canonical order.
 */
export function CoverageBadge({ source }: { source: ScholarlySourceManifest }) {
  const books = source.coveredBooks ?? [];
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full cursor-default select-none shrink-0"
            style={{
              background: 'var(--worship-sand)',
              color: 'var(--worship-navy)',
            }}
          >
            <BookOpen className="w-2.5 h-2.5" />
            {source.scope}
          </span>
        </TooltipTrigger>
        {books.length > 0 && (
          <TooltipContent side="bottom" align="start" className="max-w-xs p-3">
            <p className="text-xs font-semibold mb-1 text-[var(--worship-navy)]">
              {source.bookCount} book{source.bookCount === 1 ? '' : 's'} covered
            </p>
            <p className="text-xs leading-relaxed text-[var(--worship-charcoal)]">
              {books.join(', ')}
            </p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
