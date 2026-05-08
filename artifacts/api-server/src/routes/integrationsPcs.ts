import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  pcsConnectionsTable,
  externalSongLinksTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  exchangeToken,
  fetchOrganization,
  getConnection,
  pcsAuthedFetch,
  pcsConfigured,
  pcsCredentials,
  pcsRedirectUri,
  persistTokens,
  publicOrigin,
} from "../lib/pcsClient";
import { importPcsSongs, type PcsSyncOptions } from "../lib/pcsImport";

/**
 * Routes for connecting Sunday Studio to a church's Planning Center Services
 * account. The flow:
 *
 *  1. Browser hits POST /integrations/pcs/connect-url to get an
 *     authorization URL with a signed `state` token (HMAC over userId +
 *     nonce + timestamp; verified on callback to prevent CSRF).
 *  2. Browser redirects the user to that URL. PCO authenticates the user
 *     and redirects back to GET /integrations/pcs/callback with `code`
 *     and `state`.
 *  3. The callback verifies state, exchanges the code for tokens, fetches
 *     the org name, kicks off an initial song import, and finally 302s
 *     the user back to /settings/integrations with success/error query
 *     params the UI can render.
 *  4. GET /integrations/pcs/status — connection metadata for the UI.
 *  5. GET /integrations/pcs/service-types — lists the church's PCS service
 *     types so the UI can offer a filter during sync.
 *  6. POST /integrations/pcs/sync — re-runs the import, optionally
 *     filtered by service type IDs and/or a last-used-since date.
 *  7. DELETE /integrations/pcs/disconnect — wipes tokens and link rows.
 */

const router: IRouter = Router();

const STATE_TTL_MS = 10 * 60 * 1000;

function stateSecret(): string {
  const s = process.env["SESSION_SECRET"];
  if (!s || s.length < 16) {
    throw new Error(
      "SESSION_SECRET must be set (>=16 chars) to use Planning Center integration",
    );
  }
  return s;
}

function signState(userId: string): string {
  const nonce = crypto.randomBytes(8).toString("hex");
  const ts = Date.now().toString();
  const payload = `${userId}.${nonce}.${ts}`;
  const sig = crypto
    .createHmac("sha256", stateSecret())
    .update(payload)
    .digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

function verifyState(
  state: string | undefined,
): { userId: string } | null {
  if (!state || typeof state !== "string") return null;
  const [b64, sig] = state.split(".");
  if (!b64 || !sig) return null;
  const payload = Buffer.from(b64, "base64url").toString();
  const expected = crypto
    .createHmac("sha256", stateSecret())
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const [userId, , tsStr] = payload.split(".");
  if (!userId || !tsStr) return null;
  const ts = Number(tsStr);
  if (!Number.isFinite(ts) || Date.now() - ts > STATE_TTL_MS) return null;
  return { userId };
}

router.post("/integrations/pcs/connect-url", requireAuth, (req, res) => {
  if (!pcsConfigured()) {
    res.status(503).json({
      error:
        "Planning Center is not configured on this server. Please set PCS_CLIENT_ID and PCS_CLIENT_SECRET.",
    });
    return;
  }
  const { clientId } = pcsCredentials();
  const state = signState(req.userId!);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: pcsRedirectUri(),
    response_type: "code",
    scope: "services",
    state,
  });
  const authUrl = `https://api.planningcenteronline.com/oauth/authorize?${params.toString()}`;
  res.json({ authUrl });
});

router.get("/integrations/pcs/callback", async (req, res) => {
  const finishUrl = (status: "ok" | "error", message?: string) => {
    const u = new URL("/settings/integrations", publicOrigin());
    u.searchParams.set("pcs", status);
    if (message) u.searchParams.set("message", message);
    return u.toString();
  };

  if (!pcsConfigured()) {
    res.redirect(finishUrl("error", "Server is not configured for Planning Center"));
    return;
  }

  const errorParam = typeof req.query["error"] === "string" ? req.query["error"] : null;
  if (errorParam) {
    res.redirect(finishUrl("error", errorParam));
    return;
  }

  const code = typeof req.query["code"] === "string" ? req.query["code"] : null;
  const state = typeof req.query["state"] === "string" ? req.query["state"] : undefined;
  const verified = verifyState(state);
  if (!code || !verified) {
    res.redirect(finishUrl("error", "Invalid or expired authorization request"));
    return;
  }
  const userId = verified.userId;

  try {
    const tokens = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: pcsRedirectUri(),
    });
    await persistTokens(userId, tokens);
    try {
      const org = await fetchOrganization(userId);
      await persistTokens(userId, tokens, org);
    } catch (err) {
      req.log.warn({ err }, "PCS org fetch failed (non-fatal)");
    }
    try {
      const importResult = await importPcsSongs(userId);
      await db
        .update(pcsConnectionsTable)
        .set({
          lastSyncedAt: new Date(),
          lastSyncSongCount: importResult.total,
          lastSyncError: importResult.errors[0] ?? null,
        })
        .where(eq(pcsConnectionsTable.userId, userId));
    } catch (err) {
      req.log.error({ err, userId }, "Initial PCS import failed");
      await db
        .update(pcsConnectionsTable)
        .set({
          lastSyncedAt: new Date(),
          lastSyncError: err instanceof Error ? err.message : "import failed",
        })
        .where(eq(pcsConnectionsTable.userId, userId));
    }
    res.redirect(finishUrl("ok"));
  } catch (err) {
    req.log.error({ err }, "PCS OAuth callback failed");
    res.redirect(
      finishUrl(
        "error",
        err instanceof Error ? err.message : "Authorization failed",
      ),
    );
  }
});

