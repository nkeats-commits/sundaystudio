import { useIsOwner } from "../hooks/useIsOwner";
import { NotFound } from "../pages/NotFound";

/**
 * Mirrors the server-side `requireOwner` 404 behavior on the client:
 * non-owners see the same NotFound page as any other unmatched route,
 * never the admin shell. While the ownership check is in flight we
 * render nothing rather than briefly flashing the admin UI.
 *
 * The server is still the source of truth (every admin endpoint is
 * guarded by `requireOwner`); this component just keeps the UI from
 * leaking the admin surface to non-owners who guess the URL.
 */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isOwner, isLoading } = useIsOwner();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--worship-cream)]">
        <p className="text-sm text-[var(--worship-slate)]">Loading…</p>
      </div>
    );
  }
  if (!isOwner) return <NotFound />;
  return <>{children}</>;
}
