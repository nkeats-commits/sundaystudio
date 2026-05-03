import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, churchProfilesTable } from "@workspace/db";
import {
  GenerateServicePlanBody,
  GenerateServicePlanResponse,
  GenerateLiturgyBody,
  GenerateSongSuggestionsBody,
  GenerateSpeakingMomentBody,
  GenerateStepContentBody,
  GenerateDevotionalBody,
  GenerateSoulCareBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireActiveAccess } from "../middlewares/requireActiveAccess";
import { churchContextBlurb, type ChurchContext } from "../lib/anthropicJson";
import { runJob } from "../lib/runJob";
import { jobManager } from "../lib/jobManager";
import { lookupBpm } from "../lib/crowdsourceBpm";
import {
  bpmInRange,
  describeBpmRange,
  loadRepertoireSongs,
  normalizeBpmRange,
  normalizeTitle,
  repertoireBpmByTitle,
  repertoirePromptBlock,
  repertoireTitleSet,
  type RepertoireMode,
} from "../lib/repertoire";

type GeneratedServicePlan = ReturnType<
  typeof GenerateServicePlanResponse.parse
>;
type GeneratedOrderItem = GeneratedServicePlan["content"]["order"][number];
type FlowStep = NonNullable<
  ReturnType<typeof GenerateServicePlanBody.parse>["flow"]
>[number];

/**
 * Enforce the user-defined service flow on the model output.
 *
 * The prompt asks the model to use the supplied flow exactly, but a prompt
 * is probabilistic — the model can still drop, add, reorder, or rename
 * slots. This post-transform makes the contract deterministic:
 *
 *  - The output `content.order` array is rebuilt to have exactly the same
 *    length as the requested flow, in the same order.
 *  - Each slot's `kind` and `title` are forced to the user-supplied values.
 *  - The model's generated `body` / `durationMinutes` are kept on a
 *    best-effort basis: we match each requested step to the closest model
 *    slot of the same kind that hasn't been claimed yet, falling back to
 *    positional pairing. If nothing matches, `body` becomes an empty
 *    string so the user can fill it in or regenerate.
 */
function enforceFlow(
  plan: GeneratedServicePlan,
  flow: FlowStep[],
): GeneratedServicePlan {
  if (flow.length === 0) return plan;
  const original = plan.content.order ?? [];
  const used = new Set<number>();
  const enforced = flow.map((step, i) => {
    // Prefer a same-kind unused slot at the same position; else any
    // same-kind unused slot; else fall back to the original positional
    // slot so we don't lose the model's body text entirely.
    let matchIdx = -1;
    if (
      original[i] &&
      original[i]!.kind === step.kind &&
      !used.has(i)
    ) {
      matchIdx = i;
    } else {
      matchIdx = original.findIndex(
        (s: GeneratedOrderItem, idx: number) =>
          !used.has(idx) && s.kind === step.kind,
      );
      if (matchIdx === -1 && original[i] && !used.has(i)) {
        matchIdx = i;
      }
    }
    const source = matchIdx >= 0 ? original[matchIdx]! : null;
    if (matchIdx >= 0) used.add(matchIdx);
    return {
      id: source?.id ?? `step-${i + 1}`,
      kind: step.kind,
      title: step.stepName,
      body: source?.body ?? "",
      durationMinutes: source?.durationMinutes ?? null,
      linkedKind: null,
      linkedId: null,
      linkedTitle: null,
    };
  });
  return {
    ...plan,
    content: { ...plan.content, order: enforced },
  };
}
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

