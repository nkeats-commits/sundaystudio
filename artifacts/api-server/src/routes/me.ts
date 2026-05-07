import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, churchProfilesTable } from "@workspace/db";
import { UpdateChurchProfileBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

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

  res.json({
    userId,
    email: user?.email ?? null,
    firstName: user?.firstName ?? null,
    lastName: user?.lastName ?? null,
    imageUrl: user?.imageUrl ?? null,
    onboardingCompletedAt: user?.onboardingCompletedAt?.toISOString() ?? null,
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
  const values = {
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
  };

  const [existing] = await db
    .select()
    .from(churchProfilesTable)
    .where(eq(churchProfilesTable.userId, userId))
    .limit(1);

  let result;
  if (existing) {
    [result] = await db
      .update(churchProfilesTable)
      .set(values)
      .where(eq(churchProfilesTable.userId, userId))
      .returning();
  } else {
    [result] = await db.insert(churchProfilesTable).values(values).returning();
  }
  res.json(result);
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
