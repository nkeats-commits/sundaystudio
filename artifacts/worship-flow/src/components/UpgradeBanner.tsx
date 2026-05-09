import { Link } from 'wouter';
import { Flame, ArrowRight } from 'lucide-react';
import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus';

const FEATURES = [
  'Unlimited service plans & AI generators',
  'Sermon Builder with scholarly sources',
  'Song Assistant with your repertoire',
  'Liturgy, speaking moments & devotionals',
];

export function UpgradeBanner() {
  const { state, isLoading } = useSubscriptionStatus();

  if (isLoading) return null;

  const relevant =
    state?.kind === 'expired' ||
    state?.kind === 'canceled' ||
    state?.kind === 'past_due';
  if (!relevant) return null;

  const isPastDue = state?.kind === 'past_due';
  const headline = isPastDue
    ? 'Your payment needs attention'
    : state?.kind === 'canceled'
    ? 'Your subscription has ended'
    : 'Your free trial has ended';
  const sub = isPastDue
    ? 'Update your payment method to restore full access.'
    : 'Subscribe to pick up right where you left off — all your work is still here.';
  const ctaLabel = isPastDue ? 'Update payment →' : 'Subscribe now — $9.99/mo →';
  const ctaHref = isPastDue ? '/billing' : '/pricing';

  return (
    <div
      className="rounded-2xl border-2 p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 mb-2"
      style={{
        backgroundColor: 'var(--worship-navy)',
        borderColor: 'var(--worship-gold)',
        color: 'white',
      }}
    >
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: 'var(--worship-gold)' }}
      >
        <Flame className="w-5 h-5 text-white" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-serif text-lg font-semibold leading-snug mb-1">
          {headline}
        </p>
        <p className="text-sm opacity-80 mb-3">{sub}</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          {FEATURES.map((f) => (
            <li key={f} className="text-xs flex items-center gap-2 opacity-90">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: 'var(--worship-gold)' }}
              />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <Link
        href={ctaHref}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0 transition-opacity hover:opacity-90"
        style={{
          backgroundColor: 'var(--worship-gold)',
          color: 'white',
        }}
      >
        {ctaLabel}
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
