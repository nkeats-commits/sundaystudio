/**
 * Resend email client + Resend Automations event tracking.
 *
 * Sources credentials, in order:
 *   1. RESEND_API_KEY env var (set in Production secrets).
 *   2. Replit connector API (REPLIT_CONNECTORS_HOSTNAME) — used automatically
 *      in development when the Resend integration is connected.
 *
 * Soft-fails when neither is available so the server boots in dev without it.
 * The cron catches the null return and logs a warning instead of crashing.
 */

import { Resend } from "resend";
import type { Logger } from "pino";

async function getResendCredentials(): Promise<{ apiKey: string; fromEmail: string }> {
  const directKey = process.env["RESEND_API_KEY"]?.trim();
  if (directKey) {
    const from = process.env["RESEND_FROM_EMAIL"]?.trim() ?? "Sunday Studio <noreply@worshipflow.app>";
    return { apiKey: directKey, fromEmail: from };
  }

  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const xReplitToken = process.env["REPL_IDENTITY"]
    ? "repl " + process.env["REPL_IDENTITY"]
    : process.env["WEB_REPL_RENEWAL"]
      ? "depl " + process.env["WEB_REPL_RENEWAL"]
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "No Resend credentials found. Set RESEND_API_KEY in app secrets or connect Resend via Integrations.",
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
    {
      headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch Resend credentials: ${resp.status} ${resp.statusText}`);
  }

  const data = (await resp.json()) as {
    items?: Array<{ settings?: { api_key?: string; from_email?: string } }>;
  };
  const settings = data.items?.[0]?.settings;

  if (!settings?.api_key) {
    throw new Error("Resend integration not connected or missing API key.");
  }

  return {
    apiKey: settings.api_key,
    fromEmail: settings.from_email?.trim() || "Sunday Studio <noreply@worshipflow.app>",
  };
}

/**
 * Returns a fresh Resend client + fromEmail, or null if credentials are not
 * configured (so callers can soft-fail gracefully).
 */
export async function getResendClient(
  log?: Logger,
): Promise<{ client: Resend; fromEmail: string } | null> {
  try {
    const creds = await getResendCredentials();
    return { client: new Resend(creds.apiKey), fromEmail: creds.fromEmail };
  } catch (err) {
    (log ?? console).warn?.(
      { err: err instanceof Error ? err.message : String(err) },
      "Resend not configured — email sending disabled",
    );
    return null;
  }
}

/**
 * Fire a Resend Automations event for the given user.
 *
 * Calls the Resend Events REST API (`POST /v1/events`) so Resend can trigger
 * any Automation workflows configured for the event name.
 *
 * Design contract:
 *   - NEVER throws. A Resend outage must not break the primary user action.
 *   - Logs a warning on failure so ops can notice misconfiguration.
 *   - No-ops (with a debug log) when Resend credentials are not configured,
 *     so the server works in dev without the integration.
 *
 * @param eventName  The event identifier string (use EVENTS constants from eventRegistry.ts)
 * @param userId     The platform user id — included in event data for cross-referencing
 * @param email      The user's email address — required by Resend to match the contact
 * @param data       Optional additional key/value pairs sent as event properties
 * @param log        Optional Pino logger; falls back to console when absent
 */
export async function trackEvent(
  eventName: string,
  userId: string,
  email: string | null | undefined,
  data?: Record<string, unknown>,
  log?: Logger,
): Promise<void> {
  if (!email) {
    (log ?? console).warn?.({ eventName, userId }, "trackEvent skipped — no email for user");
    return;
  }

  let apiKey: string;
  try {
    const creds = await getResendCredentials();
    apiKey = creds.apiKey;
  } catch (err) {
    // Resend not configured — dev environment or missing secret. Skip silently.
    (log ?? console).warn?.(
      { eventName, userId, err: err instanceof Error ? err.message : String(err) },
      "trackEvent skipped — Resend credentials unavailable",
    );
    return;
  }

  try {
    const resp = await fetch("https://api.resend.com/v1/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event: eventName,
        email,
        data: { userId, ...data },
      }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      (log ?? console).warn?.(
        { eventName, userId, status: resp.status, body },
        "trackEvent received non-2xx response",
      );
    }
  } catch (err) {
    (log ?? console).warn?.(
      { eventName, userId, err: err instanceof Error ? err.message : String(err) },
      "trackEvent soft-failed",
    );
  }
}
