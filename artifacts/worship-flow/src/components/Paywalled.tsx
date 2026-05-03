import { Link } from 'wouter';
import { CreditCard, ArrowRight, Loader2 } from 'lucide-react';
import { AppLayout } from './layout/AppLayout';
import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus';

interface PaywalledProps {
  component: React.ComponentType;
}

/**
 * Route-level subscription gate. Wraps any page whose primary actions
 * require an active subscription (generators, builders, mutating planning
 * surfaces). When the user is on a valid trial / active / trialing
 * subscription, the wrapped page renders normally. Otherwise the page
 * body is replaced with a blocking subscribe CTA inside AppLayout — the
 * sidebar and header stay visible so the user can still navigate to
 * /billing or anywhere read-only.
 *
 * The server already 402s on every gated mutation, so this gate is the
 * UX layer that disables CTAs *before* submission rather than after.
 */
export default function Paywalled({ component: Component }: PaywalledProps) {
  const { allowed, isLoading, state } = useSubscriptionStatus();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24 text-[#64748B]">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (allowed) return <Component />;

  const headline =
    state?.kind === 'expired'
      ? 'Your free trial has ended'
      : state?.kind === 'past_due'
        ? 'Your payment needs attention'
        : state?.kind === 'canceled'
          ? 'Your subscription has been canceled'
          : 'Subscribe to keep planning worship';

  const body =
    state?.kind === 'past_due'
      ? 'Update your payment method in the billing portal to keep using WorshipFlow.'
      : "You can still browse what you've already created. Subscribe for $9.99/month to unlock new generations, sermons, and service plans.";

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto mt-16 p-8 rounded-2xl border bg-[#FFFDF8] border-[#E5E1D8] shadow-sm text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-[#F8F4EA] flex items-center justify-center mb-4">
          <CreditCard className="w-6 h-6 text-[#1F2A44]" />
        </div>
        <h1 className="font-serif text-2xl text-[#1F2A44] mb-2">{headline}</h1>
        <p className="text-[#64748B] mb-6">{body}</p>
        <Link
          href={state?.kind === 'past_due' ? '/billing' : '/pricing'}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg worship-btn-primary text-white font-medium"
        >
          {state?.kind === 'past_due' ? 'Manage billing' : 'Subscribe'}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </AppLayout>
  );
}
