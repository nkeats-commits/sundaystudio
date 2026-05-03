import { Link } from 'wouter';
import { CreditCard, ArrowRight } from 'lucide-react';
import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus';

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

  const headline =
    state?.kind === 'expired'
      ? 'Your free trial has ended'
      : state?.kind === 'past_due'
        ? 'Your payment needs attention'
        : state?.kind === 'canceled'
          ? 'Your subscription has been canceled'
          : 'Subscribe to keep generating';

  const body =
    state?.kind === 'past_due'
      ? 'Update your payment method to keep using WorshipFlow.'
      : 'You can still view and edit, but new generations and saves are paused until you subscribe.';

  const ctaHref = state?.kind === 'past_due' ? '/billing' : '/pricing';
  const ctaLabel = state?.kind === 'past_due' ? 'Manage billing' : 'Subscribe';

  return (
    <>
      <div
        className="mb-4 p-4 rounded-2xl border flex items-start gap-3 flex-wrap"
        style={{
          backgroundColor: 'var(--worship-pale-gold, #F8F4EA)',
          borderColor: 'var(--worship-gold, #C99A3D)',
          color: 'var(--worship-navy, #1F2A44)',
        }}
      >
        <div className="mt-0.5">
          <CreditCard className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">{headline}</div>
          <div className="text-sm opacity-80">{body}</div>
        </div>
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-1 px-4 py-2 rounded-lg worship-btn-primary text-white text-sm font-medium"
        >
          {ctaLabel}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <Component />
    </>
  );
}
