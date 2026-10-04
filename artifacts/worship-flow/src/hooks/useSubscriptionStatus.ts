import {
  useGetBillingStatus,
  getGetBillingStatusQueryKey,
} from "@workspace/api-client-react";

/**
 * Single source of truth for the client's view of the user's subscription.
 * Refetches on window focus so a user returning from Stripe Checkout sees
 * their new state without a manual reload.
 */
export function useSubscriptionStatus() {
  const query = useGetBillingStatus({
    query: {
      queryKey: getGetBillingStatusQueryKey(),
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    },
  });
  const state = query.data?.state;
  const allowed =
    !query.isError &&
    (state?.kind === "trial" ||
      state?.kind === "active" ||
      state?.kind === "trialing");
  return {
    state,
    allowed,
    trialDays: query.data?.trialDays ?? 14,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