router.post("/generate/service-plan", requireAuth, requireActiveAccess, async (req, res) => {
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
  const flow = data.flow ?? [];
  // If the client explicitly sent a `flow` array, it must contain at least
  // one step. We allow `flow` to be omitted entirely (legacy callers), but
  // an empty array is a programming bug — the UI prevents it, and silently
  // letting the AI invent a skeleton would violate the new flow contract.
  if (data.flow !== undefined && flow.length === 0) {
    res
      .status(400)
      .json({ error: "Service flow must contain at least one step." });
    return;
  }
  const flowBlock =
    flow.length > 0
      ? `User-defined service flow (you MUST follow this EXACTLY):
The "content.order" array MUST contain EXACTLY ${flow.length} items, in EXACTLY this order, one per row below. For each row use the given "kind" verbatim and use the given "stepName" as the slot's "title" verbatim. Do NOT add, remove, reorder, rename, or merge slots. Only fill in "body" (and optionally "durationMinutes") for each slot.
${flow
  .map(
    (s, i) =>
      `${i + 1}. kind="${s.kind}", title="${s.stepName.replace(/"/g, '\\"')}"`,
  )
  .join("\n")}
`
      : "";
  const orderGuideline =
    flow.length > 0
      ? `- "content.order" MUST have EXACTLY ${flow.length} items matching the user-defined flow above (same order, same kinds, same titles). Fill in body for each.`
      : `- Order should have 8-12 items in a thoughtful arc that fits the requested length.`;
  const prompt = `Generate a complete worship service plan as JSON.

Theme: ${data.theme}
Scripture: ${data.scripture ?? "(pastor's choice that fits the theme)"}
Season: ${data.season ?? "Ordinary Time"}
Service length: ${data.serviceLength ?? "60 minutes"}
Notes: ${data.notes ?? "(none)"}

Church context:
${churchContextBlurb(ctx)}
${repBlock ? `\n${repBlock}\n` : ""}${flowBlock ? `\n${flowBlock}\n` : ""}
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
${orderGuideline}
- Every order item must include id, kind, title, body. durationMinutes is optional.
- Liturgical text should be theologically rich and singable/speakable aloud.
- Be concise. Each body field should be the minimum text needed; do not pad.`;

  runJob(
    req,
    res,
    prompt,
    6000,
    "service plan",
    GenerateServicePlanResponse,
    flow.length > 0
      ? (parsed: GeneratedServicePlan) => enforceFlow(parsed, flow)
      : undefined,
  );
});

router.post("/generate/liturgy", requireAuth, requireActiveAccess, async (req, res) => {
  const parsed = GenerateLiturgyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const ctx = await getChurchContext(req.userId!);
  const format = data.format ?? "call_response";
  const trimmedAlignment = (data.alignmentNotes ?? "").trim();
  const hasAlignment = trimmedAlignment.length > 0;
  const hasScripture = (data.scripture ?? "").trim().length > 0;

  const bodyInstruction =
    format === "leader_only"
      ? "string — the liturgy itself, ready to be spoken aloud. Use line breaks for cadence. Write it as one continuous spoken piece in the worship leader's voice addressing the congregation. Do NOT include 'Leader:' or 'People:' labels and do NOT use call-and-response."
      : "string — the liturgy itself, ready to be spoken aloud. Use line breaks for cadence. Include leader/people responses where appropriate using the format 'Leader: ...' and 'People: ...'.";

  const recommendedScriptureField = hasScripture
    ? ""
    : `,
  "recommendedScripture": {
    "reference": "string — a specific passage that anchors this liturgy, e.g. 'Psalm 95:1-7'",
    "rationale": "string — one short sentence on why this passage fits the theme and kind"
  }`;

  const recommendedScriptureGuidance = hasScripture
    ? ""
    : `
Because the user did not supply a scripture, you MUST also pick ONE specific scripture passage that fits this kind, theme, and season, and return it as "recommendedScripture" in the JSON. Anchor the liturgy body in that passage.`;

  const alignmentBlock = hasAlignment
    ? `
Alignment notes from the pastor (sermon notes, song lyrics, or other source text the liturgy should echo):
"""
${trimmedAlignment}
"""
Echo the imagery, refrains, and theological language from these notes in your liturgy. Do NOT quote song lyrics verbatim — paraphrase and weave their themes in to honor copyright. If the notes contradict the kind/theme above, the kind/theme wins.`
    : "";

  const prompt = `Write a piece of worship liturgy as JSON.

