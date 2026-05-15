import { useCallback } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useSubscriptionStatus } from './useSubscriptionStatus';

interface NudgeCopy {
  message: string;
  description: string;
}

const NUDGE_COPY: Record<string, NudgeCopy> = {
  'sermon-section': {
    message: 'Your sermon is taking shape.',
    description:
      'Upgrade before your trial ends to keep your full Sermon Builder library.',
  },
  'service-plan': {
    message: 'Service plan saved.',
    description:
      "Upgrade so it's still here for you next week — and every week after.",
  },
  'library-save': {
    message: 'Saved to your library.',
    description:
      'Upgrade before your trial ends to make sure everything you build stays with you.',
  },
};

/**
 * Returns `maybeNudge(nudgeKey)` — call it after a high-value action.
 *
 * Rules:
 *   - Only fires for users whose subscription state is "trial".
 *   - Each nudgeKey fires at most once per browser session (sessionStorage).
 *   - Shows a non-blocking sonner toast with a link to /pricing.
 */
export function useTrialNudge() {
  const { state } = useSubscriptionStatus();
  const [, setLocation] = useLocation();

  const maybeNudge = useCallback(
    (nudgeKey: string) => {
      if (state?.kind !== 'trial') return;

      const ssKey = `trial-nudge-${nudgeKey}`;
      if (sessionStorage.getItem(ssKey)) return;
      sessionStorage.setItem(ssKey, '1');

      const copy: NudgeCopy = NUDGE_COPY[nudgeKey] ?? {
        message: 'Loving Sunday Studio?',
        description: 'Upgrade before your trial ends to keep everything.',
      };

      toast(copy.message, {
        description: copy.description,
        duration: 10_000,
        action: {
          label: 'Upgrade →',
          onClick: () => setLocation('/pricing'),
        },
      });
    },
    [state, setLocation],
  );

  return { maybeNudge };
}
