import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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
    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (existing.length === 0) {
      await db
        .insert(usersTable)
        .values({
          id: userId,
          email: claims?.email ?? null,
          firstName: claims?.firstName ?? null,
          lastName: claims?.lastName ?? null,
          imageUrl: claims?.imageUrl ?? null,
        })
        .onConflictDoNothing();
    }
  } catch (err) {
    req.log.error({ err }, "failed to upsert user");
  }

  req.userId = userId;
  next();
};