router.get("/integrations/pcs/status", requireAuth, async (req, res) => {
  const conn = await getConnection(req.userId!);
  res.json({
    configured: pcsConfigured(),
    connected: Boolean(conn),
    organizationName: conn?.organizationName ?? null,
    lastSyncedAt: conn?.lastSyncedAt?.toISOString() ?? null,
    lastSyncSongCount: conn?.lastSyncSongCount ?? null,
    lastSyncError: conn?.lastSyncError ?? null,
  });
});

/**
 * List the connected church's Planning Center service types.
 * The UI uses this to populate the service-type filter in the sync panel.
 */
router.get("/integrations/pcs/service-types", requireAuth, async (req, res) => {
  const conn = await getConnection(req.userId!);
  if (!conn) {
    res.status(400).json({ error: "Not connected to Planning Center" });
    return;
  }
  try {
    type StBody = {
      data?: Array<{ id: string; type: string; attributes?: { name?: string } }>;
      links?: { next?: string };
    };
    const serviceTypes: Array<{ id: string; name: string }> = [];
    let next: string | null = "/services/v2/service_types?per_page=100";
    for (let page = 0; page < 20 && next; page += 1) {
      const r = await pcsAuthedFetch(req.userId!, next);
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        req.log.warn({ status: r.status, body: text }, "PCS service_types fetch failed");
        res.status(502).json({ error: "Could not fetch service types from Planning Center" });
        return;
      }
      const body = (await r.json()) as StBody;
      for (const st of body.data ?? []) {
        if (st.type === "ServiceType") {
          serviceTypes.push({ id: st.id, name: st.attributes?.name ?? st.id });
        }
      }
      next = body.links?.next ?? null;
    }
    res.json(serviceTypes);
  } catch (err) {
    req.log.error({ err }, "PCS service-types fetch threw");
    res.status(502).json({ error: "Could not fetch service types from Planning Center" });
  }
});

router.post("/integrations/pcs/sync", requireAuth, async (req, res) => {
  const conn = await getConnection(req.userId!);
  if (!conn) {
    res.status(400).json({ error: "Not connected to Planning Center" });
    return;
  }

  // Parse optional sync filters from the request body.
  const body = req.body as Record<string, unknown> | undefined;
  const options: PcsSyncOptions = {};
  if (Array.isArray(body?.["serviceTypeIds"]) && body["serviceTypeIds"].length > 0) {
    options.serviceTypeIds = (body["serviceTypeIds"] as unknown[])
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      .map((id) => id.trim());
  }
  if (typeof body?.["lastUsedSince"] === "string") {
    const raw = body["lastUsedSince"];
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      res.status(400).json({ error: "lastUsedSince must be an ISO date (YYYY-MM-DD)" });
      return;
    }
    // Parse as UTC midnight and round-trip the year/month/day to reject
    // rollover dates like "2026-02-30" which JS silently advances to March 2.
    const d = new Date(`${raw}T00:00:00Z`);
    if (
      Number.isNaN(d.getTime()) ||
      d.getUTCFullYear() !== Number(match[1]) ||
      d.getUTCMonth() + 1 !== Number(match[2]) ||
      d.getUTCDate() !== Number(match[3])
    ) {
      res.status(400).json({ error: `lastUsedSince "${raw}" is not a valid calendar date` });
      return;
    }
    options.lastUsedSince = raw;
  }

  try {
    const result = await importPcsSongs(req.userId!, options);
    if (options.serviceTypeIds && options.serviceTypeIds.length > 0 && result.total === 0) {
      req.log.warn(
        { serviceTypeIds: options.serviceTypeIds },
        "PCS service-type filter resolved but matched 0 songs — selected service types may have no scheduled songs yet",
      );
    }
    await db
      .update(pcsConnectionsTable)
      .set({
        lastSyncedAt: new Date(),
        lastSyncSongCount: result.total,
        lastSyncError: result.errors[0] ?? null,
      })
      .where(eq(pcsConnectionsTable.userId, req.userId!));
    res.json({
      total: result.total,
      inserted: result.inserted,
      updated: result.updated,
    });
  } catch (err) {
    req.log.error({ err }, "PCS sync failed");
    await db
      .update(pcsConnectionsTable)
      .set({
        lastSyncedAt: new Date(),
        lastSyncError: err instanceof Error ? err.message : "sync failed",
      })
      .where(eq(pcsConnectionsTable.userId, req.userId!));
    res.status(502).json({
      error: err instanceof Error ? err.message : "Sync failed",
    });
  }
});

router.delete("/integrations/pcs/disconnect", requireAuth, async (req, res) => {
  await db
    .delete(externalSongLinksTable)
    .where(eq(externalSongLinksTable.userId, req.userId!));
  await db
    .delete(pcsConnectionsTable)
    .where(eq(pcsConnectionsTable.userId, req.userId!));
  res.status(204).end();
});

export default router;
