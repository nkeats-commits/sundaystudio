import { Link } from 'wouter';
import { CheckCircle2, Circle, ChevronRight, Sparkles } from 'lucide-react';
import { useGetMe } from '@workspace/api-client-react';
import { useChurchProfileReady } from '../hooks/useChurchProfileReady';

/**
 * Dashboard card that shows the pastor how much of their personalization
 * profile is filled in. Only renders after basic onboarding is complete.
 * When all depth layers are active it shows a quiet success state.
 */
export function PersonalizationCard() {
  const { ready, loading } = useChurchProfileReady();
  const { data: me } = useGetMe();
  const profile = me?.profile;

  if (loading || !ready || !profile) return null;

  const hasVoice = !!(
    (profile.toneDescription as string | null | undefined)?.trim() ||
    (profile.derivedToneDescription as string | null | undefined)?.trim()
  );
  const hasMission = !!(profile.missionStatement as string | null | undefined)?.trim();
  const hasFocus = Array.isArray(profile.focusAreas)
    ? (profile.focusAreas as string[]).length > 0
    : false;

  const churchName = (profile.churchName as string | null | undefined)?.trim() || 'your church';

  const steps: { label: string; description: string; active: boolean }[] = [
    {
      label: 'Basic profile',
      description: 'Church name, theology, traditions',
      active: true,
    },
    {
      label: 'Your voice',
      description: 'Preaching style & writing samples',
      active: hasVoice,
    },
    {
      label: 'Church mission',
      description: 'Mission statement',
      active: hasMission,
    },
    {
      label: 'Ministry focus',
      description: 'Focus areas & emphases',
      active: hasFocus,
    },
  ];

  const completedCount = steps.filter((s) => s.active).length;
  const allComplete = completedCount === steps.length;

  if (allComplete) {
    return (
      <div
        className="flex items-center justify-between gap-4 px-5 py-3.5 rounded-2xl border"
        style={{
          backgroundColor: 'var(--worship-white)',
          borderColor: 'var(--worship-border)',
        }}
      >
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-[var(--worship-gold)]" />
          <p className="text-sm text-[var(--worship-slate)]">
            Sunday Studio knows your voice and mission for{' '}
            <span className="font-medium text-[var(--worship-navy)]">{churchName}</span>.
          </p>
        </div>
        <Link
          href="/church"
          className="text-xs text-[var(--worship-slate)] hover:text-[var(--worship-navy)] shrink-0 flex items-center gap-1"
        >
          Edit <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{
        backgroundColor: 'var(--worship-white)',
        borderColor: 'var(--worship-border)',
      }}
    >
      <div className="px-5 py-4 flex items-start justify-between gap-4 border-b" style={{ borderColor: 'var(--worship-border)' }}>
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
            style={{ backgroundColor: 'var(--worship-pale-gold)', color: 'var(--worship-navy)' }}
          >
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-serif text-[var(--worship-navy)] font-medium leading-snug">
              Want your Sunday Studio results to sound more like you?
            </h3>
            <p className="text-xs text-[var(--worship-slate)] mt-0.5">
              {completedCount} of {steps.length} personalization layers active
            </p>
          </div>
        </div>
        <Link
          href="/church"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold worship-btn-primary text-white whitespace-nowrap"
        >
          Complete profile <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0" style={{ borderColor: 'var(--worship-border)' }}>
        {steps.map((step) => (
          <div key={step.label} className="px-4 py-3 flex items-start gap-2.5">
            {step.active ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[var(--worship-gold)]" />
            ) : (
              <Circle className="w-4 h-4 shrink-0 mt-0.5 text-[var(--worship-border)]" />
            )}
            <div>
              <p
                className={`text-xs font-semibold leading-snug ${
                  step.active ? 'text-[var(--worship-navy)]' : 'text-[var(--worship-slate)]'
                }`}
              >
                {step.label}
              </p>
              <p className="text-[11px] text-[var(--worship-muted-slate)] leading-snug mt-0.5">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
