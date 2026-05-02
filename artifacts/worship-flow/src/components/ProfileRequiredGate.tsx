import { Link, useLocation } from 'wouter';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useChurchProfileReady } from '../hooks/useChurchProfileReady';

/**
 * Wrapper that blocks AI generation until the user has filled at least
 * a minimal church profile (name + leader). Renders an inline prompt
 * with a CTA that links to /church?next=<currentPath>, so the profile
 * page can bounce them back here after saving.
 *
 * Children are still rendered (the form remains visible and editable),
 * but anything inside `<ProfileRequiredGate>` that conditions on the
 * `ready` flag should treat `ready === false` as "do not call the AI".
 *
 * For most pages we render the banner above the page body and rely on
 * the per-form button to also disable itself when not ready.
 */
export function ProfileRequiredBanner({
  variant = 'card',
}: {
  variant?: 'card' | 'inline';
}) {
  const { ready, loading } = useChurchProfileReady();
  const [location] = useLocation();
  if (loading || ready) return null;
  const next = encodeURIComponent(location);

  if (variant === 'inline') {
    return (
      <div
        className="mb-4 p-3 rounded-xl border flex items-start md:items-center gap-3 flex-wrap"
        style={{
          backgroundColor: 'var(--worship-pale-gold)',
          borderColor: 'var(--worship-gold)',
          color: 'var(--worship-navy)',
        }}
      >
        <Sparkles className="w-4 h-4 shrink-0" />
        <div className="flex-1 min-w-0 text-sm">
          <strong className="font-semibold">Finish your profile</strong>{' '}
          so the AI can match your theology and traditions.
        </div>
        <Link
          href={`/church?next=${next}`}
          className="text-xs font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg worship-btn-primary text-white inline-flex items-center gap-1"
        >
          Set it up <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  return (
    <div
      className="mb-6 p-5 rounded-2xl border flex items-start gap-4"
      style={{
        backgroundColor: 'var(--worship-white)',
        borderColor: 'var(--worship-gold)',
      }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
        style={{
          backgroundColor: 'var(--worship-pale-gold)',
          color: 'var(--worship-navy)',
        }}
      >
        <Sparkles className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-serif text-lg text-[var(--worship-navy)] mb-1">
          Tell us about your church first
        </h3>
        <p className="text-sm text-[var(--worship-slate)] mb-3">
          The AI works best when it knows your tradition, theology, and the
          rhythms of your congregation. It only takes a minute.
        </p>
        <Link
          href={`/church?next=${next}`}
          className="inline-flex items-center gap-2 worship-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          Set up your profile <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
