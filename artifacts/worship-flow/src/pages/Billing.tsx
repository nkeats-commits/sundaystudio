import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Loader2,
  ExternalLink,
  Sparkles,
  AlertCircle,
  Check,
  Calendar,
  Zap,
  Users,
  BookOpen,
  MessageCircle,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCreateBillingCheckoutSession,
  useCreateBillingPortalSession,
  useRecordTrialEvent,
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

const OUTCOMES = [
  {
    icon: Calendar,
    headline: "Walk into Sunday prepared, not scrambling",
    body: "Build complete service plans in minutes — order of worship, transitions, speaking cues — all in one place.",
  },
  {
    icon: Zap,
    headline: "Generate liturgy, songs, and moments instantly",
    body: "AI-powered tools for every part of the service: call to worship, benedictions, speaking moments, and more.",
  },
  {
    icon: BookOpen,
    headline: "Preach with depth, not just bullet points",
    body: "The Sermon Builder gives you commentary, cross-references, and structured outlines — right where you write.",
  },
  {
    icon: Users,
    headline: "Keep your whole team aligned",
    body: "Share service plans, assign roles, and send devotionals that spiritually prepare your team before Sunday.",
  },
  {
    icon: MessageCircle,
    headline: "Small group questions, ready to go",
    body: "Generate discussion questions tied to your sermon or theme — ready to hand off to your small group leaders.",
  },
  {
    icon: FileText,
    headline: "Export anything, anytime",
    body: "Send your order of worship as Markdown, plain text, or email — formatted and ready to share.",
  },
];

