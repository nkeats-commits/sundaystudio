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
import { runJob } from "../lib/runJob";
import { jobManager } from "../lib/jobManager";
import {
  loadRepertoireSongs,
  normalizeTitle,
  repertoirePromptBlock,
  repertoireTitleSet,
  type RepertoireMode,
} from "../lib/repertoire";

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
  // Service plans always run in "prefer" mode so song slots favor the team's
  // own repertoire when one exists. There is no UI to opt out today; if the
  // user has no repertoire, the block silently disappears.
  const repertoire = await loadRepertoireSongs(req.userId!);
  const repBlock = repertoirePromptBlock(repertoire, "prefer");
  const prompt = `Generate a complete worship service plan as JSON.

Theme: ${data.theme}
Scripture: ${data.scripture ?? "(pastor's choice that fits the theme)"}
Season: ${data.season ?? "Ordinary Time"}
Service length: ${data.serviceLength ?? "60 minutes"}
Notes: ${data.notes ?? "(none)"}

Church context:
${churchContextBlurb(ctx)}
${repBlock ? `\n${repBlock}\n` : ""}
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

  runJob(req, res, prompt, 6000, "service plan");
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

  runJob(req, res, prompt, 2000, "liturgy");
});

router.post("/generate/songs", requireAuth, async (req, res) => {
  const parsed = GenerateSongSuggestionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const ctx = await getChurchContext(req.userId!);
  const requestedCount = Math.max(3, Math.min(data.count ?? 6, 10));
  const requestedMode = (data.repertoireMode ?? "prefer") as RepertoireMode;
  // Skip the repertoire load entirely when the caller opted out.
  const repertoire =
    requestedMode === "off" ? [] : await loadRepertoireSongs(req.userId!);
  // Strict must stay strict even when the repertoire is empty — the
  // post-validation transform will filter to zero songs and emit the
  // "no matches in your repertoire" notice, which is the contract a direct
  // API caller expects. Prefer with an empty repertoire degrades to "off"
  // so we don't confuse the model with an empty Prefer block; the transform
  // still emits an informative notice.
  const effectiveMode: RepertoireMode =
    requestedMode === "prefer" && repertoire.length === 0
      ? "off"
      : requestedMode;
  const titleSet = repertoireTitleSet(repertoire);
  const repBlock = repertoirePromptBlock(repertoire, effectiveMode);
  // In Strict mode we cap the requested count at the repertoire size — there
  // is no value in asking for 8 songs when the user only knows 3.
  const promptCount =
    effectiveMode === "strict"
      ? Math.max(1, Math.min(requestedCount, repertoire.length))
      : requestedCount;

  const prompt = `Suggest ${promptCount} worship songs that fit this theme.

Theme: ${data.theme}
Scripture: ${data.scripture ?? "(any)"}
Style preference: ${data.style ?? "mixed (modern worship and hymns)"}

Church context:
${churchContextBlurb(ctx)}
${repBlock ? `\n${repBlock}\n` : ""}
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

  type RawSong = {
    title?: unknown;
    artist?: unknown;
    style?: unknown;
    themes?: unknown;
    whyItFits?: unknown;
  };
  type RawResult = { theme?: unknown; songs?: unknown };

  runJob<RawResult>(
    req,
    res,
    prompt,
    3000,
    "songs",
    undefined,
    (raw) => {
      const rawSongs: RawSong[] = Array.isArray(raw?.songs)
        ? (raw.songs as RawSong[])
        : [];
      const cleaned = rawSongs.flatMap((s) => {
        if (
          !s ||
          typeof s.title !== "string" ||
          typeof s.artist !== "string" ||
          typeof s.whyItFits !== "string"
        ) {
          return [];
        }
        const inRepertoire = titleSet.has(normalizeTitle(s.title));
        // Strict mode is the contract: never let an AI-invented title leak
        // through, no matter what the prompt says.
        if (effectiveMode === "strict" && !inRepertoire) return [];
        return [
          {
            title: s.title,
            artist: s.artist,
            whyItFits: s.whyItFits,
            ...(typeof s.style === "string" ? { style: s.style } : {}),
            ...(Array.isArray(s.themes)
              ? {
                  themes: (s.themes as unknown[]).filter(
                    (t): t is string => typeof t === "string",
                  ),
                }
              : {}),
            inRepertoire,
          },
        ];
      });

      const result: {
        theme: string;
        songs: typeof cleaned;
        notice?: string;
      } = {
        theme:
          typeof raw?.theme === "string" && raw.theme.trim().length > 0
            ? raw.theme
            : data.theme,
        songs: cleaned,
      };

      if (effectiveMode === "strict") {
        if (cleaned.length === 0) {
          result.notice =
            "No songs in your repertoire matched this theme. Add more songs to your repertoire, or switch to Prefer or Off for broader suggestions.";
        } else if (cleaned.length < requestedCount) {
          result.notice = `Only ${cleaned.length} song${cleaned.length === 1 ? "" : "s"} from your repertoire fit this theme. Add more to your repertoire for richer Strict-mode results.`;
        }
      } else if (requestedMode !== "off" && repertoire.length === 0) {
        result.notice =
          "Your repertoire is empty, so suggestions come from general worship knowledge. Add songs in Library → Our Repertoire to make future picks feel familiar.";
      }

      return result as unknown as RawResult;
    },
  );
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

  runJob(req, res, prompt, 1500, "speaking moment");
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

  runJob(req, res, prompt, 3000, "devotional");
});

// Polling endpoint for any background generation job. Returns the snapshot
// for the requested job, or `{ status: "unknown" }` when the job is not on
// this instance (autoscale may run multiple workers).
router.get("/generate/jobs/:jobId", requireAuth, (req, res) => {
  const jobId = String(req.params.jobId ?? "");
  const snap = jobManager.get(jobId, req.userId!);
  if (!snap) {
    res.json({ status: "unknown" });
    return;
  }
  res.json(snap);
});

// Cancel a running job. Used by the client when the user navigates away,
// resets the form, or kicks off a replacement generation. The endpoint is
// idempotent and safe to call repeatedly. We answer 204 in all cases so the
// client doesn't need to special-case "job already gone" or cross-instance
// misses (autoscale: the cancel may land on a different worker).
router.delete("/generate/jobs/:jobId", requireAuth, (req, res) => {
  const jobId = String(req.params.jobId ?? "");
  jobManager.cancel(jobId, req.userId!);
  res.status(204).end();
});

export default router;
