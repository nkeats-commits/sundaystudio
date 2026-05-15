import { AppLayout } from "../components/layout/AppLayout";
import { Link } from "wouter";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { useState } from "react";

interface EventMeta {
  name: string;
  category: "Account Lifecycle" | "Onboarding Milestones" | "Feature Adoption" | "High-Intent Actions";
  description: string;
  firesWhen: string;
  frequency: "Once" | "Per occurrence";
}

const EVENT_CATALOG: EventMeta[] = [
  {
    name: "trial_started",
    category: "Account Lifecycle",
    description: "User signed up and trial clock started",
    firesWhen: "First authenticated request after account creation",
    frequency: "Once",
  },
  {
    name: "trial_expiring",
    category: "Account Lifecycle",
    description: "Trial is 3 days from expiry (day 11)",
    firesWhen: "Trial email cron — day 11 of trial",
    frequency: "Once",
  },
  {
    name: "trial_expired",
    category: "Account Lifecycle",
    description: "Trial period has ended (day 14+)",
    firesWhen: "Trial email cron — day 14 of trial",
    frequency: "Once",
  },
  {
    name: "subscription_started",
    category: "Account Lifecycle",
    description: "User started a paid subscription",
    firesWhen: "Stripe customer.subscription.created webhook",
    frequency: "Per occurrence",
  },
  {
    name: "subscription_canceled",
    category: "Account Lifecycle",
    description: "User canceled their subscription",
    firesWhen: "Stripe customer.subscription.deleted webhook",
    frequency: "Per occurrence",
  },
  {
    name: "subscription_reactivated",
    category: "Account Lifecycle",
    description: "User reactivated a previously canceled subscription",
    firesWhen: "Stripe customer.subscription.updated webhook (status → active)",
    frequency: "Per occurrence",
  },
  {
    name: "church_profile_completed",
    category: "Onboarding Milestones",
    description: "Pastor saved their church profile",
    firesWhen: "PUT /api/me/church — fires once per user",
    frequency: "Once",
  },
  {
    name: "first_sermon_generated",
    category: "Onboarding Milestones",
    description: "First AI sermon study generated",
    firesWhen: "POST /api/generate/sermon-study",
    frequency: "Once",
  },
  {
    name: "first_service_plan_saved",
    category: "Onboarding Milestones",
    description: "First service plan saved to the database",
    firesWhen: "POST /api/service-plans",
    frequency: "Once",
  },
  {
    name: "first_library_item_saved",
    category: "Onboarding Milestones",
    description: "First library item saved (any kind)",
    firesWhen: "POST /api/library",
    frequency: "Once",
  },
  {
    name: "planning_center_connected",
    category: "Feature Adoption",
    description: "Planning Center Services OAuth completed",
    firesWhen: "GET /api/integrations/pcs/callback (OAuth success)",
    frequency: "Once",
  },
  {
    name: "scholarly_sources_enabled",
    category: "Feature Adoption",
    description: "At least one scholarly source enabled",
    firesWhen: "PUT /api/sources/preferences — first time any source enabled",
    frequency: "Once",
  },
  {
    name: "repertoire_first_song_added",
    category: "Feature Adoption",
    description: "First song added to the pastor's repertoire",
    firesWhen: "PATCH /api/library/:id/repertoire or bulk-import",
    frequency: "Once",
  },
  {
    name: "sermon_exported",
    category: "High-Intent Actions",
    description: "Pastor exported a sermon",
    firesWhen: "POST /api/sermons/:id/export",
    frequency: "Per occurrence",
  },
  {
    name: "service_plan_exported",
    category: "High-Intent Actions",
    description: "Pastor exported a service plan",
    firesWhen: "POST /api/service-plans/:id/export",
    frequency: "Per occurrence",
  },
];

const CATEGORIES = [
  "Account Lifecycle",
  "Onboarding Milestones",
  "Feature Adoption",
  "High-Intent Actions",
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  "Account Lifecycle": "bg-blue-50 text-blue-700 border-blue-200",
  "Onboarding Milestones": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Feature Adoption": "bg-amber-50 text-amber-700 border-amber-200",
  "High-Intent Actions": "bg-purple-50 text-purple-700 border-purple-200",
};

