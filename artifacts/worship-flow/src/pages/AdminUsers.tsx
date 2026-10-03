import { useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "../components/layout/AppLayout";
import {
  useGetAdminUsers,
  getGetAdminUsersQueryKey,
} from "@workspace/api-client-react";
import type { AccessState, AccessStateKind } from "@workspace/api-client-react";
import { Search, ArrowRight } from "lucide-react";

const STATUS_OPTIONS: Array<{
  value: "" | "enrollment_required" | "trial" | "subscribed" | "past_due" | "canceled" | "expired";
  label: string;
}> = [
  { value: "", label: "All" },
  { value: "enrollment_required", label: "Card required" },
  { value: "trial", label: "Trial" },
  { value: "subscribed", label: "Subscribed" },
  { value: "past_due", label: "Past due" },
  { value: "canceled", label: "Canceled" },
  { value: "expired", label: "Expired" },
];

const PAGE_SIZE = 50;

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tone}`}
    >
      {children}
    </span>
  );
}

/** Trial column: shows trial status & days left/ended (or em-dash if N/A). */
function TrialCell({ state }: { state: AccessState }) {
  if (state.kind === "enrollment_required") {
    return <Badge tone="bg-amber-50 text-amber-700">Card required</Badge>;
  }
  if (state.kind === "trial") {
    return (
      <Badge tone="bg-blue-50 text-blue-700">
        On trial · {state.daysLeft ?? 0}d left
      </Badge>
    );
  }
  if (state.kind === "expired") {
    return <Badge tone="bg-red-50 text-red-700">Trial expired</Badge>;
  }
  // For users on a real subscription path, the trial column is N/A.
  return <span className="text-xs text-[var(--worship-slate)]">—</span>;
}

/** Subscription column: shows Stripe subscription status (or em-dash if N/A). */
function SubscriptionCell({ kind }: { kind: AccessStateKind }) {
  switch (kind) {
    case "active":
      return <Badge tone="bg-emerald-50 text-emerald-700">Active</Badge>;
    case "trialing":
      return <Badge tone="bg-emerald-50 text-emerald-700">Trialing</Badge>;
    case "past_due":
      return <Badge tone="bg-amber-50 text-amber-700">Past due</Badge>;
    case "canceled":
      return <Badge tone="bg-slate-100 text-slate-600">Canceled</Badge>;
    default:
      return <span className="text-xs text-[var(--worship-slate)]">—</span>;
  }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export default function AdminUsers() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]["value"]>(
    "",
  );
  const [offset, setOffset] = useState(0);

  const params = {
    search: search || undefined,
    status: status || undefined,
    limit: PAGE_SIZE,
    offset,
  };
  const { data, isLoading, error, refetch } = useGetAdminUsers(params, {
    query: {
      queryKey: getGetAdminUsersQueryKey(params),
      staleTime: 10_000,
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <AppLayout title="Users">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--worship-border)]">
          <div>
            <h1 className="text-2xl font-serif text-[var(--worship-navy)]">
              Users
            </h1>
            <p className="text-sm text-[var(--worship-slate)] mt-1">
              {total.toLocaleString()} total · search and filter
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm text-[var(--worship-navy)] hover:underline"
          >
            ← Overview
          </Link>
        </div>

        <div className="worship-card">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setOffset(0);
              void refetch();
            }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--worship-slate)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email"
                className="w-full pl-10 pr-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white text-sm"
              />
            </div>
            <select
              value={status}
              onChange={(e) => {
                setStatus(
                  e.target.value as (typeof STATUS_OPTIONS)[number]["value"],
                );
                setOffset(0);
              }}
              className="px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white text-sm"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[var(--worship-navy)] text-white text-sm font-medium hover:bg-[#161e30]"
            >
              Search
            </button>
          </form>
        </div>

        <div className="worship-card overflow-x-auto p-0">
          {isLoading && (
            <p className="p-6 text-sm text-[var(--worship-slate)]">Loading…</p>
          )}
          {error && (
            <p className="p-6 text-sm text-red-700">Failed to load users.</p>
          )}
          {!isLoading && !error && items.length === 0 && (
            <p className="p-6 text-sm text-[var(--worship-slate)]">
              No users match those filters.
            </p>
          )}
          {!isLoading && items.length > 0 && (
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--worship-cream)] text-[var(--worship-slate)]">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Trial</th>
                  <th className="text-left px-4 py-3 font-medium">
                    Subscription
                  </th>
                  <th className="text-left px-4 py-3 font-medium">Joined</th>
                  <th className="text-left px-4 py-3 font-medium">
                    Last activity
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr
                    key={u.id}
                    className="border-t border-[var(--worship-border)] hover:bg-[var(--worship-cream)]/40"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--worship-navy)]">
                        {[u.firstName, u.lastName].filter(Boolean).join(" ") ||
                          u.email ||
                          u.id.slice(0, 12)}
                      </div>
                      <div className="text-xs text-[var(--worship-slate)]">
                        {u.email || "no email"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <TrialCell state={u.state} />
                    </td>
                    <td className="px-4 py-3">
                      <SubscriptionCell kind={u.state.kind} />
                    </td>
                    <td className="px-4 py-3">{fmtDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      {fmtDate(u.lastActivityAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="inline-flex items-center gap-1 text-[var(--worship-navy)] hover:underline text-xs font-medium"
                      >
                        View <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between text-sm text-[var(--worship-slate)]">
          <span>
            Showing {items.length === 0 ? 0 : offset + 1}–
            {offset + items.length} of {total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="px-3 py-1.5 rounded border border-[var(--worship-border)] disabled:opacity-50"
            >
              Prev
            </button>
            <button
              disabled={offset + items.length >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="px-3 py-1.5 rounded border border-[var(--worship-border)] disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
