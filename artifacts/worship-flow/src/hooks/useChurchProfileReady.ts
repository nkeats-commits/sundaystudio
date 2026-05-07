import { useGetMe } from '@workspace/api-client-react';

/**
 * The minimum bar to call the church profile "ready enough" to power AI
 * generation: a church name AND a leader name. Both are the only required
 * fields on the profile form, so this matches the user's mental model.
 *
 * Users who completed the onboarding wizard are also considered ready —
 * step 1 requires both fields, and we never want to re-prompt them.
 */
export function useChurchProfileReady(): {
  ready: boolean;
  loading: boolean;
  churchName: string | null;
} {
  const { data: me, isLoading } = useGetMe();
  const profile = me?.profile;
  const churchName = (profile?.churchName ?? '').trim();
  const leaderName = (profile?.leaderName ?? '').trim();
  const profileFilled = churchName.length > 0 && leaderName.length > 0;
  const onboardingDone = !!me?.onboardingCompletedAt;
  const ready = profileFilled || onboardingDone;
  return {
    ready,
    loading: isLoading,
    churchName: churchName || null,
  };
}
