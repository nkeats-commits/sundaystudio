export function requireHttpsOrigin(rawUrl: string, settingName: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${settingName} must be an absolute HTTPS origin.`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      `${settingName} must be an HTTPS origin without a path, query, or credentials.`,
    );
  }
  return parsed.origin;
}

export function resolveApiRequestUrl(
  path: string,
  isNative: boolean,
  apiOrigin: string,
): string {
  if (!isNative || /^https?:\/\//i.test(path)) return path;
  return new URL(path.startsWith("/") ? path : `/${path}`, apiOrigin).href;
}