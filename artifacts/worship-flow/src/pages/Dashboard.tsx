import { useEffect, useRef } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import {
  Layers,
  Music,
  BookOpen,
  Mic,
  Users,
  Calendar,
  ChevronRight,
  FileText,
  Sparkles,
  PenLine,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import {
  useGetDashboard,
  useGetMe,
  useRecordTrialEvent,
} from "@workspace/api-client-react";
import { OnboardingBanner } from "../components/OnboardingBanner";
import { UpgradeBanner } from "../components/UpgradeBanner";
import { PersonalizationCard } from "../components/PersonalizationCard";

function formatTrialDate(iso: string | null): string {
  if (!iso) return "the end of your trial";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

type TrialSummary = {
  isActive: boolean;
  daysLeft: number | null;
  trialEndsAt: string | null;
  activated: boolean;
  servicePlans: number;
  sermons: number;
  libraryItems: number;
};

function TrialValueSurface({ trial }: { trial: TrialSummary }) {
  const [, setLocation] = useLocation();
  const { mutate } = useRecordTrialEvent();
  const mutateRef = useRef(mutate);
  const shownRef = useRef(false);
  mutateRef.current = mutate;

  useEffect(() => {
    if (!trial.isActive || shownRef.current) return;
    shownRef.current = true;
    mutateRef.current({
      data: {
        event: "ss_upgrade_prompt_shown",
        context: {
          surface: "dashboard-trial-value",
          activated: trial.activated,
          daysLeft: trial.daysLeft,
        },
      },
    });
  }, [trial.isActive, trial.activated, trial.daysLeft]);

  if (!trial.isActive) return null;

  const daysLabel =
    trial.daysLeft === null
      ? "Your trial is active"
      : trial.daysLeft === 1
        ? "1 day remaining"
        : `${trial.daysLeft} days remaining`;
  const pricingHref = `/pricing?returnTo=${encodeURIComponent("/dashboard")}`;
  const onValueCta = () => {
    mutateRef.current({
      data: {
        event: "ss_upgrade_prompt_clicked",
        context: {
          surface: "dashboard-trial-value",
          activated: trial.activated,
          daysLeft: trial.daysLeft,
        },
      },
    });
    setLocation(trial.activated ? pricingHref : "/service-builder");
  };

  return (
    <section
      data-testid="card-trial-value"
      className="overflow-hidden rounded-2xl border"
      style={{
        backgroundColor: "var(--worship-white)",
        borderColor: "var(--worship-border)",
      }}
    >
      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              data-testid="status-trial-active"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                backgroundColor: "var(--worship-pale-gold)",
                color: "var(--worship-navy)",
              }}
            >
              <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--worship-gold)" }} />
              {daysLabel}
            </span>
            <span
              data-testid="text-trial-no-charge"
              className="text-xs"
              style={{ color: "var(--worship-muted-slate)" }}
            >
              No charge until {formatTrialDate(trial.trialEndsAt)}
            </span>
          </div>
          <h2 className="mb-1 text-xl font-medium" style={{ color: "var(--worship-navy)" }}>
            You have already started your Sunday rhythm.
          </h2>
          <p
            className="max-w-2xl text-sm leading-relaxed"
            style={{ color: "var(--worship-slate)" }}
          >
            {trial.activated
              ? "Your plans, sermons, and saved resources are gathered here. Keep that preparation available every week for $9.99/month."
              : "Take one small next step and make this workspace yours: create your first service plan, then come back to build on it."}
          </p>
        </div>

        <button
          type="button"
          data-testid="button-trial-value-cta"
          onClick={onValueCta}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5 sm:w-auto"
          style={{
            backgroundColor: "var(--worship-navy)",
            color: "var(--worship-cream)",
          }}
        >
          {trial.activated ? "Keep your work going" : "Create your first plan"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <div
        className="grid grid-cols-3 border-t"
        style={{ borderColor: "var(--worship-border)", backgroundColor: "var(--worship-cream)" }}
      >
        {[
          { label: "Service plans", value: trial.servicePlans, id: "service-plans" },
          { label: "Sermons", value: trial.sermons, id: "sermons" },
          { label: "Library items", value: trial.libraryItems, id: "library-items" },
        ].map((item) => (
          <div key={item.id} data-testid={`metric-trial-${item.id}`} className="px-3 py-3 sm:px-5">
            <p className="text-lg font-semibold" style={{ color: "var(--worship-navy)" }}>
              {item.value}
            </p>
            <p className="text-[11px] leading-tight sm:text-xs" style={{ color: "var(--worship-muted-slate)" }}>
              {item.label}
            </p>
          </div>
        ))}
      </div>

      {trial.activated && (
        <div
          data-testid="text-trial-value-reassurance"
          className="flex items-center gap-2 border-t px-5 py-3 text-xs"
          style={{ borderColor: "var(--worship-border)", color: "var(--worship-muted-slate)" }}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--worship-success)" }} />
          Your saved work stays available when you continue with Pro.
        </div>
      )}
    </section>
  );
}

