import { Link } from "wouter";
import { AppLayout } from "../components/layout/AppLayout";
import { useGetAdminMetrics } from "@workspace/api-client-react";
import {
  Users,
  TrendingUp,
  CreditCard,
  AlertCircle,
  Clock,
  ArrowRight,
  DollarSign,
} from "lucide-react";

function formatMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warn" | "good";
}) {
  const accent =
    tone === "warn"
      ? "text-amber-700 bg-amber-50"
      : tone === "good"
      ? "text-emerald-700 bg-emerald-50"
      : "text-[var(--worship-navy)] bg-[var(--worship-cream)]";
  return (
    <div className="worship-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-[var(--worship-slate)]">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--worship-navy)]">
            {value}
          </p>
          {hint && (
            <p className="mt-1 text-xs text-[var(--worship-slate)]">{hint}</p>
          )}
        </div>
        <div className={`p-2 rounded-lg ${accent}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function MiniBars({
  data,
  emptyLabel,
}: {
  data: Array<{ day: string; count: number }>;
  emptyLabel: string;
}) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-[var(--worship-slate)] py-8 text-center">
        {emptyLabel}
      </p>
    );
  }
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-1 h-32 pt-2">
      {data.map((d) => (
        <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
          <div
            title={`${d.day}: ${d.count}`}
            className="w-full bg-[var(--worship-gold)] rounded-t"
            style={{
              height: `${Math.max(4, (d.count / max) * 100)}%`,
              minHeight: 4,
            }}
          />
        </div>
      ))}
    </div>
  );
}

export default function AdminOverview() {
  const { data, isLoading, error } = useGetAdminMetrics();

  return (
    <AppLayout title="Admin Overview">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--worship-border)]">
          <div>
            <h1 className="text-2xl font-serif text-[var(--worship-navy)]">
              Admin Overview
            </h1>
            <p className="text-sm text-[var(--worship-slate)] mt-1">
              Owner-only view of growth, billing, and trial health.
            </p>
          </div>
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--worship-navy)] text-white hover:bg-[#161e30] text-sm font-medium"
          >
            <Users className="w-4 h-4" />
            Manage users
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {isLoading && (
          <p className="text-sm text-[var(--worship-slate)]">Loading…</p>
        )}
        {error && (
          <div className="worship-card border-red-200 bg-red-50 text-red-700">
            Failed to load metrics.
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total users"
                value={data.totals.users.toLocaleString()}
                hint={`+${data.totals.signups7d} this week`}
                icon={Users}
              />
              <StatCard
                label="MRR"
                value={formatMoney(data.revenue.mrrCents)}
                hint={`${data.subscriptions.active} paid subs`}
                icon={DollarSign}
                tone="good"
              />
              <StatCard
                label="Active trials"
                value={data.trials.active.toLocaleString()}
                hint={`${data.trials.endingSoon} ending in 3 days`}
                icon={Clock}
                tone={data.trials.endingSoon > 0 ? "warn" : "default"}
              />
              <StatCard
                label="Past due"
                value={data.subscriptions.pastDue.toLocaleString()}
                hint={`${data.revenue.churn30d} churned (30d)`}
                icon={AlertCircle}
                tone={data.subscriptions.pastDue > 0 ? "warn" : "default"}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="worship-card">
                <h3 className="font-medium text-[var(--worship-navy)] mb-1">
                  Signups (last 30d)
                </h3>
                <p className="text-xs text-[var(--worship-slate)] mb-2">
                  {data.totals.signups30d} total
                </p>
                <MiniBars
                  data={data.series.signups}
                  emptyLabel="No signups in the last 30 days"
                />
              </div>
              <div className="worship-card">
                <h3 className="font-medium text-[var(--worship-navy)] mb-1">
                  New subscriptions (last 30d)
                </h3>
                <p className="text-xs text-[var(--worship-slate)] mb-2">
                  {data.revenue.conversions30d} conversions ·{" "}
                  {data.revenue.conversions90d} (90d)
                </p>
                <MiniBars
                  data={data.series.subscriptions}
                  emptyLabel={
                    data.stripeAvailable
                      ? "No new subscriptions in the last 30 days"
                      : "Stripe data not yet available"
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Subscribed"
                value={data.subscriptions.active}
                icon={CreditCard}
                tone="good"
              />
              <StatCard
                label="Trialing (Stripe)"
                value={data.subscriptions.trialing}
                icon={Clock}
              />
              <StatCard
                label="Canceled"
                value={data.subscriptions.canceled}
                icon={TrendingUp}
              />
              <StatCard
                label="Expired trials"
                value={data.trials.expired}
                icon={AlertCircle}
              />
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
