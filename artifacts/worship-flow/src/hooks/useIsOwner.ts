import { useGetAdminMe, getGetAdminMeQueryKey } from "@workspace/api-client-react";

/**
 * Returns `true` only when the signed-in user is the configured owner
 * (server returns 200 from `/admin/me`). Non-owners get a 404 which we
 * silently treat as "not owner" — there's no leak to the browser.
 *
 * Used to gate the Admin entry in the sidebar and the entire `/admin/*`
 * route tree. The server-side `requireOwner` middleware is still the
 * source of truth — this hook only controls UI visibility.
 */
export function useIsOwner(): { isOwner: boolean; isLoading: boolean } {
  const query = useGetAdminMe({
    query: {
      queryKey: getGetAdminMeQueryKey(),
      // Don't spam the server — owners flip rarely.
      staleTime: 5 * 60_000,
      // Most users will get 404; don't retry that forever.
      retry: false,
    },
  });
  return {
    isOwner: query.isSuccess && !!query.data?.userId,
    isLoading: query.isLoading,
  };
}
