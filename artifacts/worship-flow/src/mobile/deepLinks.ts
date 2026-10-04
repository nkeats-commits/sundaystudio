export const SUNDAY_STUDIO_SCHEME = "sundaystudio:";

/**
 * Turn an app URL into a local Wouter route. Only app-owned links are
 * accepted; OAuth/payment provider URLs must never become internal routes.
 */
export function appUrlToPath(
  rawUrl: string,
  trustedWebHosts: readonly string[] = [],
): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  let route: string;
  if (url.protocol === SUNDAY_STUDIO_SCHEME) {
    if (url.hostname === "open") {
      route = url.pathname;
    } else if (url.hostname === "auth" && url.pathname === "/callback") {
      route = "/sign-in";
    } else {
      route = `/${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
    }
  } else if (
    url.protocol === "https:" &&
    trustedWebHosts.includes(url.hostname.toLowerCase())
  ) {
    route = url.pathname;
  } else {
    return null;
  }

  if (!route.startsWith("/") || route.startsWith("//") || route.startsWith("/api/")) {
    return null;
  }

  return `${route}${url.search}${url.hash}`;
}