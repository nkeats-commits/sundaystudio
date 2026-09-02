import { useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Sparkles, AlertCircle } from "lucide-react";
import { useRecordTrialEvent } from "@workspace/api-client-react";
import { useSubscriptionStatus } from "../hooks/useSubscriptionStatus";

/**
 * Compact pill shown in the Header.  Renders different states:
 *   - trial: "X days left in trial" + Upgrade link
 *   - past_due: "Payment issue" + Manage link
 *   - canceled / expired: "Trial ended" + Subscribe link
 *   - active / trialing: nothing (silent)
 */
export function TrialPill() {
  const { state, isLoading } = useSubscriptionStatus();
  const [location] = useLocation();
  const { mutate } = useRecordTrialEvent();
  const mutateRef = useRef(mutate);
  const shownRef = useRef(false);
  mutateRef.current = mutate;

  useEffect(() => {
    if (state?.kind !== "trial" || shownRef.current) return;
    shownRef.current = true;
    mutateRef.current({
      data: {
        event: "ss_upgrade_prompt_shown",
        context: {
          surface: "trial-pill",
          daysLeft: state.daysLeft ?? null,
          trialEndsAt: state.trialEndsAt ?? null,
        },
      },
    });
  }, [state?.kind, state?.daysLeft, state?.trialEndsAt]);

  if (isLoading || !state) return null;

  if (state.kind === "trial") {
    const days = state.daysLeft;
    const pricingHref = `/pricing?returnTo=${encodeURIComponent(location)}`;
    return (
      <Link
        href={pricingHref}
        data-testid="link-trial-pill"
        aria-label="View your trial and subscription options"
        onClick={() =>
          mutateRef.current({
            data: {
              event: "ss_upgrade_prompt_clicked",
              context: { surface: "trial-pill", daysLeft: days },
            },
          })
        }
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors hover:bg-[var(--worship-pale-gold)]"
        style={{
          backgroundColor: "var(--worship-cream)",
          borderColor: "var(--worship-border)",
          color: "var(--worship-navy)",
        }}
      >
        <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--worship-gold)" }} />
        <span data-testid="text-trial-pill-days">
          {days === null
            ? "Trial active · View options"
            : days === 0
            ? "Trial ends today · View options"
            : `${days === 1 ? "1 day" : `${days} days`} left · View options`}
        </span>
      </Link>
    );
  }
  if (state.kind === "past_due") {
    return (
      <Link
        href="/billing"
        data-testid="link-payment-issue-pill"
        aria-label="Fix your payment issue"
        onClick={() =>
          mutateRef.current({
            data: {
              event: "ss_upgrade_prompt_clicked",
              context: { surface: "trial-pill", state: "past_due" },
            },
          })
        }
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors hover:bg-red-50"
        style={{ backgroundColor: "#FEF2F2", borderColor: "#FCA5A5", color: "#991B1B" }}
      >
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Payment issue · Fix now</span>
      </Link>
    );
  }
  if (state.kind === "canceled" || state.kind === "expired") {
    return (
      <Link
        href={`/pricing?returnTo=${encodeURIComponent(location)}`}
        data-testid="link-trial-ended-pill"
        aria-label="View subscription options"
        onClick={() =>
          mutateRef.current({
            data: {
              event: "ss_upgrade_prompt_clicked",
              context: { surface: "trial-pill", state: state.kind },
            },
          })
        }
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors hover:bg-[var(--worship-pale-gold)]"
        style={{
          backgroundColor: "var(--worship-cream)",
          borderColor: "var(--worship-border)",
          color: "var(--worship-navy)",
        }}
      >
        <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--worship-gold)" }} />
        <span>Trial ended · Subscribe</span>
      </Link>
    );
  }
  return null;
}
