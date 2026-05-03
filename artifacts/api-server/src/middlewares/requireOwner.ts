import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

/**
 * Returns the configured owner email (lower-cased), or null if `OWNER_EMAIL`
 * is not set. Single-admin model — change the env var to transfer ownership.
 */
export function getOwnerEmail(): string | null {
  const raw = process.env["OWNER_EMAIL"]?.trim().toLowerCase();
  return raw && raw.length > 0 ? raw : null;
}

/**
 * 404s the request unless the signed-in user's email matches OWNER_EMAIL.
 *
 * Resolves the email from (in order): Clerk session claims, then the local
 * `users` table. We prefer claims because Clerk webhooks aren't wired up,
 * so the DB email column may be stale or null.
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
    const auth = getAuth(req);
    const claims = auth?.sessionClaims as
      | { email?: string }
      | undefined;
    let email: string | null | undefined = claims?.email;
    if (!email) {
      const [u] = await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      email = u?.email ?? null;
    }
    const normalized = email?.trim().toLowerCase();
    if (!normalized || normalized !== ownerEmail) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    next();
  } catch (err) {
    req.log.error({ err }, "requireOwner failed");
    res.status(500).json({ error: "Failed to verify owner" });
  }
};