function SectionSkeleton({
  className = "h-24",
  label,
  description,
}: {
  className?: string;
  label: string;
  description?: string;
}) {
  return (
    <section
      data-testid={`loading-section-${label}`}
      aria-label={`Loading ${label}`}
      className="rounded-2xl border px-4 py-3"
      style={{
        backgroundColor: "var(--worship-white)",
        borderColor: "var(--worship-border)",
      }}
    >
      <div className="flex items-center gap-3">
        {description && (
          <span
            className="shrink-0 text-xs font-medium"
            style={{ color: "var(--worship-muted-slate)" }}
          >
            {description}
          </span>
        )}
        <div
          data-testid={`loading-${label}`}
          className={`${className} w-full animate-pulse rounded-lg bg-[var(--worship-sand)] opacity-40`}
        />
        {!description && <span className="sr-only">Loading {label}</span>}
      </div>
    </section>
  );
}

function DashboardSummaryError({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      data-testid="error-dashboard-summary"
      role="alert"
      className="rounded-2xl border p-5"
      style={{
        backgroundColor: "var(--worship-white)",
        borderColor: "var(--worship-gold)",
      }}
    >
      <h2 className="font-semibold" style={{ color: "var(--worship-navy)" }}>
        We couldn’t load your dashboard summary.
      </h2>
      <p className="mt-1 text-sm" style={{ color: "var(--worship-slate)" }}>
        Your quick actions are still available. Try again to load your recent
        services, stats, and trial details.
      </p>
      <button
        type="button"
        data-testid="button-retry-dashboard"
        onClick={onRetry}
        className="worship-btn-outline mt-4 rounded-lg px-4 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </section>
  );
}