function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="group inline-flex items-center gap-1.5 rounded-md border border-[var(--worship-border)] bg-[var(--worship-sand)] px-2 py-0.5 font-mono text-xs text-[var(--worship-navy)] transition hover:bg-[var(--worship-cream)] hover:border-[var(--worship-gold)]"
      title="Copy event name"
    >
      <span>{value}</span>
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600 shrink-0" />
      ) : (
        <Copy className="h-3 w-3 text-[var(--worship-slate)] opacity-0 group-hover:opacity-100 shrink-0 transition" />
      )}
    </button>
  );
}

function FrequencyBadge({ frequency }: { frequency: EventMeta["frequency"] }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        frequency === "Once"
          ? "bg-slate-100 text-slate-600"
          : "bg-orange-50 text-orange-700"
      }`}
    >
      {frequency}
    </span>
  );
}

export function AdminEmailEvents() {
  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="space-y-1">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--worship-slate)] hover:text-[var(--worship-navy)] transition mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            Admin
          </Link>
          <h1 className="font-serif text-3xl font-semibold text-[var(--worship-navy)]">
            Email Automation Events
          </h1>
          <p className="text-[var(--worship-slate)] text-sm max-w-2xl">
            Every event below is tracked via Resend Automations. Configure automation
            workflows in the{" "}
            <a
              href="https://resend.com/automations"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--worship-gold)] underline underline-offset-2 hover:text-[var(--worship-navy)]"
            >
              Resend dashboard
            </a>{" "}
            using the event name strings shown here.
          </p>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {CATEGORIES.map((cat) => {
            const count = EVENT_CATALOG.filter((e) => e.category === cat).length;
            return (
              <div
                key={cat}
                className={`rounded-xl border p-3 ${CATEGORY_COLORS[cat]}`}
              >
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-xs font-medium mt-0.5">{cat}</div>
              </div>
            );
          })}
        </div>

        {/* Event tables by category */}
        {CATEGORIES.map((category) => {
          const events = EVENT_CATALOG.filter((e) => e.category === category);
          return (
            <section key={category} className="space-y-3">
              <h2 className="font-serif text-xl font-semibold text-[var(--worship-navy)]">
                {category}
              </h2>
              <div className="overflow-x-auto rounded-xl border border-[var(--worship-border)] bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--worship-border)] bg-[var(--worship-cream)]">
                      <th className="px-4 py-3 text-left font-semibold text-[var(--worship-navy)] w-52">
                        Resend Event Name
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-[var(--worship-navy)]">
                        Description
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-[var(--worship-navy)]">
                        Fires When
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-[var(--worship-navy)] w-28">
                        Frequency
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event, i) => (
                      <tr
                        key={event.name}
                        className={`${
                          i < events.length - 1 ? "border-b border-[var(--worship-border)]" : ""
                        } hover:bg-[var(--worship-cream)]/40 transition`}
                      >
                        <td className="px-4 py-3 align-top">
                          <CopyChip value={event.name} />
                        </td>
                        <td className="px-4 py-3 align-top text-[var(--worship-slate)]">
                          {event.description}
                        </td>
                        <td className="px-4 py-3 align-top text-[var(--worship-slate)] text-xs">
                          {event.firesWhen}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <FrequencyBadge frequency={event.frequency} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        {/* Implementation note */}
        <div className="rounded-xl border border-[var(--worship-border)] bg-[var(--worship-cream)] p-5 text-sm text-[var(--worship-slate)] space-y-2">
          <p className="font-semibold text-[var(--worship-navy)]">Implementation notes</p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <code className="text-xs bg-[var(--worship-sand)] px-1 rounded">trackEvent()</code> in{" "}
              <code className="text-xs bg-[var(--worship-sand)] px-1 rounded">emailClient.ts</code>{" "}
              calls{" "}
              <code className="text-xs bg-[var(--worship-sand)] px-1 rounded">
                POST https://api.resend.com/v1/events
              </code>{" "}
              and soft-fails on any error.
            </li>
            <li>
              One-time events use a DB timestamp stamp column on the{" "}
              <code className="text-xs bg-[var(--worship-sand)] px-1 rounded">users</code> table (
              <code className="text-xs bg-[var(--worship-sand)] px-1 rounded">
                *_event_fired_at
              </code>
              ) so they fire at most once per user, even across retries.
            </li>
            <li>
              Trial lifecycle events replace the direct{" "}
              <code className="text-xs bg-[var(--worship-sand)] px-1 rounded">
                resend.emails.send()
              </code>{" "}
              calls; the actual email content is configured as a Resend Automation workflow.
            </li>
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}
