import { useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { AppLayout } from "../components/layout/AppLayout";
import {
  useGetAdminUser,
  useGetAdminUserAiUsage,
  extendAdminUserTrial,
  compAdminUserSubscription,
  deleteAdminUser,
  getGetAdminUserQueryKey,
  getGetAdminMetricsQueryKey,
  getGetAdminUsersQueryKey,
  getGetAdminUserAiUsageQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Calendar, FileText, BookOpen, Clock, Cpu, Mail } from "lucide-react";

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function formatUsd(usd: number): string {
  return `$${usd.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive,
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-medium text-[var(--worship-navy)] mb-2">
          {title}
        </h3>
        <div className="text-sm text-[var(--worship-slate)] mb-6">{body}</div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-[var(--worship-border)] text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${
              destructive
                ? "bg-red-600 hover:bg-red-700"
                : "bg-[var(--worship-navy)] hover:bg-[#161e30]"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading, error, refetch } = useGetAdminUser(id, {
    query: {
      queryKey: getGetAdminUserQueryKey(id),
      refetchInterval: 30_000,
      refetchIntervalInBackground: true,
    },
  });
  const { data: aiUsage } = useGetAdminUserAiUsage(id, {
    query: {
      queryKey: getGetAdminUserAiUsageQueryKey(id),
      refetchInterval: 30_000,
      refetchIntervalInBackground: true,
    },
  });

  const [days, setDays] = useState<7 | 14 | 30>(7);
  const [busyAction, setBusyAction] = useState<
    null | "extend" | "comp" | "delete"
  >(null);
  const [confirm, setConfirm] = useState<null | "comp" | "delete">(null);

  async function refreshAll() {
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: getGetAdminUserQueryKey(id) }),
      queryClient.invalidateQueries({ queryKey: getGetAdminUsersQueryKey() }),
      queryClient.invalidateQueries({
        queryKey: getGetAdminMetricsQueryKey(),
      }),
    ]);
  }

  async function onExtend() {
    if (busyAction) return;
    setBusyAction("extend");
    try {
      await extendAdminUserTrial(id, { days });
      toast.success(`Extended trial by ${days} days`);
      await refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to extend trial");
    } finally {
      setBusyAction(null);
    }
  }

  async function onComp() {
    if (busyAction) return;
    setBusyAction("comp");
    try {
      await compAdminUserSubscription(id);
      toast.success("Comped subscription created");
      await refreshAll();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to comp subscription",
      );
    } finally {
      setBusyAction(null);
      setConfirm(null);
    }
  }

  async function onDelete() {
    if (busyAction) return;
    setBusyAction("delete");
    try {
      await deleteAdminUser(id);
      toast.success("User deleted");
      await queryClient.invalidateQueries({
        queryKey: getGetAdminUsersQueryKey(),
      });
      await queryClient.invalidateQueries({
        queryKey: getGetAdminMetricsQueryKey(),
      });
      setLocation("/admin/users");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setBusyAction(null);
      setConfirm(null);
    }
  }

  return (
    <AppLayout title="User detail">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-sm text-[var(--worship-navy)] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Back to users
        </Link>

        {isLoading && (
          <p className="text-sm text-[var(--worship-slate)]">Loading…</p>
        )}
        {error && (
          <div className="worship-card border-red-200 bg-red-50 text-red-700 text-sm">
            Failed to load user.
          </div>
        )}

        {user && (
          <>
            <div className="worship-card">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full bg-[var(--worship-gold)] flex items-center justify-center text-[var(--worship-navy)] text-xl font-semibold">
                  {(user.firstName?.[0] || user.email?.[0] || "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-medium text-[var(--worship-navy)] truncate">
                    {[user.firstName, user.lastName].filter(Boolean).join(" ") ||
                      user.email ||
                      user.id}
                  </h1>
                  <p className="text-sm text-[var(--worship-slate)] truncate">
                    {user.email || "no email on file"}
                  </p>
                  <p className="text-xs text-[var(--worship-slate)] mt-1 font-mono break-all">
                    {user.id}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-[var(--worship-border)]">
                <Stat label="Status" value={user.state.kind} icon={Clock} />
                <Stat
                  label="Joined"
                  value={fmt(user.createdAt).split(",")[0]}
                  icon={Calendar}
                />
                <Stat
                  label="Service plans"
                  value={user.counts.servicePlans}
                  icon={FileText}
                />
                <Stat
                  label="Sermons"
                  value={user.counts.sermons}
                  icon={BookOpen}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 text-sm">
                <Detail label="Trial started" value={fmt(user.trialStartedAt)} />
                <Detail
                  label="Last activity"
                  value={fmt(user.lastActivityAt)}
                />
                <Detail
                  label="Stripe customer"
                  value={
                    user.stripeCustomerId ? (
                      <a
                        href={`https://dashboard.stripe.com/customers/${user.stripeCustomerId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--worship-gold)] hover:underline font-mono text-xs"
                      >
                        {user.stripeCustomerId} ↗
                      </a>
                    ) : (
                      "none"
                    )
                  }
                />
                <Detail
                  label="Trial days left"
                  value={
                    user.state.kind === "trial"
                      ? String(user.state.daysLeft ?? 0)
                      : "—"
                  }
                />
              </div>
            </div>

            {/* AI Usage Section */}
            {aiUsage && (
              <div className="worship-card space-y-4">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[var(--worship-slate)]" />
                  <h2 className="font-medium text-[var(--worship-navy)]">
                    AI Usage
                  </h2>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-[var(--worship-slate)]">
                      Lifetime cost
                    </div>
                    <div className="text-sm font-medium text-[var(--worship-navy)] mt-0.5">
                      {formatUsd(aiUsage.allTime.costUsd)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--worship-slate)]">
                      Last 30d cost
                    </div>
                    <div className="text-sm font-medium text-[var(--worship-navy)] mt-0.5">
                      {formatUsd(aiUsage.last30d.costUsd)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--worship-slate)]">
                      Total generations
                    </div>
                    <div className="text-sm font-medium text-[var(--worship-navy)] mt-0.5">
                      {aiUsage.allTime.eventCount.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--worship-slate)]">
                      Lifetime tokens
                    </div>
                    <div className="text-sm font-medium text-[var(--worship-navy)] mt-0.5">
                      {formatTokens(
                        aiUsage.allTime.inputTokens +
                          aiUsage.allTime.outputTokens,
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--worship-slate)]">
                      Last 30d tokens
                    </div>
                    <div className="text-sm font-medium text-[var(--worship-navy)] mt-0.5">
                      {formatTokens(
                        aiUsage.last30d.inputTokens +
                          aiUsage.last30d.outputTokens,
                      )}
                    </div>
                  </div>
                </div>

                {aiUsage.byType.length > 0 && (
                  <div className="pt-3 border-t border-[var(--worship-border)]">
                    <p className="text-xs text-[var(--worship-slate)] mb-2">
                      Breakdown by generation type
                    </p>
                    <div className="space-y-1">
                      {aiUsage.byType.map((row) => (
                        <div
                          key={row.generationType}
                          className="flex items-center justify-between py-1 text-sm"
                        >
                          <span className="text-[var(--worship-navy)] font-mono text-xs bg-[var(--worship-cream)] px-2 py-0.5 rounded">
                            {row.generationType}
                          </span>
                          <div className="flex items-center gap-4 text-[var(--worship-slate)] text-xs">
                            <span>{row.eventCount}×</span>
                            <span>
                              {formatTokens(
                                row.inputTokens + row.outputTokens,
                              )}{" "}
                              tokens
                            </span>
                            <span className="text-[var(--worship-navy)] font-medium">
                              {formatUsd(row.costUsd)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiUsage.allTime.eventCount === 0 && (
                  <p className="text-sm text-[var(--worship-slate)]">
                    No AI generations recorded yet.
                  </p>
                )}
              </div>
            )}

            {user.eventStamps && (
              <div className="worship-card space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[var(--worship-slate)]" />
                  <h2 className="font-medium text-[var(--worship-navy)]">
                    Automation Events
                  </h2>
                </div>
                <p className="text-xs text-[var(--worship-slate)]">
                  One-time lifecycle events fired to Resend. A timestamp means the event was sent; "Not yet" means it hasn't triggered.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  {(
                    [
                      ["trial_started", "Trial started", user.trialStartedAt],
                      ["church_profile_completed", "Church profile completed", user.eventStamps.churchProfileEventFiredAt],
                      ["first_service_plan_saved", "First service plan saved", user.eventStamps.firstServicePlanEventFiredAt],
                      ["first_library_item_saved", "First library item saved", user.eventStamps.firstLibraryItemEventFiredAt],
                      ["first_sermon_generated", "First sermon generated", user.eventStamps.firstSermonEventFiredAt],
                      ["planning_center_connected", "Planning Center connected", user.eventStamps.planningCenterEventFiredAt],
                      ["scholarly_sources_enabled", "Scholarly sources enabled", user.eventStamps.scholarlySourcesEventFiredAt],
                      ["repertoire_first_song_added", "Repertoire first song", user.eventStamps.repertoireEventFiredAt],
                    ] as [string, string, string | null | undefined][]
                  ).map(([key, label, stamp]) => (
                    <div key={key} className="flex items-start justify-between gap-2 py-1 border-b border-[var(--worship-border)] last:border-0">
                      <span className="text-xs text-[var(--worship-slate)] shrink-0">{label}</span>
                      <span className={`text-xs font-mono ${stamp ? "text-emerald-700" : "text-[var(--worship-slate)] opacity-50"}`}>
                        {stamp ? new Date(stamp).toLocaleDateString() : "Not yet"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="worship-card space-y-4">
              <h2 className="font-medium text-[var(--worship-navy)]">
                Owner actions
              </h2>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 pb-4 border-b border-[var(--worship-border)]">
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--worship-navy)]">
                    Extend trial
                  </p>
                  <p className="text-xs text-[var(--worship-slate)]">
                    Push the trial end date forward by N days.
                  </p>
                </div>
                <select
                  value={days}
                  onChange={(e) =>
                    setDays(parseInt(e.target.value, 10) as 7 | 14 | 30)
                  }
                  className="w-28 px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white text-sm"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                </select>
                <button
                  onClick={onExtend}
                  disabled={busyAction !== null}
                  className="px-4 py-2 rounded-lg bg-[var(--worship-navy)] text-white text-sm font-medium disabled:opacity-50"
                >
                  {busyAction === "extend" ? "Extending…" : "Extend"}
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 pb-4 border-b border-[var(--worship-border)]">
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--worship-navy)]">
                    Comp subscription
                  </p>
                  <p className="text-xs text-[var(--worship-slate)]">
                    Create a 100%-off forever subscription in Stripe.
                  </p>
                </div>
                <button
                  onClick={() => setConfirm("comp")}
                  disabled={busyAction !== null}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50"
                >
                  Comp subscription
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-700">
                    Delete user
                  </p>
                  <p className="text-xs text-[var(--worship-slate)]">
                    Cancels Stripe subscriptions and erases all of this user's
                    data. This cannot be undone.
                  </p>
                </div>
                <button
                  onClick={() => setConfirm("delete")}
                  disabled={busyAction !== null}
                  className="px-4 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium disabled:opacity-50"
                >
                  Delete user
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirm === "comp"}
        title="Comp subscription?"
        body={
          <>
            This creates a Stripe subscription with a 100%-off forever coupon
            for this user. They'll have full access at no cost until you
            cancel.
          </>
        }
        confirmLabel="Yes, comp"
        onConfirm={onComp}
        onCancel={() => setConfirm(null)}
        busy={busyAction === "comp"}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title="Delete this user?"
        body={
          <>
            This permanently deletes the user's account, all their service
            plans, sermons, library, and church profile. Any active Stripe
            subscription will be canceled. This cannot be undone.
          </>
        }
        confirmLabel="Yes, delete forever"
        destructive
        onConfirm={onDelete}
        onCancel={() => setConfirm(null)}
        busy={busyAction === "delete"}
      />
    </AppLayout>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs text-[var(--worship-slate)]">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-sm font-medium text-[var(--worship-navy)] mt-0.5">
        {value}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-[var(--worship-slate)]">{label}</div>
      <div className="text-sm text-[var(--worship-navy)] truncate">
        {value}
      </div>
    </div>
  );
}