export default function Billing() {
  const { state, trialDays, isLoading, refetch } = useSubscriptionStatus();
  const [location] = useLocation();
  const checkout = useCreateBillingCheckoutSession();
  const portal = useCreateBillingPortalSession();
  const { mutate: recordTrialEvent } = useRecordTrialEvent();
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
    recordTrialEvent({
      data: {
        event: "ss_upgrade_prompt_clicked",
        context: { surface: "billing", state: state?.kind ?? "unknown" },
      },
    });
    try {
      recordTrialEvent({
        data: {
          event: "ss_checkout_started",
          context: { surface: "billing", state: state?.kind ?? "unknown" },
        },
      });
      const r = await checkout.mutateAsync();
      if (r?.url) window.location.href = r.url;
      else {
        toast.error("Could not start checkout");
        setBusy(false);
      }
    } catch (err: unknown) {
      const data = (err as { data?: { error?: unknown } } | undefined)?.data;
      toast.error(
        typeof data?.error === "string" ? data.error : "Could not start checkout",
      );
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
      toast.error(
        typeof data?.error === "string"
          ? data.error
          : "Could not open billing portal",
      );
      setBusy(false);
    }
  };

  if (isLoading || !state) {
    return (
      <AppLayout title="Billing">
        <div data-testid="loading-billing" className="max-w-2xl animate-pulse space-y-4">
          <div className="h-8 w-48 rounded-lg bg-[var(--worship-sand)] opacity-50" />
          <div className="h-64 rounded-2xl bg-[var(--worship-sand)] opacity-35" />
        </div>
      </AppLayout>
    );
  }

  // ── Trial / expired / canceled: full StoryBrand upsell layout ──────────
  if (
    state.kind === "trial" ||
    state.kind === "expired" ||
    state.kind === "canceled"
  ) {
    const isExpiredOrCanceled =
      state.kind === "expired" || state.kind === "canceled";

    return (
      <AppLayout title="Billing">
        <div className="max-w-2xl space-y-10">

          {/* ── Trial countdown / expired badge ── */}
          <div className="flex justify-center">
            {state.kind === "trial" ? (
              <div
                data-testid={state.kind === "trial" ? "status-billing-trial" : "status-billing-lapsed"}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: "var(--worship-pale-gold)",
                  color: "var(--worship-navy)",
                }}
              >
                <Sparkles className="w-4 h-4" style={{ color: "var(--worship-gold)" }} />
                {state.daysLeft === null
                  ? "Your free trial is active"
                  : state.daysLeft === 1
                  ? "1 day left in your free trial"
                  : `${state.daysLeft} days left in your free trial`}
              </div>
            ) : (
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
                style={{ backgroundColor: "#FEF2F2", color: "#991B1B" }}
              >
                {state.kind === "expired"
                  ? "Your free trial has ended"
                  : "Your subscription is canceled"}
              </div>
            )}
          </div>

          {/* ── StoryBrand hero: problem + guide ── */}
          <div className="text-center space-y-3">
              <h1
                data-testid="text-billing-heading"
              className="text-4xl font-medium leading-tight"
              style={{
                color: "var(--worship-navy)",
                fontFamily: "var(--font-serif)",
              }}
            >
              {isExpiredOrCanceled
                ? "Ready to plan with confidence again?"
                : "Sunday keeps coming.\nSunday Studio keeps you ready."}
            </h1>
              <p
                data-testid="text-billing-description"
              className="text-base max-w-lg mx-auto"
              style={{ color: "var(--worship-muted-slate)" }}
            >
              {isExpiredOrCanceled
                ? "Pick up right where you left off. Everything you need to plan, preach, and lead with depth — for less than a cup of coffee a week."
                : "We know what it feels like to face Sunday morning with a half-formed plan. Sunday Studio gives you the tools to lead with depth, not just survive the week."}
            </p>
          </div>

          {/* ── Pricing + CTA card ── */}
          <div
            className="rounded-2xl border p-8 shadow-sm"
            style={{
              backgroundColor: "var(--worship-white)",
              borderColor: "var(--worship-border)",
            }}
          >
            <div className="flex items-baseline gap-2 mb-1">
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
              <span style={{ color: "var(--worship-muted-slate)" }}>
                / month
              </span>
            </div>

            <button
              type="button"
              data-testid="button-billing-subscribe"
              onClick={startCheckout}
              disabled={busy}
              className="w-full py-3.5 rounded-xl text-base font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-3"
              style={{
                backgroundColor: "var(--worship-navy)",
                color: "var(--worship-white)",
              }}
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Starting
                  checkout…
                </>
              ) : state.kind === "trial" ? (
                "Subscribe — billing starts when your trial ends"
              ) : (
                "Subscribe to Sunday Studio Pro"
              )}
            </button>

            <p
              data-testid="text-billing-terms"
              className="text-xs text-center"
              style={{ color: "var(--worship-muted-slate)" }}
            >
              {state.kind === "trial"
                ? `No charge today. Your first $9.99 charge is scheduled for ${formatDate(state.trialEndsAt)}. Cancel before then or anytime from the billing portal.`
                : "Cancel anytime from the billing portal. Secure checkout via Stripe."}
            </p>
          </div>

          {state.kind === "trial" && (
            <div
              data-testid="card-billing-trial-reassurance"
              className="rounded-xl border p-5"
              style={{
                backgroundColor: "var(--worship-white)",
                borderColor: "var(--worship-border)",
              }}
            >
              <div className="flex items-start gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--worship-success)" }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--worship-navy)" }}>
                    Your saved work is safe
                  </p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--worship-muted-slate)" }}>
                    Service plans, sermons, and library items you created during the trial stay in your workspace. Subscription keeps them ready for the next Sunday.
                  </p>
                </div>
              </div>
            </div>
          )}

          {isExpiredOrCanceled && (
            <p
              data-testid="text-billing-lapsed-work"
              className="text-center text-xs"
              style={{ color: "var(--worship-muted-slate)" }}
            >
              Your saved plans, sermons, and library items remain associated with your workspace. Subscribe whenever you are ready to return to them.
            </p>
          )}

          {/* ── Outcome cards ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {OUTCOMES.map(({ icon: Icon, headline, body }) => (
              <div
                key={headline}
                className="rounded-xl border p-5 flex gap-4"
                style={{
                  backgroundColor: "var(--worship-white)",
                  borderColor: "var(--worship-border)",
                }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "var(--worship-pale-gold)" }}
                >
                  <Icon
                    className="w-4 h-4"
                    style={{ color: "var(--worship-gold)" }}
                  />
                </div>
                <div>
                  <p
                    className="text-sm font-semibold mb-1"
                    style={{ color: "var(--worship-navy)" }}
                  >
                    {headline}
                  </p>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--worship-muted-slate)" }}
                  >
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Failure stakes (only during active trial) ── */}
          {state.kind === "trial" && (
            <p
              className="text-xs text-center pb-4"
              style={{ color: "var(--worship-muted-slate)" }}
            >
              When your trial ends on{" "}
              <span style={{ color: "var(--worship-navy)", fontWeight: 500 }}>
                {formatDate(state.trialEndsAt)}
              </span>
              , access to all generators, service planning, and the Sermon
              Builder will be paused until you subscribe.
            </p>
          )}
        </div>
      </AppLayout>
    );
  }

  // ── Active / trialing / past_due: compact management card ──────────────
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
            Sunday Studio Pro
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
            data-testid="button-billing-portal"
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
