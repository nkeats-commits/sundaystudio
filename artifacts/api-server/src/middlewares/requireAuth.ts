import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { EVENTS } from "../lib/eventRegistry";
import { recordTrialEvent } from "../lib/trialAnalytics";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export const requireAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Test-only bypass: when NODE_ENV=test and a header carries a synthetic
  // user id, skip Clerk and skip the users-table upsert. Production never
  // has NODE_ENV=test, so this branch is unreachable for real traffic.
  if (process.env.NODE_ENV === "test") {
    const testUserId = req.header("x-test-user-id");
    if (testUserId) {
      req.userId = testUserId;
      next();
      return;
    }
  }
  const auth = getAuth(req);
  const claims = auth?.sessionClaims as
    | { userId?: string; email?: string; firstName?: string; lastName?: string; imageUrl?: string }
    | undefined;
  const userId = claims?.userId || auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // INSERT RETURNING tells us atomically whether this request created a new
    // row. If two concurrent first-requests race, only the one whose INSERT
    // actually committed will receive a RETURNING row — the other gets nothing
    // because ON CONFLICT DO NOTHING suppresses its insert without an error.
    const [inserted] = await db
      .insert(usersTable)
      .values({
        id: userId,
        email: claims?.email ?? null,
        firstName: claims?.firstName ?? null,
        lastName: claims?.lastName ?? null,
        imageUrl: claims?.imageUrl ?? null,
      })
      .onConflictDoNothing()
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
      });

    if (inserted) {
      // Brand-new user: fire trial_started. The RETURNING guarantee means at
      // most one concurrent request reaches this branch per user.
      void recordTrialEvent(userId, EVENTS.TRIAL_STARTED, {
        firstName: inserted.firstName,
      }, req.log);
    } else {
      // Existing user: refresh missing identity fields when Clerk supplies them.
      // We don't overwrite non-empty values to avoid clobbering manual edits.
      const [cur] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (cur) {
        const patch: Partial<typeof usersTable.$inferInsert> = {};
        if (!cur.email && claims?.email) patch.email = claims.email;
        if (!cur.firstName && claims?.firstName) patch.firstName = claims.firstName;
        if (!cur.lastName && claims?.lastName) patch.lastName = claims.lastName;
        if (!cur.imageUrl && claims?.imageUrl) patch.imageUrl = claims.imageUrl;
        if (Object.keys(patch).length > 0) {
          await db.update(usersTable).set(patch).where(eq(usersTable.id, userId));
        }
      }
    }
  } catch (err) {
    req.log.error({ err }, "failed to upsert user");
  }

  req.userId = userId;
  next();
};
