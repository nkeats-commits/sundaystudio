import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, pastorManuscriptsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { ObjectStorageService } from "../lib/objectStorage";
import { analyzeManuscripts } from "../lib/manuscriptAnalysis";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

router.get("/manuscripts", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const rows = await db
    .select()
    .from(pastorManuscriptsTable)
    .where(eq(pastorManuscriptsTable.userId, userId))
    .orderBy(pastorManuscriptsTable.uploadedAt);
  res.json(rows);
});

router.post("/manuscripts", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { fileName, storedPath } = req.body as {
    fileName?: string;
    storedPath?: string;
  };
  if (!fileName || !storedPath) {
    res.status(400).json({ error: "fileName and storedPath are required" });
    return;
  }
  const [row] = await db
    .insert(pastorManuscriptsTable)
    .values({ userId, fileName, storedPath })
    .returning();
  res.status(201).json(row);
});

router.delete("/manuscripts/:id", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [row] = await db
    .select()
    .from(pastorManuscriptsTable)
    .where(
      and(
        eq(pastorManuscriptsTable.id, id),
        eq(pastorManuscriptsTable.userId, userId),
      ),
    )
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db
    .delete(pastorManuscriptsTable)
    .where(
      and(
        eq(pastorManuscriptsTable.id, id),
        eq(pastorManuscriptsTable.userId, userId),
      ),
    );

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(
      row.storedPath,
    );
    await objectFile.delete();
  } catch {
    req.log.warn({ id }, "Could not delete manuscript object from storage");
  }

  analyzeManuscripts(userId).catch((err) =>
    req.log.error({ err }, "Background re-analysis failed after delete"),
  );

  res.json({ ok: true });
});

router.post("/manuscripts/analyze", requireAuth, async (req, res) => {
  const userId = req.userId!;
  analyzeManuscripts(userId).catch((err) =>
    req.log.error({ err }, "Background analysis failed"),
  );
  res.json({ status: "started" });
});

export default router;
