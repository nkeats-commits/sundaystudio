import { Link } from 'wouter';
import { BookOpen } from 'lucide-react';
import { useListScholarlySources } from '@workspace/api-client-react';

/**
 * Compact pill shown in the Sermon Builder context column to remind the
 * pastor how many scholarly sources will be consulted on every generate.
 * Links to Settings so they can adjust the selection without losing context.
 */
export function ScholarlySourcesChip() {
  const { data } = useListScholarlySources();
  if (!data) return null;
  const enabled = data.enabledSourceIds.length;
  const total = data.sources.length;
  return (
    <Link
      href="/settings"
      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border bg-[var(--worship-cream)] text-[var(--worship-navy)] hover:bg-white transition-colors"
      style={{ borderColor: 'var(--worship-border)' }}
      title="Manage which public-domain commentaries the Sermon Builder consults"
    >
      <BookOpen className="w-3 h-3" />
      {enabled === 0
        ? 'No scholarly sources active'
        : `${enabled} of ${total} scholarly sources active`}
    </Link>
  );
}
