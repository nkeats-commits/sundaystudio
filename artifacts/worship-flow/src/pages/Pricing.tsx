import { useState } from "react";
import { Link } from "wouter";
import { Check, Sparkles, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCreateBillingCheckoutSession } from "@workspace/api-client-react";
import { useSubscriptionStatus } from "../hooks/useSubscriptionStatus";

const FEATURES = [
  "Unlimited service plans + AI generators",
  "Sermon Builder, Series, and Sermon Resources",
  "Liturgy, songs, speaking moments, devotionals, soul-care",
  "Save and reuse repertoire and templates",
  "Planning Center Services integration",
  "Export to Markdown, plain text, and email",
];

export default function Pricing() {
  const { state, trialDays } = useSubscriptionStatus();
  const checkout = useCreateBillingCheckoutSession();
  const [loading, setLoading] = useState(false);

  const isLapsed =
    state?.kind === "expired" || state?.kind === "canceled";

  const onSubscribe = async () => {
    setLoading(true);
    try {
      const result = await checkout.mutateAsync();
      if (result?.url) {
        window.location.href = result.url;
      } else {
        toast.error("Checkout could not be started.");
        setLoading(false);
      }
    } catch (err: unknown) {
      const data = (err as { data?: { error?: unknown } } | undefined)?.data;
      const msg = typeof data?.error === "string" ? data.error : "Could not start checkout.";
      toast.error(msg);
      setLoading(false);
    }
  };

  const trialBanner =
    state?.kind === "trial" ? (
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
    ) : null;

  return (
    <div
      className="min-h-screen worship-theme"
      style={{ backgroundColor: "var(--worship-cream)" }}
    >
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm mb-8 hover:underline"
          style={{ color: "var(--worship-muted-slate)" }}
        >
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>

        <div className="text-center mb-10">
          {trialBanner}
          <h1
            className="text-4xl font-medium mb-3"
            style={{
              color: "var(--worship-navy)",
              fontFamily: "var(--font-serif)",
            }}
          >
            One simple plan.
          </h1>
          {isLapsed ? (
            <p className="text-lg" style={{ color: "var(--worship-muted-slate)" }}>
              Your trial has ended — here's everything waiting for you:
            </p>
          ) : (
            <p className="text-lg" style={{ color: "var(--worship-muted-slate)" }}>
              Try every feature free for {trialDays} days. No card required.
            </p>
          )}
        </div>

        {isLapsed && (
          <div
            className="rounded-2xl border-2 p-5 mb-6"
            style={{
              backgroundColor: "var(--worship-navy)",
              borderColor: "var(--worship-gold)",
            }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "var(--worship-gold)" }}
            >
              What you had access to
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {FEATURES.map((feat) => (
                <li
                  key={feat}
                  className="flex items-start gap-2 text-sm"
                  style={{ color: "rgba(255,255,255,0.85)" }}
                >
                  <Check
                    className="w-4 h-4 shrink-0 mt-0.5"
                    style={{ color: "var(--worship-gold)" }}
                  />
                  {feat}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div
          className="rounded-2xl border p-8 shadow-sm"
          style={{
            backgroundColor: "var(--worship-white)",
            borderColor: "var(--worship-border)",
          }}
        >
          <div className="flex items-baseline gap-2 mb-2">
            <span
              className="text-2xl font-semibold"
              style={{
                color: "var(--worship-navy)",
                fontFamily: "var(--font-serif)",
              }}
            >
              Sunday Studio Pro
            </span>
          </div>
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
            onClick={onSubscribe}
            disabled={loading || checkout.isPending}
            className="w-full py-3 rounded-xl text-base font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{
              backgroundColor: "var(--worship-navy)",
              color: "var(--worship-white)",
            }}
          >
            {loading || checkout.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Starting checkout…
              </>
            ) : state?.kind === "trial" ? (
              "Subscribe — billing starts when your trial ends"
            ) : (
              "Subscribe to Sunday Studio Pro"
            )}
          </button>

          <p
            className="text-xs text-center mt-3"
            style={{ color: "var(--worship-muted-slate)" }}
          >
            Cancel anytime from the billing portal. Secure checkout via Stripe.
          </p>

          {!isLapsed && (
            <ul className="mt-8 space-y-3">
              {FEATURES.map((feat) => (
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
          )}
        </div>
      </div>
    </div>
  );
}