Kind: ${data.kind}
Theme: ${data.theme}
Scripture: ${data.scripture ?? "(your choice — see guidance below)"}
Season: ${data.season ?? "Ordinary Time"}
Tone: ${data.tone ?? "warm, pastoral, theologically grounded"}
Format: ${format === "leader_only" ? "leader speaks (no call-and-response)" : "call and response (leader/people antiphonal)"}

Church context:
${churchContextBlurb(ctx)}
${recommendedScriptureGuidance}${alignmentBlock}

Return JSON exactly in this shape:
{
  "kind": "string",
  "title": "string — a short evocative title",
  "body": "${bodyInstruction}",
  "notes": "string — short pastoral notes for the worship leader"${recommendedScriptureField}
}

Be concise: liturgy body should be the natural length for its kind, not padded.`;

  runJob<Record<string, unknown>>(
    req,
    res,
    prompt,
    2000,
    "liturgy",
    undefined,
    (result) => {
      const out: Record<string, unknown> = { ...result, format };
      if (hasAlignment) {
        out.alignmentNotes = trimmedAlignment;
      } else {
        delete out.alignmentNotes;
      }
      if (hasScripture) {
        // The user supplied a scripture; the AI must not invent a recommendation.
        delete out.recommendedScripture;
      } else {
        const rs = (result as { recommendedScripture?: unknown }).recommendedScripture;
        if (
          rs &&
          typeof rs === "object" &&
          typeof (rs as { reference?: unknown }).reference === "string" &&
          typeof (rs as { rationale?: unknown }).rationale === "string"
        ) {
          out.recommendedScripture = {
            reference: (rs as { reference: string }).reference,
            rationale: (rs as { rationale: string }).rationale,
          };
        } else {
          delete out.recommendedScripture;
        }
      }
      return out;
    },
  );
});

router.post("/generate/songs", requireAuth, requireActiveAccess, async (req, res) => {
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
  const bpmByTitle = repertoireBpmByTitle(repertoire);
  const bpmRange = normalizeBpmRange(data.bpmMin, data.bpmMax);
  const repBlock = repertoirePromptBlock(repertoire, effectiveMode, bpmRange);
  const tempoConstraintLine = bpmRange
    ? `Tempo constraint: only suggest songs whose tempo falls within ${describeBpmRange(bpmRange)}. If you don't know a song's BPM with confidence, prefer one whose well-known recording fits this range.\n`
    : "";
  // In Strict mode we cap the requested count at the repertoire size — there
  // is no value in asking for 8 songs when the user only knows 3.
  const promptCount =
    effectiveMode === "strict"
      ? Math.max(1, Math.min(requestedCount, repertoire.length))
      : requestedCount;
  const trimmedAlignment = (data.alignmentNotes ?? "").trim();
  const hasAlignment = trimmedAlignment.length > 0;
  const alignmentBlock = hasAlignment
    ? `
Alignment notes from the pastor (sermon notes, source text, or other material the song picks should echo):
"""
${trimmedAlignment}
"""
Choose songs whose themes, refrains, and theological language echo these notes. Reflect that fit in "whyItFits". Do NOT quote song lyrics from the notes verbatim — paraphrase to honor copyright. If the notes contradict the theme/style above, the theme/style wins.
`
    : "";

  const prompt = `Suggest ${promptCount} worship songs that fit this theme.

Theme: ${data.theme}
Scripture: ${data.scripture ?? "(any)"}
Style preference: ${data.style ?? "mixed (modern worship and hymns)"}

Church context:
${churchContextBlurb(ctx)}
${repBlock ? `\n${repBlock}\n` : ""}${alignmentBlock}${tempoConstraintLine}
Return JSON exactly in this shape:
{
  "theme": "string",
  "songs": [
    {
      "title": "string — real published worship song title",
      "artist": "string — primary artist or hymn writer",
      "style": "string — e.g. modern worship, hymn, gospel, acoustic",
      "bpm": null,
      "themes": ["string", ...],
      "whyItFits": "string — 1-2 sentences pastoring the choice"
    }
  ]
}

