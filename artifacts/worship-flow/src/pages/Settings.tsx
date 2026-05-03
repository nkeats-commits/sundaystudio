import { Link } from 'wouter';
import { AppLayout } from '../components/layout/AppLayout';
import { useUser, useClerk } from '@clerk/react';
import { LogOut, User, CreditCard, ArrowRight } from 'lucide-react';
import { useGetMe } from '@workspace/api-client-react';
import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus';
import { ScholarlySourcesPanel } from '../components/ScholarlySourcesPanel';

function formatBillingStatus(
  state: ReturnType<typeof useSubscriptionStatus>['state'],
): string {
  if (!state) return 'Loading…';
  switch (state.kind) {
    case 'trial': {
      const days = state.daysLeft ?? 0;
      return `Trial • ${days} day${days === 1 ? '' : 's'} left`;
    }
    case 'trialing':
      return 'Subscribed • Trialing';
    case 'active':
      return 'Subscribed • $9.99/month';
    case 'past_due':
      return 'Subscribed • Payment past due';
    case 'canceled':
      return 'Canceled';
    case 'expired':
      return 'Trial ended';
    default:
      return 'Unknown';
  }
}

export default function Settings() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: me } = useGetMe();
  const { state, isLoading: subLoading } = useSubscriptionStatus();

  const billingLabel = subLoading ? 'Loading…' : formatBillingStatus(state);

  return (
    <AppLayout title="Settings">
      <div className="max-w-2xl mx-auto space-y-6">
        
        <div className="pb-6 border-b border-[var(--worship-border)]">
          <h1 className="text-2xl font-serif text-[var(--worship-navy)] mb-1">Account Settings</h1>
          <p className="text-sm text-[var(--worship-slate)]">Manage your account and session.</p>
        </div>

        <div className="worship-card space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[var(--worship-gold)] flex items-center justify-center text-[var(--worship-navy)]">
              <User className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-[var(--worship-navy)]">
                {user?.fullName || "Worship Leader"}
              </h2>
              <p className="text-[var(--worship-slate)]">{user?.primaryEmailAddress?.emailAddress}</p>
            </div>
          </div>

          <div className="pt-6 border-t border-[var(--worship-border)] space-y-4">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[var(--worship-slate)]">Account Status</span>
              <span className="text-[var(--worship-charcoal)]">{billingLabel}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[var(--worship-slate)]">Your Profile</span>
              <span className="text-[var(--worship-charcoal)]">{me?.profile?.churchName || "Not configured yet"}</span>
            </div>
            <div className="pt-2">
              <Link
                href="/billing"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--worship-border)] text-sm font-medium text-[var(--worship-navy)] hover:bg-[var(--worship-cream)]"
              >
                <CreditCard className="w-4 h-4" />
                Manage billing
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        <ScholarlySourcesPanel />

        <div className="pt-4 flex">
          <button 
            onClick={() => signOut({ redirectUrl: '/' })}
            className="px-6 py-2.5 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 flex items-center gap-2 font-medium transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>

      </div>
    </AppLayout>
  );
}
