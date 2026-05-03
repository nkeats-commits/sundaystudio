import { Link } from "wouter";
import { Sparkles, AlertCircle } from "lucide-react";
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
  if (isLoading || !state) return null;

  if (state.kind === "trial") {
    const days = state.daysLeft ?? 0;
    return (
      <Link
        href="/pricing"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors hover:bg-[var(--worship-pale-gold)]"
        style={{
          backgroundColor: "var(--worship-cream)",
          borderColor: "var(--worship-border)",
          color: "var(--worship-navy)",
        }}
      >
        <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--worship-gold)" }} />
        <span>
          {days === 1 ? "1 day left" : `${days} days left`} in trial · Upgrade
        </span>
      </Link>
    );
  }
  if (state.kind === "past_due") {
    return (
      <Link
        href="/billing"
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
        href="/pricing"
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
