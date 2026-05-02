import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, churchProfilesTable } from "@workspace/db";
import {
  GenerateSermonStudyBody,
  GenerateSermonBigIdeaBody,
  GenerateSermonOutlineBody,
  GenerateSermonManuscriptBody,
  GenerateSermonApplicationsBody,
  GenerateSermonIllustrationsBody,
  GenerateSermonToServiceBody,
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

const SERMON_GROUND_RULES = `
Hard rules for sermon content:
- Be biblically grounded; honor the church's denominational context if provided.
- Do NOT invent commentary quotes. Do NOT attribute statements to named scholars unless the user supplied that exact citation in the resources.
- When a historical or cultural claim cannot be verified, mark the relevant illustration with "verifyBeforeUsing": true and add a short note saying what to verify.
- Do not reproduce extended verbatim copyrighted material. Paraphrase pastorally instead.
- When the user supplies pasted resources, you MAY draw on them, attribute them by the title and author the user provided, and surface places where they agree or disagree. Never fabricate the contents of a resource that was not provided.
- Separate observation, interpretation, application, and any resource-derived insights so the pastor can see your reasoning.
- Surface "interpretiveCautions" where a passage is genuinely contested or easy to misuse.
- Be concise. Finish within the requested length budget. No padding.
- When asked to return JSON, return ONLY valid JSON — no markdown fences, no preamble.
`.trim();

interface SermonContext {
  title?: string;
  passage: string;
  secondaryPassages?: string[];
  theme?: string;
  series?: string;
  occasion?: string;
  audience?: string;
  length?: string;
  tone?: string;
  style?: string;
  depth?: string;
  outputFormat?: string;
  pastorNotes?: string;
  resources?: { title: string; author?: string; excerpt: string }[];
}

function sermonContextBlurb(s: SermonContext): string {
  const lines: string[] = [];
  if (s.title) lines.push(`Title: ${s.title}`);
  lines.push(`Primary passage: ${s.passage}`);
  if (s.secondaryPassages?.length) {
    lines.push(`Secondary passages: ${s.secondaryPassages.join(", ")}`);
  }
  if (s.theme) lines.push(`Theme: ${s.theme}`);
  if (s.series) lines.push(`Series: ${s.series}`);
  if (s.occasion) lines.push(`Occasion: ${s.occasion}`);
  if (s.audience) lines.push(`Audience: ${s.audience}`);
  if (s.length) lines.push(`Target spoken length: ${s.length}`);
  if (s.tone) lines.push(`Tone: ${s.tone}`);
  if (s.style) lines.push(`Style: ${s.style}`);
  if (s.depth) lines.push(`Depth: ${s.depth}`);
  if (s.outputFormat) lines.push(`Output format: ${s.outputFormat}`);
  if (s.pastorNotes?.trim()) lines.push(`Pastor's notes: ${s.pastorNotes}`);
  return lines.join("\n");
}

function resourceBlurb(s: SermonContext): string {
  if (!s.resources?.length) {
    return "No additional resources were attached. Do NOT invent or quote any.";
  }
  const lines: string[] = ["Pastor-supplied resources (use carefully and attribute to the title/author the pastor provided):"];
  s.resources.forEach((r, i) => {
    const author = r.author ? ` — ${r.author}` : "";
    lines.push(`[${i + 1}] ${r.title}${author}`);
    lines.push(`Excerpt: ${r.excerpt.slice(0, 1500)}`);
  });
  return lines.join("\n");
}

function refineBlurb(refineInstruction?: string, existingContent?: unknown): string {
  if (!refineInstruction && !existingContent) return "";
  const parts: string[] = [];
  if (existingContent) {
    parts.push(
      `You are refining EXISTING content. Keep what works; rewrite to honor the adjustment below. Existing content:\n${JSON.stringify(existingContent, null, 2)}`,
    );
  }
  if (refineInstruction) {
    parts.push(`Adjustment requested by the pastor: ${refineInstruction}`);
  }
  return parts.join("\n\n");
}

router.post("/generate/sermon-study", requireAuth, async (req, res) => {
  const parsed = GenerateSermonStudyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data as SermonContext & {
    refineInstruction?: string;
    existingContent?: unknown;
  };
  const ctx = await getChurchContext(req.userId!);
  const prompt = `Produce a passage study for this sermon as JSON.

${SERMON_GROUND_RULES}

Sermon context:
${sermonContextBlurb(d)}

Church context:
${churchContextBlurb(ctx)}

${resourceBlurb(d)}

${refineBlurb(d.refineInstruction, d.existingContent)}

Return JSON exactly in this shape:
{
  "context": "string | null — historical/literary/canonical context, 2-4 sentences",
  "observation": "string | null — what the text actually says: characters, structure, key words. 3-6 sentences.",
  "interpretation": "string | null — what the text means in its context. 4-8 sentences. Note interpretive options if relevant.",
  "application": "string | null — how this passage shapes a contemporary congregation. 3-6 sentences.",
  "crossReferences": ["string", ...]  | null,
  "interpretiveCautions": ["short caution", ...] | null,
  "resourceInsights": "string | null — ONLY if pastor-supplied resources were provided, surface what they add or where they disagree, attributing by title/author."
}`;
  await streamGenerate(req, res, prompt, 4000, "sermon study");
});

router.post("/generate/sermon-big-idea", requireAuth, async (req, res) => {
  const parsed = GenerateSermonBigIdeaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data as SermonContext & {
    study?: unknown;
    refineInstruction?: string;
  };
  const ctx = await getChurchContext(req.userId!);
  const prompt = `Propose 3-5 candidate "big idea" statements for this sermon as JSON.

${SERMON_GROUND_RULES}

Each big idea is a single sentence that captures the central truth the sermon will preach. They should be distinct enough that a pastor can choose between them.

Sermon context:
${sermonContextBlurb(d)}

Church context:
${churchContextBlurb(ctx)}

${resourceBlurb(d)}

${d.study ? `Passage study so far:\n${JSON.stringify(d.study, null, 2)}` : ""}

${refineBlurb(d.refineInstruction)}

Return JSON exactly in this shape:
{
  "selected": null,
  "options": [
    { "bigIdea": "single sentence", "rationale": "1-2 sentence rationale anchored in the passage" }
  ]
}`;
  await streamGenerate(req, res, prompt, 2500, "sermon big idea");
});

router.post("/generate/sermon-outline", requireAuth, async (req, res) => {
  const parsed = GenerateSermonOutlineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data as SermonContext & {
    study?: unknown;
    bigIdea?: string;
    refineInstruction?: string;
    existingContent?: unknown;
  };
  const ctx = await getChurchContext(req.userId!);
  const prompt = `Propose 3-5 distinct sermon outline options as JSON.

${SERMON_GROUND_RULES}

Each outline should be faithful to the passage and the chosen big idea, but take a different shape (e.g. expository walk-through, problem→Christ→response, narrative arc, three-point teaching, doxological).

Sermon context:
${sermonContextBlurb(d)}

Church context:
${churchContextBlurb(ctx)}

${d.bigIdea ? `Working big idea: ${d.bigIdea}` : ""}

${resourceBlurb(d)}

${d.study ? `Passage study so far:\n${JSON.stringify(d.study, null, 2)}` : ""}

${refineBlurb(d.refineInstruction, d.existingContent)}

Return JSON exactly in this shape:
{
  "selectedIndex": 0,
  "options": [
    {
      "title": "short outline title",
      "approach": "1-sentence description of how this outline preaches the big idea",
      "points": [
        { "heading": "point heading", "summary": "2-3 sentence summary", "scriptureSupport": ["Ref"] }
      ]
    }
  ]
}`;
  await streamGenerate(req, res, prompt, 4000, "sermon outline");
});

router.post("/generate/sermon-manuscript", requireAuth, async (req, res) => {
  const parsed = GenerateSermonManuscriptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data as SermonContext & {
    study?: unknown;
    bigIdea?: string;
    outline?: unknown;
    refineInstruction?: string;
    existingContent?: unknown;
  };
  const ctx = await getChurchContext(req.userId!);
  const format = d.outputFormat === "notes" || d.outputFormat === "outline" ? d.outputFormat : "manuscript";
  const audience =
    format === "manuscript"
      ? "Write the sermon as a full manuscript the pastor could read aloud."
      : format === "notes"
        ? "Write speaking notes — bullet-style with full sentences for key moments — that the pastor will preach from."
        : "Write a teaching outline with strong topic sentences under each point.";
  const prompt = `Draft the sermon body for this pastor as JSON.

${SERMON_GROUND_RULES}

${audience}

Honor the requested length budget if provided. Do NOT pad. Do NOT include extended quotations.

Sermon context:
${sermonContextBlurb(d)}

Church context:
${churchContextBlurb(ctx)}

${d.bigIdea ? `Big idea: ${d.bigIdea}` : ""}

${resourceBlurb(d)}

${d.study ? `Passage study:\n${JSON.stringify(d.study, null, 2)}` : ""}
${d.outline ? `Chosen outline:\n${JSON.stringify(d.outline, null, 2)}` : ""}

${refineBlurb(d.refineInstruction, d.existingContent)}

Return JSON exactly in this shape:
{
  "format": "${format}",
  "introduction": "string | null — short opening hook + framing of the passage",
  "body": "string — the sermon body. Use \\n\\n between paragraphs. Follow the outline if provided.",
  "conclusion": "string | null — landing the big idea, including a clear call to response"
}`;
  await streamGenerate(req, res, prompt, 6500, "sermon manuscript");
});

router.post("/generate/sermon-applications", requireAuth, async (req, res) => {
  const parsed = GenerateSermonApplicationsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data as SermonContext & {
    study?: unknown;
    bigIdea?: string;
    refineInstruction?: string;
  };
  const ctx = await getChurchContext(req.userId!);
  const prompt = `Generate concrete sermon application ideas tailored to many congregational segments, returned as JSON.

${SERMON_GROUND_RULES}

Cover at minimum: parents, students, single adults, marriages, those in grief, those in financial stress, those new to faith, mature believers, leaders, and the broader local community. Adjust segments if the church context suggests other audiences.

Sermon context:
${sermonContextBlurb(d)}

Church context:
${churchContextBlurb(ctx)}

${d.bigIdea ? `Big idea: ${d.bigIdea}` : ""}

${resourceBlurb(d)}

${d.study ? `Passage study:\n${JSON.stringify(d.study, null, 2)}` : ""}

${refineBlurb(d.refineInstruction)}

Return JSON exactly in this shape:
{
  "groups": [
    { "audience": "audience label", "application": "concrete, specific, actionable application — 1-3 sentences" }
  ],
  "smallGroupQuestions": ["question", ...]
}`;
  await streamGenerate(req, res, prompt, 3500, "sermon applications");
});

router.post("/generate/sermon-illustrations", requireAuth, async (req, res) => {
  const parsed = GenerateSermonIllustrationsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data as SermonContext & {
    bigIdea?: string;
    outline?: unknown;
    refineInstruction?: string;
  };
  const ctx = await getChurchContext(req.userId!);
  const prompt = `Suggest 3-6 candidate sermon illustrations as JSON.

${SERMON_GROUND_RULES}

Mix kinds (story, analogy, historical, cultural, personal). For ANY illustration that depends on a historical or cultural claim that cannot be verified from the user-supplied resources, set "verifyBeforeUsing": true and add a "notes" string telling the pastor what specifically needs to be verified. Do NOT invent quotes attributed to real people.

Sermon context:
${sermonContextBlurb(d)}

Church context:
${churchContextBlurb(ctx)}

${d.bigIdea ? `Big idea: ${d.bigIdea}` : ""}
${d.outline ? `Outline:\n${JSON.stringify(d.outline, null, 2)}` : ""}

${resourceBlurb(d)}

${refineBlurb(d.refineInstruction)}

Return JSON exactly in this shape:
{
  "illustrations": [
    {
      "kind": "story|analogy|historical|cultural|personal|other",
      "title": "short title",
      "body": "the illustration itself, 3-7 sentences",
      "verifyBeforeUsing": false,
      "notes": "optional note (verification, sourcing, where to land it in the sermon)"
    }
  ]
}`;
  await streamGenerate(req, res, prompt, 3000, "sermon illustrations");
});

router.post("/generate/sermon-to-service", requireAuth, async (req, res) => {
  const parsed = GenerateSermonToServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data as SermonContext & {
    bigIdea?: string;
    outline?: unknown;
    applications?: unknown;
    refineInstruction?: string;
  };
  const ctx = await getChurchContext(req.userId!);
  const prompt = `From this sermon, generate worship-integration ideas that connect the sermon to a Sunday service, as JSON.

${SERMON_GROUND_RULES}

Suggest only real, published worship songs and hymns (do not invent songs). Liturgy text should be ready to be spoken aloud.

Sermon context:
${sermonContextBlurb(d)}

Church context:
${churchContextBlurb(ctx)}

${d.bigIdea ? `Big idea: ${d.bigIdea}` : ""}
${d.outline ? `Outline:\n${JSON.stringify(d.outline, null, 2)}` : ""}
${d.applications ? `Applications:\n${JSON.stringify(d.applications, null, 2)}` : ""}

${resourceBlurb(d)}

${refineBlurb(d.refineInstruction)}

Return JSON exactly in this shape:
{
  "themes": ["worship theme", ...],
  "songs": [
    { "title": "real song or hymn title", "artist": "primary artist or hymn writer", "whyItFits": "1-2 sentences" }
  ],
  "callToWorship": "string | null — 2-4 sentences",
  "responseMoment": "string | null — what to invite the congregation into after the sermon",
  "communionMoment": "string | null — only if appropriate to this sermon",
  "benediction": "string | null — closing blessing",
  "prayerPrompts": ["string", ...] | null,
  "teamDevotionalSeed": "string | null — a 2-3 sentence seed for a worship-team devotional from this sermon",
  "smallGroupQuestions": ["question", ...] | null,
  "socialSummary": "string | null — 1-2 sentences for social media",
  "emailSummary": "string | null — 3-5 sentences for a follow-up email"
}`;
  await streamGenerate(req, res, prompt, 4000, "sermon to service");
});

export default router;