Only suggest real, published songs/hymns the pastor can actually find. Do not invent songs.
Keep "whyItFits" to 1-2 short sentences.
"bpm" — return null UNLESS you are highly confident in the recording's actual tempo. Wrong BPMs derail real services; missing BPMs are easy for a worship leader to fill in. The user's saved repertoire BPMs (above) are always preferred over your knowledge — if a title appears there with a BPM, the server will substitute it automatically, so you can safely return null for those rows too.`;

  type RawSong = {
    title?: unknown;
    artist?: unknown;
    style?: unknown;
    bpm?: unknown;
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
    async (raw) => {
      const rawSongs: RawSong[] = Array.isArray(raw?.songs)
        ? (raw.songs as RawSong[])
        : [];
      let droppedOutOfRange = 0;
      let unknownBpmCount = 0;
      // First pass: validate shape, decide repertoire match, and look up
      // a *trusted* BPM. The AI's `s.bpm` is intentionally ignored — the
      // model is unreliable enough at tempos that we'd rather show the
      // worship leader an "Add BPM" affordance than a confident wrong
      // number. Trusted sources, in order of preference:
      //   1. The user's own saved repertoire row (authoritative).
      //   2. The crowdsourced average across all WorshipFlow churches,
      //      gated to ≥3 samples inside lookupBpm so a single typo can't
      //      poison the well.
      const candidates = rawSongs.flatMap((s) => {
        if (
          !s ||
          typeof s.title !== "string" ||
          typeof s.artist !== "string" ||
          typeof s.whyItFits !== "string"
        ) {
          return [];
        }
        const normalizedTitle = normalizeTitle(s.title);
        const inRepertoire = titleSet.has(normalizedTitle);
        // Strict mode is the contract: never let an AI-invented title leak
        // through, no matter what the prompt says.
        if (effectiveMode === "strict" && !inRepertoire) return [];
        return [{ s, normalizedTitle, inRepertoire }];
      });

      const enriched = await Promise.all(
        candidates.map(async ({ s, normalizedTitle, inRepertoire }) => {
          const repertoireBpm = bpmByTitle.get(normalizedTitle) ?? null;
          let bpm: number | null = repertoireBpm;
          if (bpm === null) {
            const hint = await lookupBpm(s.title, s.artist);
            if (hint) bpm = hint.bpm;
          }
          return { s, inRepertoire, bpm };
        }),
      );

      const cleaned = enriched.flatMap(({ s, inRepertoire, bpm }) => {
        // Range safety net: drop suggestions whose trusted BPM is clearly
        // out of range. Songs with no trusted BPM (bpm null) still pass —
        // the user can fill them in via the inline editor in the result
        // card. Strict mode already pre-filters the prompt list.
        if (bpmRange && bpm !== null && !bpmInRange(bpm, bpmRange)) {
          droppedOutOfRange += 1;
          return [];
        }
        if (bpm === null) unknownBpmCount += 1;
        return [
          {
            title: s.title as string,
            artist: s.artist as string,
            whyItFits: s.whyItFits as string,
            ...(typeof s.style === "string" ? { style: s.style } : {}),
            bpm,
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
          result.notice = bpmRange
            ? `No songs in your repertoire matched this theme within ${describeBpmRange(bpmRange)}. Try widening or clearing the tempo range, or switch to Prefer for broader suggestions.`
            : "No songs in your repertoire matched this theme. Add more songs to your repertoire, or switch to Prefer or Off for broader suggestions.";
        } else if (cleaned.length < requestedCount) {
          result.notice = bpmRange
            ? `Only ${cleaned.length} repertoire song${cleaned.length === 1 ? "" : "s"} fit this theme within ${describeBpmRange(bpmRange)}. Widen the tempo range or add more songs for richer Strict-mode results.`
            : `Only ${cleaned.length} song${cleaned.length === 1 ? "" : "s"} from your repertoire fit this theme. Add more to your repertoire for richer Strict-mode results.`;
        }
      } else if (requestedMode !== "off" && repertoire.length === 0) {
        result.notice =
          "Your repertoire is empty, so suggestions come from general worship knowledge. Add songs in Library → Our Repertoire to make future picks feel familiar.";
      } else if (
        bpmRange &&
        droppedOutOfRange > 0 &&
        cleaned.length < requestedCount
      ) {
        // Non-strict path: the model gave us some out-of-range picks. Tell
        // the user we filtered them so a short result list isn't mysterious.
        result.notice = `${droppedOutOfRange} suggestion${droppedOutOfRange === 1 ? " was" : "s were"} dropped for falling outside ${describeBpmRange(bpmRange)}.`;
      } else if (unknownBpmCount > 0 && cleaned.length > 0) {
        // Surface honest "unknown tempo" status so worship leaders know
        // they need to fill in a BPM before planning. Better than the AI
        // silently inventing a wrong one.
        const verb = unknownBpmCount === 1 ? "song has" : "songs have";
        result.notice = `${unknownBpmCount} ${verb} no verified tempo yet. Click "Add BPM" on each card to set one — the value will save with the song and help future suggestions.`;
      }

      const finalResult = result as typeof result & { alignmentNotes?: string };
      if (hasAlignment) {
        finalResult.alignmentNotes = trimmedAlignment;
      }

      return finalResult as unknown as RawResult;
    },
  );
});

router.post("/generate/speaking-moment", requireAuth, requireActiveAccess, async (req, res) => {
  const parsed = GenerateSpeakingMomentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const ctx = await getChurchContext(req.userId!);
  const seconds = data.durationSeconds ?? 60;
  const trimmedAlignmentSm = (data.alignmentNotes ?? "").trim();
  const hasAlignmentSm = trimmedAlignmentSm.length > 0;
  const alignmentBlockSm = hasAlignmentSm
    ? `

