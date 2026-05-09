import { Link } from 'wouter';
import { Flame, ArrowRight, Check } from 'lucide-react';
import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus';

const FEATURES = [
  'Unlimited service plans & AI generators',
  'Sermon Builder with scholarly sources',
  'Song Assistant with your repertoire',
  'Soul Care, liturgy & speaking moments',
];

interface PaywalledProps {
  component: React.ComponentType;
}

/**
 * Route-level subscription banner. Wraps any page whose primary actions
 * require an active subscription. The page (forms, lists, drafts) stays
 * fully visible and editable so lapsed users keep read access — only the
 * server-side mutation is gated. We render a prominent banner above the
 * page so the user knows that submitting will be blocked, and the
 * shared 402 handler in App.tsx will bounce them to /pricing if they
 * try anyway.
 */
export default function Paywalled({ component: Component }: PaywalledProps) {
  const { allowed, isLoading, state } = useSubscriptionStatus();

  if (isLoading || allowed) return <Component />;

  const isPastDue = state?.kind === 'past_due';

  const headline = isPastDue
    ? 'Your payment needs attention'
    : state?.kind === 'canceled'
    ? 'Your subscription has ended'
    : 'Your free trial has ended';

  const body = isPastDue
    ? 'Update your payment method to restore full access to Sunday Studio.'
    : 'You can still view and edit your saved work — subscribe to unlock AI generation and saving.';

  const ctaHref = isPastDue ? '/billing' : '/pricing';
  const ctaLabel = isPastDue ? 'Update payment →' : 'Subscribe now — $9.99/mo →';

  return (
    <>
      <div
        className="mb-6 rounded-2xl border-2 overflow-hidden"
        style={{ borderColor: 'var(--worship-gold)' }}
      >
        <div
          className="px-5 py-4 flex items-center gap-3"
          style={{ backgroundColor: 'var(--worship-navy)' }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'var(--worship-gold)' }}
          >
            <Flame className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-serif font-semibold text-white leading-snug">{headline}</p>
            <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {body}
            </p>
          </div>
          <Link
            href={ctaHref}
            className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap shrink-0 transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--worship-gold)', color: 'white' }}
          >
            {ctaLabel}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {!isPastDue && (
          <div
            className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
            style={{ backgroundColor: 'var(--worship-cream)' }}
          >
            <ul className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              {FEATURES.map((f) => (
                <li
                  key={f}
                  className="flex items-center gap-2 text-xs"
                  style={{ color: 'var(--worship-charcoal)' }}
                >
                  <Check
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: 'var(--worship-gold)' }}
                  />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href={ctaHref}
              className="sm:hidden inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--worship-navy)', color: 'white' }}
            >
              {ctaLabel}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {isPastDue && (
          <Link
            href={ctaHref}
            className="sm:hidden flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--worship-gold)', color: 'white' }}
          >
            {ctaLabel}
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <Component />
    </>
  );
}
