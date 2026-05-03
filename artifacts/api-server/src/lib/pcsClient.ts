import { eq } from "drizzle-orm";
import { db, pcsConnectionsTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Minimal Planning Center Services API client.
 *
 * Scope: just enough to power the BPM-source feature — list a connected
 * organization's songs and read each song's primary arrangement BPM/key.
 *
 * Token handling: every authed call goes through `withFreshToken`, which
 * refreshes the access token when it's within `REFRESH_BUFFER_MS` of
 * expiry, persists the new pair, and retries the original call on a 401.
 * The retry-once policy is intentional — Planning Center occasionally
 * rotates tokens server-side without telling us, and we don't want a
 * surprise 401 mid-import to abandon a sync.
 */

const PCO_BASE = "https://api.planningcenteronline.com";
const PCO_OAUTH_BASE = "https://api.planningcenteronline.com";
const REFRESH_BUFFER_MS = 60 * 1000;

export class PcsNotConfiguredError extends Error {
  constructor() {
    super(
      "Planning Center is not configured on the server (missing PCS_CLIENT_ID or PCS_CLIENT_SECRET).",
    );
    this.name = "PcsNotConfiguredError";
  }
}

export class PcsNotConnectedError extends Error {
  constructor() {
    super("This account is not connected to Planning Center.");
    this.name = "PcsNotConnectedError";
  }
}

export function pcsCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env["PCS_CLIENT_ID"];
  const clientSecret = process.env["PCS_CLIENT_SECRET"];
  if (!clientId || !clientSecret) throw new PcsNotConfiguredError();
  return { clientId, clientSecret };
}

export function pcsConfigured(): boolean {
  return Boolean(
    process.env["PCS_CLIENT_ID"] && process.env["PCS_CLIENT_SECRET"],
  );
}

/**
 * Build the Replit-public origin used for OAuth redirects. Falls back to
 * the dev domain when running in the workspace.
 */
export function publicOrigin(): string {
  const explicit = process.env["PUBLIC_ORIGIN"];
  if (explicit) return explicit.replace(/\/$/, "");
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) {
    const first = domains.split(",")[0]!.trim();
    if (first) return `https://${first}`;
  }
  const dev = process.env["REPLIT_DEV_DOMAIN"];
  if (dev) return `https://${dev}`;
  return "http://localhost";
}

export function pcsRedirectUri(): string {
  return `${publicOrigin()}/api/integrations/pcs/callback`;
}

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: string;
  scope?: string;
  created_at?: number;
};

/**
 * Exchange an authorization code (or refresh token) for a fresh token pair.
 * Used by the OAuth callback and by the auto-refresh path inside
 * `withFreshToken`.
 */
export async function exchangeToken(
  body:
    | { grant_type: "authorization_code"; code: string; redirect_uri: string }
    | { grant_type: "refresh_token"; refresh_token: string },
): Promise<TokenResponse> {
  const { clientId, clientSecret } = pcsCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    ...body,
  });
  const res = await fetch(`${PCO_OAUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Planning Center token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

/**
 * Persist a fresh token pair for the given user. The expiry is computed
 * from the response's `expires_in` (seconds from now).
 */
export async function persistTokens(
  userId: string,
  tokens: TokenResponse,
  meta?: { organizationId?: string | null; organizationName?: string | null },
): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const existing = await db
    .select()
    .from(pcsConnectionsTable)
    .where(eq(pcsConnectionsTable.userId, userId))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(pcsConnectionsTable)
      .set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        ...(meta?.organizationId !== undefined
          ? { organizationId: meta.organizationId }
          : {}),
        ...(meta?.organizationName !== undefined
          ? { organizationName: meta.organizationName }
          : {}),
      })
      .where(eq(pcsConnectionsTable.userId, userId));
  } else {
    await db.insert(pcsConnectionsTable).values({
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      organizationId: meta?.organizationId ?? null,
      organizationName: meta?.organizationName ?? null,
    });
  }
}

/**
 * Fetch the current connection row for a user, or null. Convenience.
 */
export async function getConnection(userId: string) {
  const rows = await db
    .select()
    .from(pcsConnectionsTable)
    .where(eq(pcsConnectionsTable.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Run an authenticated PCS API request, refreshing the access token if
 * it's near expiry, and retrying once on a 401 in case the server has
 * rotated tokens without notice.
 */
export async function pcsAuthedFetch(
  userId: string,
  pathOrUrl: string,
  init?: RequestInit,
): Promise<Response> {
  let conn = await getConnection(userId);
  if (!conn) throw new PcsNotConnectedError();

  // Proactive refresh.
  if (conn.expiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS) {
    try {
      const refreshed = await exchangeToken({
        grant_type: "refresh_token",
        refresh_token: conn.refreshToken,
      });
      await persistTokens(userId, refreshed);
      conn = await getConnection(userId);
      if (!conn) throw new PcsNotConnectedError();
    } catch (err) {
      logger.warn({ err, userId }, "PCS proactive refresh failed");
    }
  }

  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${PCO_BASE}${pathOrUrl}`;
  const doFetch = (token: string) =>
    fetch(url, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        authorization: `Bearer ${token}`,
        accept: "application/json",
      },
    });

  let res = await doFetch(conn.accessToken);
  if (res.status === 401) {
    // Reactive refresh + single retry.
    const refreshed = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: conn.refreshToken,
    });
    await persistTokens(userId, refreshed);
    res = await doFetch(refreshed.access_token);
  }
  return res;
}

export type PcsMe = {
  organizationId: string | null;
  organizationName: string | null;
};

/**
 * Get the connected organization's name from PCO. Used by the OAuth
 * callback to label the connection in the Integrations UI.
 */
export async function fetchOrganization(userId: string): Promise<PcsMe> {
  const res = await pcsAuthedFetch(userId, "/services/v2/me");
  if (!res.ok) {
    return { organizationId: null, organizationName: null };
  }
  const body = (await res.json()) as {
    data?: {
      relationships?: {
        organization?: { data?: { id?: string; type?: string } };
      };
    };
  };
  const orgId = body.data?.relationships?.organization?.data?.id ?? null;
  if (!orgId) return { organizationId: null, organizationName: null };
  const orgRes = await pcsAuthedFetch(userId, `/services/v2/organization`);
  if (!orgRes.ok) {
    return { organizationId: orgId, organizationName: null };
  }
  const org = (await orgRes.json()) as {
    data?: { id?: string; attributes?: { name?: string } };
  };
  return {
    organizationId: org.data?.id ?? orgId,
    organizationName: org.data?.attributes?.name ?? null,
  };
}
