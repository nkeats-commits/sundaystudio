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
  pcsConfigured,
  pcsCredentials,
  pcsRedirectUri,
  persistTokens,
  publicOrigin,
} from "../lib/pcsClient";
import { importPcsSongs } from "../lib/pcsImport";

/**
 * Routes for connecting WorshipFlow to a church's Planning Center Services
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
 *  4. GET /integrations/pcs/status returns connection metadata for the
 *     UI; POST /integrations/pcs/sync re-runs the import; DELETE
 *     /integrations/pcs/disconnect wipes tokens (and orphans existing
 *     external links so re-connecting can re-link by externalId).
 */

const router: IRouter = Router();

const STATE_TTL_MS = 10 * 60 * 1000;

function stateSecret(): string {
  // Reuse SESSION_SECRET as the HMAC key for OAuth state. It's already
  // required to start the server and is a high-entropy long-lived value.
  // We fail loud rather than silently using a constant — a forgeable
  // OAuth state would let an attacker bind their PCS account to another
  // user's WorshipFlow session via a CSRF-style callback.
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
  // Constant-time comparison to avoid leaking timing info.
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

  // Caller may have arrived with an OAuth error directly from PCO.
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
    // Fetch org name so the UI can label the connection. Best-effort.
    try {
      const org = await fetchOrganization(userId);
      await persistTokens(userId, tokens, org);
    } catch (err) {
      req.log.warn({ err }, "PCS org fetch failed (non-fatal)");
    }
    // Fire off an initial import. Done synchronously so the user sees the
    // count when they land back on the page, but capped to keep first
    // connection responsive.
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

router.post("/integrations/pcs/sync", requireAuth, async (req, res) => {
  const conn = await getConnection(req.userId!);
  if (!conn) {
    res.status(400).json({ error: "Not connected to Planning Center" });
    return;
  }
  try {
    const result = await importPcsSongs(req.userId!);
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
  // Wipe the tokens AND the link rows. The library_items themselves stay
  // — the user added those songs to their repertoire and we don't want to
  // silently delete their data. If they reconnect, songs will re-link by
  // (source, externalId) on the next import only if they re-import the
  // same external id, which means duplicates are possible. Documented
  // tradeoff: prefer keeping user data over a perfect re-link.
  await db
    .delete(externalSongLinksTable)
    .where(eq(externalSongLinksTable.userId, req.userId!));
  await db
    .delete(pcsConnectionsTable)
    .where(eq(pcsConnectionsTable.userId, req.userId!));
  res.status(204).end();
});

export default router;
