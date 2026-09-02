import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { Flame, ArrowRight, X } from "lucide-react";
import { useRecordTrialEvent } from "@workspace/api-client-react";
import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus';

const FEATURES = [
  'Unlimited service plans & AI generators',
  'Sermon Builder with scholarly sources',
  'Song Assistant with your repertoire',
  'Liturgy, speaking moments & devotionals',
];

export function UpgradeBanner() {
  const { state, isLoading } = useSubscriptionStatus();
  const { user } = useUser();
  const [location] = useLocation();
  const { mutate } = useRecordTrialEvent();
  const mutateRef = useRef(mutate);
  const [dismissed, setDismissed] = useState(false);
  const trackedRef = useRef(false);
  mutateRef.current = mutate;

  const relevant =
    state?.kind === 'expired' ||
    state?.kind === 'canceled' ||
    state?.kind === 'past_due';

  const userKey = user?.id ?? "anonymous";
  const dayKey = new Date().toISOString().slice(0, 10);
  const capKey = `ss-upgrade-banner:${userKey}`;
  const seenToday =
    typeof window !== "undefined" &&
    (window.sessionStorage.getItem(capKey) === "1" ||
      window.localStorage.getItem(capKey) === dayKey);

  useEffect(() => {
    if (seenToday || !relevant) setDismissed(seenToday);
  }, [relevant, seenToday]);

  useEffect(() => {
    if (!isLoading && relevant && !trackedRef.current && !dismissed && !seenToday) {
      trackedRef.current = true;
      try {
        window.sessionStorage.setItem(capKey, "1");
        window.localStorage.setItem(capKey, dayKey);
      } catch {
        // Storage can be unavailable in privacy mode; the prompt still works.
      }
      mutateRef.current({
        data: {
          event: "ss_upgrade_prompt_shown",
          context: { surface: "upgrade-banner", state: state?.kind },
        },
      });
    }
  }, [capKey, dayKey, dismissed, isLoading, relevant, seenToday, state?.kind]);

  if (isLoading || !relevant || dismissed) return null;

  const isPastDue = state?.kind === 'past_due';
  const headline = isPastDue
    ? 'Your payment needs attention'
    : state?.kind === 'canceled'
    ? 'Your subscription has ended'
    : 'Your free trial has ended';
  const sub = isPastDue
    ? 'Update your payment method to restore full access.'
    : 'Subscribe to pick up right where you left off — all your work is still here.';
  const ctaLabel = isPastDue ? 'Update payment' : 'Keep your work going';
  const ctaHref = isPastDue
    ? '/billing'
    : `/pricing?returnTo=${encodeURIComponent(location)}`;

  return (
    <div
      data-testid="banner-upgrade"
      role="region"
      aria-label="Subscription access"
      className="relative rounded-2xl border-2 p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 mb-2"
      style={{
        backgroundColor: 'var(--worship-navy)',
        borderColor: 'var(--worship-gold)',
        color: 'var(--worship-cream)',
      }}
    >
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: 'var(--worship-gold)' }}
      >
        <Flame className="w-5 h-5" style={{ color: "var(--worship-navy)" }} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-serif text-lg font-semibold leading-snug mb-1" data-testid="text-upgrade-banner-headline">
          {headline}
        </p>
        <p className="text-sm opacity-80 mb-3" data-testid="text-upgrade-banner-description">{sub}</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          {FEATURES.map((f) => (
            <li key={f} className="text-xs flex items-center gap-2 opacity-90">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: 'var(--worship-gold)' }}
              />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <Link
        href={ctaHref}
        data-testid="link-upgrade-banner-cta"
        onClick={() =>
          mutateRef.current({
            data: {
              event: "ss_upgrade_prompt_clicked",
              context: { surface: "upgrade-banner", state: state?.kind },
            },
          })
        }
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0 transition-opacity hover:opacity-90"
        style={{
          backgroundColor: 'var(--worship-gold)',
          color: 'var(--worship-navy)',
        }}
      >
        {ctaLabel}
        <ArrowRight className="w-4 h-4" />
      </Link>
      <button
        type="button"
        data-testid="button-dismiss-upgrade-banner"
        aria-label="Dismiss subscription message"
        onClick={() => {
          setDismissed(true);
          try {
            window.sessionStorage.setItem(capKey, "1");
            window.localStorage.setItem(capKey, dayKey);
          } catch {
            // Dismissal remains local to this render when storage is unavailable.
          }
        }}
        className="absolute right-3 top-3 rounded-lg p-1.5 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--worship-gold)]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