Alignment notes from the pastor (sermon notes, source text, or other material this moment should echo):
"""
${trimmedAlignmentSm}
"""
Echo the imagery, refrains, and theological language from these notes in your speaking moment. Do NOT quote song lyrics verbatim — paraphrase to honor copyright. If the notes contradict the kind/topic above, the kind/topic wins.`
    : "";

  const prompt = `Write a short worship speaking moment as JSON.

Kind: ${data.kind}
Topic: ${data.topic ?? "(open)"}
Scripture: ${data.scripture ?? "(optional)"}
Approximate spoken length: ${seconds} seconds
Tone: ${data.tone ?? "warm, pastoral, inviting"}

Church context:
${churchContextBlurb(ctx)}${alignmentBlockSm}

Return JSON exactly in this shape:
{
  "kind": "string",
  "title": "string",
  "body": "string — the words to be spoken aloud, paced for ~${seconds} seconds",
  "deliveryNotes": "string — short notes about pacing, tone, transitions"
}

Match the requested duration. Don't exceed the spoken length budget.`;

  runJob<Record<string, unknown>>(
    req,
    res,
    prompt,
    1500,
    "speaking moment",
    undefined,
    (result) => {
      const out: Record<string, unknown> = { ...result };
      if (hasAlignmentSm) {
        out.alignmentNotes = trimmedAlignmentSm;
      } else {
        delete out.alignmentNotes;
      }
      return out;
    },
  );
});

