import { Router, type IRouter } from "express";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { db, libraryItemsTable, servicePlansTable, sermonsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getAccessState } from "../lib/getAccessState";

const router: IRouter = Router();

const VERSES_OF_DAY = [
  { text: "Let the message of Christ dwell among you richly.", reference: "Colossians 3:16" },
  { text: "Sing to the Lord a new song; sing to the Lord, all the earth.", reference: "Psalm 96:1" },
  { text: "Where two or three gather in my name, there am I with them.", reference: "Matthew 18:20" },
  { text: "Be still, and know that I am God.", reference: "Psalm 46:10" },
  { text: "The Lord is my shepherd, I lack nothing.", reference: "Psalm 23:1" },
  { text: "Cast all your anxiety on him because he cares for you.", reference: "1 Peter 5:7" },
  { text: "I lift up my eyes to the mountains—where does my help come from?", reference: "Psalm 121:1" },
];

const SUGGESTIONS = [
  { id: "advent-hope", prompt: "Plan an Advent service around hope", kind: "service" as const },
  { id: "communion-invitation", prompt: "Create a communion invitation", kind: "speaking_moment" as const },
  { id: "songs-surrender", prompt: "Find songs about surrender", kind: "songs" as const },
  { id: "devotional-humility", prompt: "Write a rehearsal devotional on humility", kind: "devotional" as const },
];

router.get("/dashboard", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // These reads are independent. Starting them together removes the serial
  // database waterfall while keeping the response semantics unchanged.
  const [
    recentServices,
    monthCountRows,
    librarySizeRows,
    totalServicesRows,
    totalSermonsRows,
    accessState,
  ] = await Promise.all([
    db
      .select({
        id: servicePlansTable.id,
        title: servicePlansTable.title,
        scripture: servicePlansTable.scripture,
        theme: servicePlansTable.theme,
        season: servicePlansTable.season,
        serviceDate: servicePlansTable.serviceDate,
      })
      .from(servicePlansTable)
      .where(eq(servicePlansTable.userId, userId))
      .orderBy(desc(servicePlansTable.updatedAt))
      .limit(3),
    db
      .select({ value: count() })
      .from(servicePlansTable)
      .where(
        and(
          eq(servicePlansTable.userId, userId),
          gte(servicePlansTable.createdAt, startOfMonth),
        ),
      ),
    db
      .select({ value: count() })
      .from(libraryItemsTable)
      .where(eq(libraryItemsTable.userId, userId)),
    db
      .select({ value: count() })
      .from(servicePlansTable)
      .where(eq(servicePlansTable.userId, userId)),
    db
      .select({ value: count() })
      .from(sermonsTable)
      .where(eq(sermonsTable.userId, userId)),
    getAccessState(userId),
  ]);

  const [{ value: monthCount } = { value: 0 }] = monthCountRows;
  const [{ value: librarySize } = { value: 0 }] = librarySizeRows;
  const [{ value: totalServices } = { value: 0 }] = totalServicesRows;
  const [{ value: totalSermons } = { value: 0 }] = totalSermonsRows;
  const isActiveTrial = accessState.kind === "trial";
  const activated = Number(totalServices) > 0 || Number(totalSermons) > 0;

  const verseOfDay = VERSES_OF_DAY[now.getDate() % VERSES_OF_DAY.length];

  res.json({
    verseOfDay,
    recentServices,
    servicesThisMonth: Number(monthCount),
    librarySize: Number(librarySize),
    totalServices: Number(totalServices),
    trial: {
      isActive: isActiveTrial,
      daysLeft: isActiveTrial ? accessState.daysLeft : null,
      trialEndsAt: isActiveTrial ? accessState.trialEndsAt : null,
      activated,
      servicePlans: Number(totalServices),
      sermons: Number(totalSermons),
      libraryItems: Number(librarySize),
    },
    suggestions: SUGGESTIONS,
  });
});

export default router;
