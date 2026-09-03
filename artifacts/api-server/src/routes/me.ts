import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db, usersTable, churchProfilesTable } from "@workspace/db";
import { UpdateChurchProfileBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { trackEvent } from "../lib/emailClient";
import { EVENTS } from "../lib/eventRegistry";

const router: IRouter = Router();

router.get("/me", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const [profile] = await db
    .select()
    .from(churchProfilesTable)
    .where(eq(churchProfilesTable.userId, userId))
    .limit(1);

  // A usable profile is evidence that first-run profile capture already
  // happened, even if an older user is missing the separate completion stamp.
  // Reconcile this atomically so the result persists across devices and
  // concurrent requests cannot overwrite a newer completion value.
  let onboardingCompletedAt = user?.onboardingCompletedAt ?? null;
  const hasUsableProfile =
    !!profile?.churchName.trim() && !!profile?.leaderName.trim();
  if (user && hasUsableProfile && !user.onboardingCompletedAt) {
    const [reconciled] = await db
      .update(usersTable)
      .set({ onboardingCompletedAt: user.createdAt })
      .where(and(eq(usersTable.id, userId), isNull(usersTable.onboardingCompletedAt)))
      .returning({ onboardingCompletedAt: usersTable.onboardingCompletedAt });
    onboardingCompletedAt =
      reconciled?.onboardingCompletedAt ?? user.createdAt;
  }

  res.json({
    userId,
    email: user?.email ?? null,
    firstName: user?.firstName ?? null,
    lastName: user?.lastName ?? null,
    imageUrl: user?.imageUrl ?? null,
    onboardingCompletedAt: onboardingCompletedAt?.toISOString() ?? null,
    profile: profile ?? null,
  });
});

router.put("/me/church", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const parsed = UpdateChurchProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const createValues = {
    userId,
    churchName: data.churchName,
    denomination: data.denomination ?? "",
    theology: data.theology ?? "",
    location: data.location ?? "",
    averageAttendance: data.averageAttendance ?? null,
    musicStyle: data.musicStyle ?? "",
    traditions: data.traditions ?? "",
    leaderName: data.leaderName,
    leaderRole: data.leaderRole ?? "",
    toneDescription: data.toneDescription ?? "",
    missionStatement: data.missionStatement ?? "",
    focusAreas: data.focusAreas ?? [],
  };

  const [existing] = await db
    .select()
    .from(churchProfilesTable)
    .where(eq(churchProfilesTable.userId, userId))
    .limit(1);

  let result;
  if (existing) {
    // Optional properties are intentionally conditional: onboarding submits
    // only the six basic fields, while the full Profile page can still clear
    // a field by explicitly sending "" / null / [].
    const updateValues = {
      churchName: data.churchName,
      leaderName: data.leaderName,
      ...(data.denomination !== undefined
        ? { denomination: data.denomination }
        : {}),
      ...(data.theology !== undefined ? { theology: data.theology } : {}),
      ...(data.location !== undefined ? { location: data.location } : {}),
      ...(data.averageAttendance !== undefined
        ? { averageAttendance: data.averageAttendance }
        : {}),
      ...(data.musicStyle !== undefined
        ? { musicStyle: data.musicStyle }
        : {}),
      ...(data.traditions !== undefined
        ? { traditions: data.traditions }
        : {}),
      ...(data.leaderRole !== undefined
        ? { leaderRole: data.leaderRole }
        : {}),
      ...(data.toneDescription !== undefined
        ? { toneDescription: data.toneDescription }
        : {}),
      ...(data.missionStatement !== undefined
        ? { missionStatement: data.missionStatement }
        : {}),
      ...(data.focusAreas !== undefined ? { focusAreas: data.focusAreas } : {}),
    };
    [result] = await db
      .update(churchProfilesTable)
      .set(updateValues)
      .where(eq(churchProfilesTable.userId, userId))
      .returning();
  } else {
    [result] = await db.insert(churchProfilesTable).values(createValues).returning();
  }
  res.json(result);

  // Fire church_profile_completed once per user — best-effort, never blocks.
  void (async () => {
    try {
      // Atomic: only the one request whose UPDATE actually modifies the row
      // (stamp was NULL) will receive a RETURNING row — concurrent requests get
      // nothing, preventing double-fires.
      const [claimed] = await db
        .update(usersTable)
        .set({ churchProfileEventFiredAt: new Date() })
        .where(and(eq(usersTable.id, userId), isNull(usersTable.churchProfileEventFiredAt)))
        .returning({ id: usersTable.id, email: usersTable.email });
      if (claimed) {
        const delivered = await trackEvent(EVENTS.CHURCH_PROFILE_COMPLETED, claimed.id, claimed.email, {
          churchName: data.churchName,
        });
        if (!delivered) {
          // Revert stamp so the next request can retry when Resend is back.
          await db.update(usersTable)
            .set({ churchProfileEventFiredAt: null })
            .where(eq(usersTable.id, claimed.id));
        }
      }
    } catch (err) {
      req.log.warn({ err }, "church_profile_completed event tracking failed");
    }
  })();
});

router.post("/onboarding/complete", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const now = new Date();
  await db
    .update(usersTable)
    .set({ onboardingCompletedAt: now })
    .where(eq(usersTable.id, userId));
  res.json({ onboardingCompletedAt: now.toISOString() });
});

export default router;
