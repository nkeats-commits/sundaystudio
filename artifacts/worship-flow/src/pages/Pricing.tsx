import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Check, Sparkles, ArrowLeft, Loader2, CalendarDays, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateBillingCheckoutSession,
  useRecordTrialEvent,
} from "@workspace/api-client-react";
import { useSubscriptionStatus } from "../hooks/useSubscriptionStatus";
import {
  ACTIVE_TRIAL_CHARGE_COPY,
  ACTIVE_TRIAL_SUBSCRIBE_COPY,
  formatTrialEndDate,
  getPricingReturnContext,
  trialBannerCopy,
} from "../lib/trialConversion";

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
  const { mutate: recordTrialEvent } = useRecordTrialEvent();
  const [location] = useLocation();
  const [loading, setLoading] = useState(false);
  const { returnTo, hasReturnContext, returnLabel } =
    getPricingReturnContext(location);

  const isLapsed =
    state?.kind === "expired" || state?.kind === "canceled";

  const onSubscribe = async () => {
    setLoading(true);
    recordTrialEvent({
      data: {
        event: "ss_upgrade_prompt_clicked",
        context: {
          surface: "pricing",
          returnTo,
          state: state?.kind ?? "unknown",
        },
      },
    });
    try {
      recordTrialEvent({
        data: {
          event: "ss_checkout_started",
          context: {
            surface: "pricing",
            returnTo,
            state: state?.kind ?? "unknown",
          },
        },
      });
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
        data-testid="status-pricing-trial"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-6"
        style={{
          backgroundColor: "var(--worship-pale-gold)",
          color: "var(--worship-navy)",
        }}
      >
        <Sparkles className="w-4 h-4" />
        {state.daysLeft === null
          ? trialBannerCopy(null)
          : trialBannerCopy(state.daysLeft)}
      </div>
    ) : null;

  return (
      <div
        data-testid="page-pricing"
        className="min-h-[100dvh] worship-theme"
      style={{ backgroundColor: "var(--worship-cream)" }}
    >
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href={returnTo}
          data-testid="link-pricing-back"
          className="inline-flex items-center gap-2 text-sm mb-8 hover:underline"
          style={{ color: "var(--worship-muted-slate)" }}
        >
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>

        <div className="text-center mb-10">
          {trialBanner}
          <h1
            data-testid="text-pricing-heading"
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
              Your trial has ended. Your saved work is still here when you are ready:
            </p>
          ) : (
            <p className="text-lg" style={{ color: "var(--worship-muted-slate)" }}>
              Try the complete Sunday rhythm free for {trialDays} days. No card required.
            </p>
          )}
          {hasReturnContext && (
            <p data-testid="text-pricing-return-context" className="mt-3 text-xs" style={{ color: "var(--worship-muted-slate)" }}>
              You can return to {returnLabel} after choosing.
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
            data-testid="card-pricing-plan"
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
              <span data-testid="text-pricing-price">$9.99</span>
            </span>
            <span style={{ color: "var(--worship-muted-slate)" }}>/ month</span>
          </div>

          <button
            type="button"
              data-testid="button-pricing-subscribe"
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
              ACTIVE_TRIAL_SUBSCRIBE_COPY
            ) : (
              "Subscribe to Sunday Studio Pro"
            )}
          </button>

            <p
              data-testid="text-pricing-terms"
            className="text-xs text-center mt-3"
            style={{ color: "var(--worship-muted-slate)" }}
          >
              Cancel anytime from the billing portal. Secure checkout via Stripe.
          </p>

           {state?.kind === "trial" && (
             <div
               data-testid="card-pricing-trial-details"
               className="mt-6 grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
               style={{
                 backgroundColor: "var(--worship-cream)",
                 borderColor: "var(--worship-border)",
               }}
             >
               <div className="flex items-start gap-3">
                 <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--worship-gold)" }} />
                 <div>
                   <p className="text-sm font-semibold" style={{ color: "var(--worship-navy)" }}>
                      {ACTIVE_TRIAL_CHARGE_COPY.heading(formatTrialEndDate(state.trialEndsAt))}
                   </p>
                   <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--worship-muted-slate)" }}>
                      {ACTIVE_TRIAL_CHARGE_COPY.description}
                   </p>
                 </div>
               </div>
               <div className="flex items-start gap-3">
                 <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--worship-success)" }} />
                 <div>
                   <p className="text-sm font-semibold" style={{ color: "var(--worship-navy)" }}>
                     Your work stays available
                   </p>
                   <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--worship-muted-slate)" }}>
                     Plans, sermons, and library items you have saved remain part of your Sunday Studio workspace.
                   </p>
                 </div>
               </div>
             </div>
           )}

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
