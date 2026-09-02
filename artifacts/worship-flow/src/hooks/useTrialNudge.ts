import { useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { toast } from "sonner";
import { useRecordTrialEvent } from "@workspace/api-client-react";
import { useSubscriptionStatus } from "./useSubscriptionStatus";

interface NudgeCopy {
  message: string;
  description: string;
}

const NUDGE_COPY: Record<string, NudgeCopy> = {
  'sermon-section': {
    message: 'Your sermon is becoming a message you can carry into Sunday.',
    description:
      'Keep the research, drafts, and next section together after your trial.',
  },
  'service-plan': {
    message: 'This Sunday is taking shape.',
    description:
      "Keep this plan ready for your team next week — and every week after.",
  },
  'library-save': {
    message: 'A useful piece for your ministry is now saved.',
    description:
      'Keep your growing library close whenever the next Sunday begins.',
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
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const { mutate } = useRecordTrialEvent();
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;

  const maybeNudge = useCallback(
    (nudgeKey: string) => {
      if (state?.kind !== 'trial') return;

      const userKey = user?.id ?? "anonymous";
      const today = new Date().toISOString().slice(0, 10);
      const sessionKey = `ss-trial-nudge:${userKey}:${nudgeKey}`;
      const dayKey = `ss-trial-nudge:${userKey}:${nudgeKey}:day`;
      let alreadyShown = false;
      try {
        alreadyShown =
          window.sessionStorage.getItem(sessionKey) === "1" ||
          window.localStorage.getItem(dayKey) === today;
        if (alreadyShown) return;
        window.sessionStorage.setItem(sessionKey, "1");
        window.localStorage.setItem(dayKey, today);
      } catch {
        // Continue without a persistence cap if browser storage is unavailable.
      }

      const copy: NudgeCopy = NUDGE_COPY[nudgeKey] ?? {
        message: 'Your Sunday preparation is moving forward.',
        description: 'Keep everything you have built available for the weeks ahead.',
      };

      mutateRef.current({
        data: {
          event: "ss_upgrade_prompt_shown",
          context: {
            source: nudgeKey,
            surface: "trial-nudge",
            daysLeft: state.daysLeft ?? null,
          },
        },
      });

      toast(copy.message, {
        description: copy.description,
        duration: 10_000,
        closeButton: true,
        action: {
          label: 'See your options',
          onClick: () => {
            mutateRef.current({
              data: {
                event: "ss_upgrade_prompt_clicked",
                context: { source: nudgeKey, surface: "trial-nudge" },
              },
            });
            const returnTo =
              window.location.pathname + window.location.search;
            setLocation(`/pricing?returnTo=${encodeURIComponent(returnTo)}`);
          },
        },
      });
    },
    [state?.kind, state?.daysLeft, setLocation, user?.id],
  );

  return { maybeNudge };
}
