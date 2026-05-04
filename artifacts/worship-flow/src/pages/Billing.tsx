import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ExternalLink, Sparkles, AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateBillingCheckoutSession,
  useCreateBillingPortalSession,
} from "@workspace/api-client-react";
import { AppLayout } from "../components/layout/AppLayout";
import { useSubscriptionStatus } from "../hooks/useSubscriptionStatus";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

const PRO_FEATURES = [
  "Unlimited service plans + AI generators",
  "Sermon Builder, Series, and Resource Library",
  "Liturgy, songs, speaking moments, devotionals, soul-care",
  "Save and reuse repertoire and templates",
  "Planning Center Services integration",
  "Export to Markdown, plain text, and email",
];

export default function Billing() {
  const { state, trialDays, isLoading, refetch } = useSubscriptionStatus();
  const [location] = useLocation();
  const checkout = useCreateBillingCheckoutSession();
  const portal = useCreateBillingPortalSession();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("status") === "success") {
      toast.success("Subscription confirmed. Welcome to Pro!");
      void refetch();
      const cleanUrl =
        window.location.pathname + window.location.hash || "/billing";
      window.history.replaceState({}, "", cleanUrl);
    }
  }, [location, refetch]);

  const startCheckout = async () => {
    setBusy(true);
    try {
      const r = await checkout.mutateAsync();
      if (r?.url) window.location.href = r.url;
      else {
        toast.error("Could not start checkout");
        setBusy(false);
      }
    } catch (err: unknown) {
      const data = (err as { data?: { error?: unknown } } | undefined)?.data;
      toast.error(typeof data?.error === "string" ? data.error : "Could not start checkout");
      setBusy(false);
    }
  };

  const openPortal = async () => {
    setBusy(true);
    try {
      const r = await portal.mutateAsync();
      if (r?.url) window.location.href = r.url;
      else {
        toast.error("Could not open billing portal");
        setBusy(false);
      }
    } catch (err: unknown) {
      const data = (err as { data?: { error?: unknown } } | undefined)?.data;
      toast.error(typeof data?.error === "string" ? data.error : "Could not open billing portal");
      setBusy(false);
    }
  };

  if (isLoading || !state) {
    return (
      <AppLayout title="Billing">
        <div className="flex items-center gap-2 text-sm text-[var(--worship-muted-slate)]">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading billing status…
        </div>
      </AppLayout>
    );
  }

  // --- Trial state: full pricing layout ---
  if (state.kind === "trial" || state.kind === "expired" || state.kind === "canceled") {
    return (
      <AppLayout title="Billing">
        <div className="max-w-2xl">
          <div className="text-center mb-8">
            {state.kind === "trial" ? (
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-6"
                style={{
                  backgroundColor: "var(--worship-pale-gold)",
                  color: "var(--worship-navy)",
                }}
              >
                <Sparkles className="w-4 h-4" />
                {state.daysLeft === 1
                  ? "1 day left in your trial"
                  : `${state.daysLeft} days left in your trial`}
              </div>
            ) : (
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-6"
                style={{ backgroundColor: "#FEF2F2", color: "#991B1B" }}
              >
                {state.kind === "expired"
                  ? "Your trial has ended — subscribe to keep building."
                  : "Your subscription is canceled — resubscribe to restore access."}
              </div>
            )}

            <h1
              className="text-4xl font-medium mb-3"
              style={{
                color: "var(--worship-navy)",
                fontFamily: "var(--font-serif)",
              }}
            >
              One simple plan.
            </h1>
            <p className="text-lg" style={{ color: "var(--worship-muted-slate)" }}>
              Try every feature free for {trialDays} days. No card required.
            </p>
          </div>

          <div
            className="rounded-2xl border p-8 shadow-sm"
            style={{
              backgroundColor: "var(--worship-white)",
              borderColor: "var(--worship-border)",
            }}
          >
            <p
              className="text-2xl font-semibold mb-2"
              style={{
                color: "var(--worship-navy)",
                fontFamily: "var(--font-serif)",
              }}
            >
              WorshipFlow Pro
            </p>
            <div className="flex items-baseline gap-2 mb-6">
              <span
                className="text-5xl font-bold"
                style={{ color: "var(--worship-navy)" }}
              >
                $9.99
              </span>
              <span style={{ color: "var(--worship-muted-slate)" }}>/ month</span>
            </div>

            <button
              type="button"
              onClick={startCheckout}
              disabled={busy}
              className="w-full py-3 rounded-xl text-base font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-3"
              style={{
                backgroundColor: "var(--worship-navy)",
                color: "var(--worship-white)",
              }}
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Starting checkout…
                </>
              ) : state.kind === "trial" ? (
                "Subscribe — billing starts when your trial ends"
              ) : (
                "Subscribe to WorshipFlow Pro"
              )}
            </button>

            <p
              className="text-xs text-center"
              style={{ color: "var(--worship-muted-slate)" }}
            >
              Cancel anytime from the billing portal. Secure checkout via Stripe.
            </p>

            <ul className="mt-8 space-y-3">
              {PRO_FEATURES.map((feat) => (
                <li
                  key={feat}
                  className="flex items-start gap-3 text-sm"
                  style={{ color: "var(--worship-charcoal)" }}
                >
                  <Check
                    className="w-5 h-5 shrink-0 mt-0.5"
                    style={{ color: "var(--worship-gold)" }}
                  />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </AppLayout>
    );
  }

  // --- Active / trialing / past_due states ---
  return (
    <AppLayout title="Billing">
      <div className="max-w-2xl">
        <div
          className="rounded-2xl border p-8 shadow-sm"
          style={{
            backgroundColor: "var(--worship-white)",
            borderColor: "var(--worship-border)",
          }}
        >
          <h2
            className="text-xl font-medium mb-1"
            style={{
              color: "var(--worship-navy)",
              fontFamily: "var(--font-serif)",
            }}
          >
            WorshipFlow Pro
          </h2>
          <p
            className="text-sm mb-6"
            style={{ color: "var(--worship-muted-slate)" }}
          >
            $9.99 / month · Cancel anytime
          </p>

          {(state.kind === "active" || state.kind === "trialing") && (
            <div className="p-4 rounded-lg mb-6 bg-emerald-50 border border-emerald-200">
              <p className="text-sm font-medium text-emerald-900">
                {state.kind === "trialing"
                  ? "Trialing — your subscription starts soon"
                  : "Subscription active"}
              </p>
              <p className="text-xs mt-1 text-emerald-800">
                {state.kind === "active" && state.cancelAtPeriodEnd
                  ? `Set to cancel on ${formatDate(state.currentPeriodEnd)}`
                  : `Renews ${formatDate(state.currentPeriodEnd)}`}
              </p>
            </div>
          )}

          {state.kind === "past_due" && (
            <div className="p-4 rounded-lg mb-6 bg-red-50 border border-red-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-900">
                    Payment issue
                  </p>
                  <p className="text-xs mt-1 text-red-800">
                    We couldn't charge your card. Open the billing portal to
                    update your payment method.
                  </p>
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={openPortal}
            disabled={busy}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold border disabled:opacity-60 flex items-center gap-2"
            style={{
              borderColor: "var(--worship-border)",
              color: "var(--worship-navy)",
              backgroundColor: "var(--worship-white)",
            }}
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4" />
            )}
            Manage billing
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