router.post("/generate/step-content", requireAuth, requireActiveAccess, async (req, res) => {
  const parsed = GenerateStepContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const ctx = await getChurchContext(req.userId!);

  // Per-kind guidance keeps the model on-task. The kind enum is shared
  // with `ServiceFlowStep.kind` minus `sermon` (sermon content lives in
  // Sermon Builder and is rejected at the schema level).
  const kindGuidance: Record<typeof data.kind, string> = {
    song:
      "Suggest ONE worship song that fits this slot. Use this exact format:\n" +
      '"<Song Title> — <Artist or Hymn Writer>\\n\\nWhy it fits: <1-2 sentences pastoring the choice>"\n' +
      "Only suggest a real, published song or hymn the team can actually find. Do not invent titles.",
    scripture:
      "Suggest the scripture passage to read here, with 1-2 sentences of brief framing for the congregation. Use this format:\n" +
      '"<Passage reference> (NIV)\\n\\n<short framing sentence>"',
    prayer:
      "Write a short pastoral prayer (4-8 sentences) suited to this slot. Use leader/people responses with 'Leader:' and 'People:' labels only if the slot title implies a responsive prayer.",
    communion:
      "Write the words of institution and invitation for communion in this tradition. Keep it warm, theologically grounded, and ready to be spoken aloud.",
    offering:
      "Write a brief (~45-second) spoken transition into the offering — connect the giving moment to the day's theme.",
    welcome:
      "Write a brief (~30-60 second) spoken welcome appropriate for this slot. Warm, pastoral, theologically grounded.",
    benediction:
      "Write a short closing blessing (3-6 sentences) the worship leader can speak over the congregation.",
    transition:
      "Write a brief (~30 second) spoken transition for this slot, connecting what came before to what's next.",
    custom:
      "Write the body content for this slot. Match the tone of a worship service. Keep it concise — only as long as the slot needs.",
  };

  const prompt = `Regenerate the body text for ONE slot in a worship service plan.

Slot kind: ${data.kind}
Slot title: ${data.stepName}
Service theme: ${data.theme}
Service scripture: ${data.scripture ?? "(pastor's choice)"}
Service season: ${data.season ?? "Ordinary Time"}
Service length: ${data.serviceLength ?? "60 minutes"}
Service notes: ${data.notes ?? "(none)"}

Church context:
${churchContextBlurb(ctx)}

Slot guidance:
${kindGuidance[data.kind]}

Return JSON exactly in this shape:
{
  "body": "string — the body text for this slot, ready to be used in a service order",
  "durationMinutes": 5
}

"durationMinutes" is optional (omit or set to null if it doesn't make sense for this slot). Be concise — produce only the body for this single slot, not the whole service.`;

  runJob(req, res, prompt, 1500, "step content");
});

