import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ExternalLink, Sparkles, AlertCircle } from "lucide-react";
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

export default function Billing() {
  const { state, trialDays, isLoading, refetch } = useSubscriptionStatus();
  const [location] = useLocation();
  const checkout = useCreateBillingCheckoutSession();
  const portal = useCreateBillingPortalSession();
  const [busy, setBusy] = useState(false);

  // After Stripe Checkout success redirect, refetch and toast.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("status") === "success") {
      toast.success("Subscription confirmed. Welcome to Pro!");
      void refetch();
      // Clean the URL so a refresh doesn't re-toast.
      const cleanUrl =
        window.location.pathname + window.location.hash || "/billing";
      window.history.replaceState({}, "", cleanUrl);
    }
    // location dep so navigating back into /billing re-runs once
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
    } catch (err: any) {
      toast.error(err?.data?.error ?? "Could not start checkout");
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
    } catch (err: any) {
      toast.error(err?.data?.error ?? "Could not open billing portal");
      setBusy(false);
    }
  };

  return (
    <AppLayout title="Billing">
      <div className="max-w-2xl">
        {isLoading || !state ? (
          <div className="flex items-center gap-2 text-sm text-[var(--worship-muted-slate)]">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading billing status…
          </div>
        ) : (
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

            {/* Status block per state.kind */}
            {state.kind === "trial" && (
              <div
                className="flex items-start gap-3 p-4 rounded-lg mb-6"
                style={{ backgroundColor: "var(--worship-pale-gold)" }}
              >
                <Sparkles
                  className="w-5 h-5 mt-0.5 shrink-0"
                  style={{ color: "var(--worship-gold)" }}
                />
                <div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--worship-navy)" }}
                  >
                    {state.daysLeft === 1
                      ? "1 day left in your free trial"
                      : `${state.daysLeft} days left in your free trial`}
                  </p>
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--worship-muted-slate)" }}
                  >
                    Trial ends {formatDate(state.trialEndsAt)}. Subscribe now to
                    keep working without interruption.
                  </p>
                </div>
              </div>
            )}
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
            {(state.kind === "canceled" || state.kind === "expired") && (
              <div
                className="p-4 rounded-lg mb-6"
                style={{ backgroundColor: "var(--worship-cream)" }}
              >
                <p
                  className="text-sm"
                  style={{ color: "var(--worship-navy)" }}
                >
                  {state.kind === "expired"
                    ? `Your ${trialDays}-day free trial has ended.`
                    : "Your subscription is canceled."}{" "}
                  Subscribe to restore access.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {(state.kind === "trial" ||
                state.kind === "expired" ||
                state.kind === "canceled") && (
                <button
                  type="button"
                  onClick={startCheckout}
                  disabled={busy}
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60 flex items-center gap-2"
                  style={{
                    backgroundColor: "var(--worship-navy)",
                    color: "var(--worship-white)",
                  }}
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  Subscribe
                </button>
              )}
              {(state.kind === "active" ||
                state.kind === "trialing" ||
                state.kind === "past_due") && (
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
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
