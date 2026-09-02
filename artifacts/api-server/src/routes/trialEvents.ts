import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";
import { recordTrialEvent } from "../lib/trialAnalytics";

const router: IRouter = Router();

const trialEventBody = z.object({
  event: z.enum([
    "ss_upgrade_prompt_shown",
    "ss_upgrade_prompt_clicked",
    "ss_checkout_started",
  ]),
  context: z.record(z.string(), z.unknown()).optional(),
});

router.post("/trial-events", requireAuth, async (req, res) => {
  const parsed = trialEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await recordTrialEvent(req.userId!, parsed.data.event, parsed.data.context ?? {}, req.log);
  res.status(202).json({ accepted: true });
});

export default router;