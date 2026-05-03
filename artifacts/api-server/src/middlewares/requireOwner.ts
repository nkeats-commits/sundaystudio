import type { Request, Response, NextFunction, RequestHandler } from "express";
import { clerkClient } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

/**
 * Returns the configured owner email (lower-cased), or null if `OWNER_EMAIL`
 * is not set. Single-admin model — change the secret to transfer ownership.
 *
 * `OWNER_EMAIL` is stored in Replit Secrets (not committed). To transfer
 * ownership, edit the secret value to the new owner's primary Clerk email.
 */
export function getOwnerEmail(): string | null {
  const raw = process.env["OWNER_EMAIL"]?.trim().toLowerCase();
  return raw && raw.length > 0 ? raw : null;
}

/**
 * 60-second per-user cache of the Clerk primary email. Avoids hammering
 * Clerk on every admin request without ever trusting the local DB column,
 * which can be stale (no Clerk webhook is wired up). The cache is short
 * enough that a Clerk-side email change or ownership transfer is reflected
 * within a minute, and admin actions are infrequent.
 */
const CACHE_TTL_MS = 60_000;
const emailCache = new Map<string, { email: string | null; expiresAt: number }>();

async function resolveCurrentEmailFromClerk(
  userId: string,
  log: Request["log"],
): Promise<string | null> {
  const cached = emailCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.email;
  }
  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    const primaryId = clerkUser.primaryEmailAddressId;
    const primary = clerkUser.emailAddresses.find((e) => e.id === primaryId);
    const email =
      primary?.emailAddress ||
      clerkUser.emailAddresses[0]?.emailAddress ||
      null;
    emailCache.set(userId, { email, expiresAt: Date.now() + CACHE_TTL_MS });
    // Best-effort write-back so user list/detail views show the same value.
    if (email) {
      try {
        await db
          .update(usersTable)
          .set({ email })
          .where(eq(usersTable.id, userId));
      } catch (err) {
        log.warn({ err }, "requireOwner: DB email write-back failed");
      }
    }
    return email;
  } catch (err) {
    log.warn({ err }, "requireOwner: Clerk lookup failed");
    return null;
  }
}

/**
 * 404s the request unless the signed-in user's *current* primary Clerk
 * email matches `OWNER_EMAIL`.
 *
 * The email is always resolved from Clerk (with a 60s cache) — never from
 * `users.email` or session claims — so a stale local row, an old JWT, or
 * an ownership transfer (changing the secret value) cannot grant or
 * preserve admin access incorrectly.
 *
 * 404 (not 403) is intentional — it hides the existence of the admin
 * surface from non-owners.
 */
export const requireOwner: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const ownerEmail = getOwnerEmail();
  if (!ownerEmail) {
    req.log.warn(
      "requireOwner blocked: OWNER_EMAIL is not configured on the server",
    );
    res.status(404).json({ error: "Not found" });
    return;
  }

  try {
    const email = await resolveCurrentEmailFromClerk(userId, req.log);
    const normalized = email?.trim().toLowerCase();
    if (!normalized || normalized !== ownerEmail) {
      // TEMPORARY diagnostic — logs the comparison so the operator can
      // see exactly which Clerk email is being checked vs the configured
      // owner email. Logged at info so it shows up without DEBUG. Remove
      // once the owner is verified working.
      req.log.info(
        {
          userId,
          clerkPrimaryEmail: normalized ?? null,
          configuredOwnerEmail: ownerEmail,
          matched: false,
        },
        "requireOwner: email mismatch (diagnostic)",
      );
      res.status(404).json({ error: "Not found" });
      return;
    }
    next();
  } catch (err) {
    req.log.error({ err }, "requireOwner failed");
    res.status(500).json({ error: "Failed to verify owner" });
  }
};
