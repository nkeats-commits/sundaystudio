import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, churchProfilesTable } from "@workspace/db";
import {
  GenerateServicePlanBody,
  GenerateLiturgyBody,
  GenerateSongSuggestionsBody,
  GenerateSpeakingMomentBody,
  GenerateDevotionalBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { churchContextBlurb, type ChurchContext } from "../lib/anthropicJson";
import { streamGenerate } from "../lib/sseStream";

const router: IRouter = Router();

async function getChurchContext(userId: string): Promise<ChurchContext | null> {
  const [row] = await db
    .select()
    .from(churchProfilesTable)
    .where(eq(churchProfilesTable.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    churchName: row.churchName,
    denomination: row.denomination,
    theology: row.theology,
    musicStyle: row.musicStyle,
    traditions: row.traditions,
  };
}

router.post("/generate/service-plan", requireAuth, async (req, res) => {
  const parsed = GenerateServicePlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const ctx = await getChurchContext(req.userId!);
  const prompt = `Generate a complete worship service plan as JSON.

Theme: ${data.theme}
Scripture: ${data.scripture ?? "(pastor's choice that fits the theme)"}
Season: ${data.season ?? "Ordinary Time"}
Service length: ${data.serviceLength ?? "60 minutes"}
Notes: ${data.notes ?? "(none)"}

Church context:
${churchContextBlurb(ctx)}

Return JSON matching exactly this shape (no extra fields, no missing required fields):
{
  "title": "string — a beautiful service title",
  "scripture": "string — the main scripture reference",
  "theme": "string",
  "season": "string",
  "content": {
    "callToWorship": "string | null — 2-4 sentences",
    "openingPrayer": "string | null — a written prayer, 4-8 sentences",
    "scriptureReading": "string | null — the scripture passage with brief framing",
    "sermonNotes": "string | null — 3-5 bullet sentences capturing the sermon arc",
    "confession": "string | null — a corporate prayer of confession",
    "assurance": "string | null — words of assurance after confession",
    "benediction": "string | null — a closing blessing",
    "notes": "string | null — pastoral notes for the worship leader",
    "order": [
      {
        "id": "string — short slug",
        "kind": "song|scripture|prayer|sermon|communion|offering|welcome|benediction|transition|custom",
        "title": "string",
        "body": "string — what is said or done",
        "durationMinutes": 5
      }
    ]
  }
}

Guidelines:
- Order should have 8-12 items in a thoughtful arc that fits the requested length.
- Every order item must include id, kind, title, body. durationMinutes is optional.
- Liturgical text should be theologically rich and singable/speakable aloud.
- Be concise. Each body field should be the minimum text needed; do not pad.`;

  await streamGenerate(req, res, prompt, 6000, "service plan");
});

router.post("/generate/liturgy", requireAuth, async (req, res) => {
  const parsed = GenerateLiturgyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const ctx = await getChurchContext(req.userId!);
  const prompt = `Write a piece of worship liturgy as JSON.

Kind: ${data.kind}
Theme: ${data.theme}
Scripture: ${data.scripture ?? "(your choice)"}
Season: ${data.season ?? "Ordinary Time"}
Tone: ${data.tone ?? "warm, pastoral, theologically grounded"}

Church context:
${churchContextBlurb(ctx)}

Return JSON exactly in this shape:
{
  "kind": "string",
  "title": "string — a short evocative title",
  "body": "string — the liturgy itself, ready to be spoken aloud. Use line breaks for cadence. Include leader/people responses where appropriate using the format 'Leader: ...' and 'People: ...'.",
  "notes": "string — short pastoral notes for the worship leader"
}

Be concise: liturgy body should be the natural length for its kind, not padded.`;

  await streamGenerate(req, res, prompt, 2000, "liturgy");
});

router.post("/generate/songs", requireAuth, async (req, res) => {
  const parsed = GenerateSongSuggestionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const ctx = await getChurchContext(req.userId!);
  const count = Math.max(3, Math.min(data.count ?? 6, 10));
  const prompt = `Suggest ${count} worship songs that fit this theme.

Theme: ${data.theme}
Scripture: ${data.scripture ?? "(any)"}
Style preference: ${data.style ?? "mixed (modern worship and hymns)"}

Church context:
${churchContextBlurb(ctx)}

Return JSON exactly in this shape:
{
  "theme": "string",
  "songs": [
    {
      "title": "string — real published worship song title",
      "artist": "string — primary artist or hymn writer",
      "style": "string — e.g. modern worship, hymn, gospel, acoustic",
      "themes": ["string", ...],
      "whyItFits": "string — 1-2 sentences pastoring the choice"
    }
  ]
}

Only suggest real, published songs/hymns the pastor can actually find. Do not invent songs.
Keep "whyItFits" to 1-2 short sentences.`;

  await streamGenerate(req, res, prompt, 3000, "songs");
});

router.post("/generate/speaking-moment", requireAuth, async (req, res) => {
  const parsed = GenerateSpeakingMomentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const ctx = await getChurchContext(req.userId!);
  const seconds = data.durationSeconds ?? 60;
  const prompt = `Write a short worship speaking moment as JSON.

Kind: ${data.kind}
Topic: ${data.topic ?? "(open)"}
Scripture: ${data.scripture ?? "(optional)"}
Approximate spoken length: ${seconds} seconds
Tone: ${data.tone ?? "warm, pastoral, inviting"}

Church context:
${churchContextBlurb(ctx)}

Return JSON exactly in this shape:
{
  "kind": "string",
  "title": "string",
  "body": "string — the words to be spoken aloud, paced for ~${seconds} seconds",
  "deliveryNotes": "string — short notes about pacing, tone, transitions"
}

Match the requested duration. Don't exceed the spoken length budget.`;

  await streamGenerate(req, res, prompt, 1500, "speaking moment");
});

router.post("/generate/devotional", requireAuth, async (req, res) => {
  const parsed = GenerateDevotionalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const ctx = await getChurchContext(req.userId!);
  const minutes = data.durationMinutes ?? 10;
  const prompt = `Write a team devotional for a worship rehearsal as JSON.

Theme: ${data.theme}
Scripture: ${data.scripture ?? "(your choice)"}
Audience: ${data.audience ?? "worship team"}
Approximate length: ${minutes} minutes

Church context:
${churchContextBlurb(ctx)}

Return JSON exactly in this shape:
{
  "title": "string",
  "scripture": "string — passage reference",
  "opening": "string — the actual text of the passage (NIV or ESV) plus a short framing sentence",
  "body": "string — 3-5 paragraphs leading the team into the passage. Use \\n\\n between paragraphs.",
  "discussionQuestions": ["string", "string", "string"],
  "closingPrayer": "string — a short prayer to close the devotional"
}

Aim for content that fits in the ${minutes}-minute window when read aloud.`;

  await streamGenerate(req, res, prompt, 3000, "devotional");
});

export default router;
