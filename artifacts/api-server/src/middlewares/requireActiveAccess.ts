import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getAccessState, isAccessAllowed } from "../lib/getAccessState";

/**
 * Gates a route behind an active trial OR active subscription.
 * Must be mounted AFTER `requireAuth` so `req.userId` is set.
 *
 * On block: responds 402 with `{ code: 'subscription_required', state }`
 * so the client can route the user to /pricing without guessing.
 */
export const requireActiveAccess: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const state = await getAccessState(userId);
    if (isAccessAllowed(state)) {
      next();
      return;
    }
    res.status(402).json({ code: "subscription_required", state });
  } catch (err) {
    req.log.error({ err }, "requireActiveAccess failed");
    res.status(500).json({ error: "Failed to verify subscription" });
  }
};