export default function Dashboard() {
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const dashboardQuery = useGetDashboard();
  const { data: dashboard, isLoading, isError, refetch } = dashboardQuery;
  const meQuery = useGetMe();
  const { data: me } = meQuery;

  const firstName =
    me?.profile?.leaderName?.split(' ')[0] ||
    user?.firstName ||
    user?.fullName?.split(' ')[0] ||
    'Pastor';

  return (
    <AppLayout title="Dashboard">
      <div className="max-w-6xl mx-auto space-y-8 md:space-y-10">

        {/* Welcome Section */}
        <section className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6 pb-6 border-b" style={{ borderColor: 'var(--worship-border)' }}>
          <div>
            <h1 data-testid="text-dashboard-welcome" className="text-2xl md:text-3xl mb-2 font-serif text-[var(--worship-navy)]">Welcome back, {firstName}.</h1>
            <p className="text-base md:text-lg mb-3 md:mb-4" style={{ color: 'var(--worship-slate)' }}>What are you planning this week?</p>
            {dashboard?.verseOfDay ? (
              <p data-testid="text-verse-of-day" className="text-sm italic max-w-2xl" style={{ color: 'var(--worship-muted-slate)', fontFamily: 'var(--font-serif)' }}>
                "{dashboard.verseOfDay.text}" — {dashboard.verseOfDay.reference}
              </p>
            ) : isLoading ? (
              <div data-testid="loading-verse" aria-label="Loading verse of the day" className="h-5 w-80 max-w-full animate-pulse rounded bg-[var(--worship-sand)] opacity-50" />
            ) : null}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Link href="/generators/liturgy" className="px-5 py-2.5 rounded-xl font-medium worship-btn-outline flex items-center justify-center gap-2 text-sm">
              <BookOpen className="w-4 h-4" /> Generate Liturgy
            </Link>
            <Link href="/service-builder" className="px-5 py-2.5 rounded-xl font-medium worship-btn-primary flex items-center justify-center gap-2 shadow-md text-sm">
              <Layers className="w-4 h-4" /> Build a Service
            </Link>
          </div>
        </section>

        {/* Quick Actions */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--worship-muted-slate)' }}>Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
            {[
              { icon: PenLine, label: "Craft a Sermon", href: "/sermons/new" },
              { icon: BookOpen, label: "Generate Liturgy", href: "/generators/liturgy" },
              { icon: Music, label: "Find Songs", href: "/generators/songs" },
              { icon: Users, label: "Team Devotional", href: "/generators/devotional" },
              { icon: Mic, label: "Speaking Moment", href: "/generators/speaking-moment" }
            ].map((action, i) => (
              <Link key={i} href={action.href} data-testid={`link-quick-action-${i}`} className="worship-card flex flex-col items-center justify-center gap-3 p-4 hover:-translate-y-1 transition-transform">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--worship-pale-gold)', color: 'var(--worship-navy)' }}>
                  <action.icon className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium text-center" style={{ color: 'var(--worship-charcoal)' }}>{action.label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Secondary account and summary sections intentionally follow the actionable shell. */}
        {isError && <DashboardSummaryError onRetry={() => void refetch()} />}
        <OnboardingBanner
          dashboard={dashboard}
          dashboardLoading={isLoading}
          dashboardError={isError}
          me={me}
          meLoading={meQuery.isLoading}
        />
        <UpgradeBanner />
        {dashboard?.trial ? (
          <TrialValueSurface trial={dashboard.trial} />
        ) : isLoading ? (
          <SectionSkeleton
            className="h-8 max-w-sm"
            label="trial-details"
            description="Loading trial details"
          />
        ) : null}

        {/* Personalization completeness */}
        <PersonalizationCard />

        {/* Recent Services */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--worship-muted-slate)' }}>Recent Services</h2>
            <Link href="/services" className="text-sm font-medium flex items-center gap-1 hover:underline" style={{ color: 'var(--worship-navy)' }}>
              View All <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <SectionSkeleton key={item} className="h-48" label={`recent-service-${item}`} />
              ))}
            </div>
          ) : !dashboard ? (
            <div className="worship-card p-6 text-sm" style={{ color: 'var(--worship-slate)' }}>
              Recent services will appear after the dashboard summary loads.
            </div>
          ) : !dashboard.recentServices.length ? (
             <div className="worship-card p-8 flex flex-col items-center justify-center text-center">
               <FileText className="w-12 h-12 mb-4 text-[var(--worship-gold)] opacity-50" />
               <p className="text-[var(--worship-slate)] font-medium mb-4">No services planned yet.</p>
               <Link href="/service-builder" className="worship-btn-outline px-4 py-2 rounded-lg text-sm">Build your first service</Link>
             </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
              {dashboard.recentServices.map((service) => (
                <div
                  key={service.id} 
                  data-testid={`card-recent-service-${service.id}`}
                  onClick={() => setLocation(`/services/${service.id}`)}
                  className="worship-card cursor-pointer group hover:border-[var(--worship-gold)] transition-colors"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--worship-cream)]">
                      <FileText className="w-5 h-5" style={{ color: 'var(--worship-gold)' }} />
                    </div>
                    <span className="text-xs font-medium px-2 py-1 rounded bg-[var(--worship-cream)]" style={{ color: 'var(--worship-slate)' }}>
                      {service.serviceDate ? new Date(service.serviceDate).toLocaleDateString() : 'Unscheduled'}
                    </span>
                  </div>
                  <h3 className="font-semibold text-lg mb-1 font-serif" style={{ color: 'var(--worship-navy)' }}>{service.title}</h3>
                  <p className="text-sm mb-4 truncate" style={{ color: 'var(--worship-slate)' }}>{service.scripture || 'No scripture set'}</p>
                  
                  <div className="flex gap-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-[var(--worship-sand)]" style={{ color: 'var(--worship-navy)' }}>{service.theme || 'General'}</span>
                    <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--worship-pale-gold)', color: 'var(--worship-gold)' }}>{service.season || 'Ordinary Time'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Seasonal Prompts */}
        {isLoading ? (
          <section aria-label="Loading ideas">
            <SectionSkeleton className="h-24" label="ideas" />
          </section>
        ) : dashboard?.suggestions && dashboard.suggestions.length > 0 ? (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--worship-muted-slate)' }}>Ideas For You</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {dashboard.suggestions.map((suggestion) => {
                let href = "/service-builder";
                if (suggestion.kind === "liturgy") href = "/generators/liturgy";
                if (suggestion.kind === "songs") href = "/generators/songs";
                if (suggestion.kind === "speaking_moment") href = "/generators/speaking-moment";
                if (suggestion.kind === "devotional") href = "/generators/devotional";
                if (suggestion.kind === "soul_care") href = "/generators/soul-care";
                
                return (
                  <Link 
                    key={suggestion.id} 
                    href={`${href}?prompt=${encodeURIComponent(suggestion.prompt)}`}
                    className="text-left p-4 rounded-xl border flex items-start gap-3 group transition-colors hover:bg-[#F8F4EA]" 
                    style={{ backgroundColor: 'var(--worship-white)', borderColor: 'var(--worship-border)' }}
                  >
                    <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--worship-gold)' }} />
                    <span className="text-sm font-medium group-hover:underline decoration-[var(--worship-gold)]" style={{ color: 'var(--worship-charcoal)' }}>
                      {suggestion.prompt}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}
        
        {/* Stats */}
        {dashboard ? (
          <div className="pt-6 md:pt-8 flex flex-wrap items-center gap-4 md:gap-6 text-sm" style={{ color: 'var(--worship-muted-slate)' }}>
            <span className="flex items-center gap-2"><Calendar className="w-4 h-4" /> {dashboard.servicesThisMonth} plans created this month</span>
            <span className="flex items-center gap-2"><BookOpen className="w-4 h-4" /> {dashboard.librarySize} items in library</span>
          </div>
        ) : isLoading ? (
          <SectionSkeleton className="h-8" label="stats" />
        ) : null}

      </div>
    </AppLayout>
  );
}
