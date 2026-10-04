import { useEffect } from "react";
import { useLocation } from "wouter";
import { useSubscriptionStatus } from "../hooks/useSubscriptionStatus";

export function ProtectedWorkspace({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  const [location, setLocation] = useLocation();
  const { state, isLoading, isError, isFetching, refetch } =
    useSubscriptionStatus();
  const enrollmentPage = location === "/billing" || location === "/pricing";

  useEffect(() => {
    if (state?.kind === "enrollment_required" && !enrollmentPage) {
      setLocation("/billing", { replace: true });
    }
  }, [state?.kind, enrollmentPage, setLocation]);

  if (isLoading) return null;
  if (isError || !state) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6 text-center"
        role="alert"
      >
        <div className="max-w-md space-y-4">
          <p className="text-sm text-[var(--worship-muted-slate)]">
            We couldn’t verify your billing status. Your sign-in is still
            active. Retry verification to continue.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="rounded-md bg-[var(--worship-ink)] px-4 py-2 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-60"
          >
            {isFetching ? "Checking…" : "Retry verification"}
          </button>
        </div>
      </div>
    );
  }
  if (state.kind === "enrollment_required" && !enrollmentPage) return null;
  return <Component />;
}