router.post("/generate/devotional", requireAuth, requireActiveAccess, async (req, res) => {
  const parsed = GenerateDevotionalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const ctx = await getChurchContext(req.userId!);
  const minutes = data.durationMinutes ?? 10;
  const trimmedAlignmentDv = (data.alignmentNotes ?? "").trim();
  const hasAlignmentDv = trimmedAlignmentDv.length > 0;
  const alignmentBlockDv = hasAlignmentDv
    ? `

Alignment notes from the pastor (sermon notes, source text, or other material this devotional should echo):
"""
${trimmedAlignmentDv}
"""
Echo the imagery, refrains, and theological language from these notes in your devotional. Do NOT quote song lyrics verbatim — paraphrase to honor copyright. If the notes contradict the theme/scripture above, the theme/scripture wins.`
    : "";

  const prompt = `Write a team devotional for a worship rehearsal as JSON.

Theme: ${data.theme}
Scripture: ${data.scripture ?? "(your choice)"}
Audience: ${data.audience ?? "worship team"}
Approximate length: ${minutes} minutes

Church context:
${churchContextBlurb(ctx)}${alignmentBlockDv}

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

  runJob<Record<string, unknown>>(
    req,
    res,
    prompt,
    3000,
    "devotional",
    undefined,
    (result) => {
      const out: Record<string, unknown> = { ...result };
      if (hasAlignmentDv) {
        out.alignmentNotes = trimmedAlignmentDv;
      } else {
        delete out.alignmentNotes;
      }
      return out;
    },
  );
});

router.post("/generate/soul-care", requireAuth, requireActiveAccess, async (req, res) => {
  const parsed = GenerateSoulCareBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const ctx = await getChurchContext(req.userId!);
  const minutes = data.durationMinutes ?? 25;
  const trimmedIntent = (data.intent ?? "").trim();
  const hasIntent = trimmedIntent.length > 0;
  const audience = data.audience;
  const season = (data.season ?? "").trim() || "ordinary time";

  const practiceMap: Record<string, string> = {
    examen: "the Ignatian Examen — review the day for consolations and desolations, where God was present, where you turned away.",
    lectio_divina: "Lectio Divina — slow, prayerful, four-movement reading of scripture (lectio, meditatio, oratio, contemplatio).",
    centering_prayer: "Centering Prayer — sitting in silence with a single sacred word as consent to God's presence (Thomas Keating tradition).",
    silence_solitude: "Silence and Solitude — sustained, structured silence in God's presence (the desert tradition, Henri Nouwen, Dallas Willard).",
    gratitude: "Gratitude — naming and savoring specific gifts as a posture of worship and resistance to scarcity.",
    lament: "Lament — biblical lament patterned on the Psalms (address, complaint, request, trust, praise).",
    sabbath: "Sabbath — ceasing, resting, embracing, feasting (Marva Dawn) as practice of trust.",
    breath_prayer: "Breath Prayer — a short scriptural phrase prayed on the inhale and exhale (Jesus Prayer tradition).",
  };
  const practiceTemplate = data.practiceTemplate ?? "auto";
  const practiceLine =
    practiceTemplate === "auto" || !practiceMap[practiceTemplate]
      ? "Choose ONE well-established Christian spiritual practice that fits the season and intent above (Examen, Lectio Divina, Centering Prayer, Silence and Solitude, Gratitude, Lament, Sabbath, or Breath Prayer). Name it explicitly in `practiceTradition`."
      : `Base this session on ${practiceMap[practiceTemplate]} Name it explicitly in \`practiceTradition\`.`;

  const audienceLine =
    audience === "team"
      ? `This session is for a leader walking a TEAM (worship team, staff, small group) through soul care together. Speak to "the leader" with cues like "invite the team to…", "ask the room…". Practices should work in a shared room with 3-15 people.`
      : `This session is for a leader practicing soul care PERSONALLY. Speak directly in the second person ("you"), gently and pastorally. Practices should be doable alone with a journal.`;

  const intentBlock = hasIntent
    ? `

What's on the participant's heart (treat as confidential, do not quote back verbatim, but let it shape every section):
"""
${trimmedIntent}
"""`
    : "";

  const prompt = `You are an experienced spiritual director writing a guided soul-care session as JSON.

Audience: ${audience}
${audienceLine}

Season / state: ${season}
Approximate length: ${minutes} minutes total
Practice tradition: ${practiceTemplate}
${practiceLine}

Church context:
${churchContextBlurb(ctx)}${intentBlock}

Honor the historic Christian contemplative tradition. Be specific and concrete — not generic platitudes. Avoid therapeutic jargon. Quote scripture from NIV or ESV. Pace the section durations so they SUM to roughly ${minutes} minutes.

Return JSON exactly in this shape:
{
  "title": "string — short, evocative, e.g. 'Stilling the Striving Heart'",
  "durationMinutes": ${minutes},
  "practiceTradition": "string — the named practice (e.g. 'Lectio Divina', 'Examen')",
  "leaderNotes": "string — 2-3 sentences of pacing and posture notes for whoever leads this",
  "opening": "string — a centering moment or breath prayer to open the time (1-2 short paragraphs)",
  "scripture": {
    "reference": "string — passage reference, e.g. 'Psalm 131'",
    "text": "string — the actual passage text",
    "reflection": "string — 2-4 sentences inviting the participant into the passage"
  },
  "practices": [
    {
      "name": "string — short name for this guided movement",
      "instructions": "string — step-by-step guidance, 2-5 short paragraphs. Use \\n\\n between paragraphs.",
      "durationMinutes": 8
    }
    // 2 to 4 practice movements total. They should follow a coherent arc.
  ],
  "journalingPrompts": ["string", "string", "string"],
  "closing": "string — a short closing prayer or blessing",
  "takeHomePractice": "string — one simple practice to carry into the rest of the day or week"
}`;

  runJob<Record<string, unknown>>(
    req,
    res,
    prompt,
    4000,
    "soul-care session",
    undefined,
    (result) => {
      const out: Record<string, unknown> = { ...result };
      if (hasIntent) {
        out.intent = trimmedIntent;
      } else {
        delete out.intent;
      }
      return out;
    },
  );
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
