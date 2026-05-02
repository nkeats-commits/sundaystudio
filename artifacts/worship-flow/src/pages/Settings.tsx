import { AppLayout } from '../components/layout/AppLayout';
import { useUser, useClerk } from '@clerk/react';
import { LogOut, User } from 'lucide-react';
import { useGetMe } from '@workspace/api-client-react';

export default function Settings() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: me } = useGetMe();

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
              <span className="text-[var(--worship-charcoal)]">Active • Free Plan</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[var(--worship-slate)]">Your Profile</span>
              <span className="text-[var(--worship-charcoal)]">{me?.profile?.churchName || "Not configured yet"}</span>
            </div>
          </div>
        </div>

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
