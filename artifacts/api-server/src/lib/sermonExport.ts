import type { Sermon } from "@workspace/db";

function fmtDate(d: Date | null | string | undefined): string {
  if (!d) return "Unscheduled";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "Unscheduled";
  return date.toLocaleDateString();
}

function joinList(items: string[] | null | undefined, sep = ", "): string {
  if (!items || items.length === 0) return "";
  return items.join(sep);
}

function renderWordStudies(s: Sermon): string[] {
  if (!s.study?.wordStudies?.length) return [];
  const lines = ["## Word Studies", ""];
  for (const ws of s.study.wordStudies) {
    lines.push(`### ${ws.term}`);
    const strongs = ws.strongsNumber ? ` — ${ws.strongsNumber}` : "";
    lines.push(`${ws.originalWord} (${ws.transliteration}) — ${ws.language}${strongs}`);
    lines.push("");
    if (ws.references?.length) {
      lines.push("**Source verses:** " + joinList(ws.references));
      lines.push("");
    }
    lines.push("**Definition:** " + ws.definition);
    lines.push("");
    lines.push("**Significance:** " + ws.significance);
    lines.push("");
  }
  return lines;
}

export function renderSermonAsMarkdown(s: Sermon): string {
  const lines: string[] = [];
  lines.push(`# ${s.title}`);
  lines.push("");
  const meta = [
    s.passage ? `**Passage:** ${s.passage}` : "",
    s.theme ? `**Theme:** ${s.theme}` : "",
    s.series ? `**Series:** ${s.series}` : "",
    s.sermonDate ? `**Date:** ${fmtDate(s.sermonDate)}` : "",
    s.occasion ? `**Occasion:** ${s.occasion}` : "",
  ]
    .filter(Boolean)
    .join("  \n");
  if (meta) {
    lines.push(meta);
    lines.push("");
  }

  if (s.bigIdea?.selected) {
    lines.push("## Big Idea");
    lines.push(s.bigIdea.selected);
    lines.push("");
  }

  if (s.study) {
    lines.push("## Passage Study");
    if (s.study.context) {
      lines.push("**Context.** " + s.study.context);
      lines.push("");
    }
    if (s.study.observation) {
      lines.push("**Observation.** " + s.study.observation);
      lines.push("");
    }
    if (s.study.interpretation) {
      lines.push("**Interpretation.** " + s.study.interpretation);
      lines.push("");
    }
    if (s.study.application) {
      lines.push("**Application.** " + s.study.application);
      lines.push("");
    }
    if (s.study.crossReferences && s.study.crossReferences.length > 0) {
      lines.push("**Cross references:** " + joinList(s.study.crossReferences));
      lines.push("");
    }
    if (s.study.interpretiveCautions && s.study.interpretiveCautions.length > 0) {
      lines.push("**Interpretive cautions:**");
      for (const c of s.study.interpretiveCautions) lines.push("- " + c);
      lines.push("");
    }
    lines.push(...renderWordStudies(s));
  }

  const outline = s.outline?.options?.[s.outline?.selectedIndex ?? 0];
  if (outline) {
    lines.push("## Outline — " + outline.title);
    if (outline.approach) {
      lines.push("_" + outline.approach + "_");
      lines.push("");
    }
    outline.points.forEach((p, i) => {
      lines.push(`${i + 1}. **${p.heading}**`);
      if (p.summary) lines.push(`   ${p.summary}`);
      if (p.scriptureSupport && p.scriptureSupport.length > 0) {
        lines.push(`   _Scripture: ${joinList(p.scriptureSupport)}_`);
      }
    });
    lines.push("");
  }

  if (s.manuscript) {
    lines.push(
      "## " +
        (s.manuscript.format === "manuscript"
          ? "Manuscript"
          : s.manuscript.format === "notes"
            ? "Speaking Notes"
            : "Outline"),
    );
    if (s.manuscript.introduction) {
      lines.push("### Introduction");
      lines.push(s.manuscript.introduction);
      lines.push("");
    }
    lines.push(s.manuscript.body);
    lines.push("");
    if (s.manuscript.conclusion) {
      lines.push("### Conclusion");
      lines.push(s.manuscript.conclusion);
      lines.push("");
    }
  }

  if (s.applications) {
    lines.push("## Applications");
    for (const g of s.applications.groups) {
      lines.push(`- **${g.audience}:** ${g.application}`);
    }
    if (
      s.applications.smallGroupQuestions &&
      s.applications.smallGroupQuestions.length > 0
    ) {
      lines.push("");
      lines.push("### Small group questions");
      for (const q of s.applications.smallGroupQuestions) lines.push("- " + q);
    }
    lines.push("");
  }

  if (s.illustrations?.illustrations?.length) {
    lines.push("## Illustrations");
    for (const ill of s.illustrations.illustrations) {
      const verify = ill.verifyBeforeUsing ? " _(verify before using)_" : "";
      lines.push(`### ${ill.title} — _${ill.kind}_${verify}`);
      lines.push(ill.body);
      if (ill.notes) lines.push("> " + ill.notes);
      lines.push("");
    }
  }

  if (s.conclusion) {
    lines.push("## Conclusion");
    lines.push(s.conclusion.conclusion);
    if (s.conclusion.callToResponse) {
      lines.push("");
      lines.push("**Call to response.** " + s.conclusion.callToResponse);
    }
    if (s.conclusion.closingPrayer) {
      lines.push("");
      lines.push("**Closing prayer.** " + s.conclusion.closingPrayer);
    }
    lines.push("");
  }

  if (s.worshipIntegration) {
    lines.push("## Worship Integration");
    const w = s.worshipIntegration;
    if (w.themes && w.themes.length > 0) {
      lines.push("**Themes:** " + joinList(w.themes));
      lines.push("");
    }
    if (w.songs && w.songs.length > 0) {
      lines.push("### Suggested songs");
      for (const sg of w.songs) {
        const a = sg.artist ? ` — ${sg.artist}` : "";
        const why = sg.whyItFits ? `: ${sg.whyItFits}` : "";
        lines.push(`- **${sg.title}**${a}${why}`);
      }
      lines.push("");
    }
    if (w.callToWorship) {
      lines.push("### Call to worship");
      lines.push(w.callToWorship);
      lines.push("");
    }
    if (w.responseMoment) {
      lines.push("### Response moment");
      lines.push(w.responseMoment);
      lines.push("");
    }
    if (w.communionMoment) {
      lines.push("### Communion moment");
      lines.push(w.communionMoment);
      lines.push("");
    }
    if (w.benediction) {
      lines.push("### Benediction");
      lines.push(w.benediction);
      lines.push("");
    }
    if (w.smallGroupQuestions && w.smallGroupQuestions.length > 0) {
      lines.push("### Small group questions");
      for (const q of w.smallGroupQuestions) lines.push("- " + q);
      lines.push("");
    }
  }

  if (s.smallGroupQuestions) {
    const sg = s.smallGroupQuestions;
    const hasContent =
      !!sg.openingIcebreaker ||
      (sg.observationQuestions && sg.observationQuestions.length > 0) ||
      (sg.interpretationQuestions && sg.interpretationQuestions.length > 0) ||
      (sg.applicationQuestions && sg.applicationQuestions.length > 0) ||
      !!sg.prayerPrompt;
    if (hasContent) {
      lines.push("## Small Group Questions");
      if (sg.openingIcebreaker) {
        lines.push("### Opening icebreaker");
        lines.push(sg.openingIcebreaker);
        lines.push("");
      }
      if (sg.observationQuestions && sg.observationQuestions.length > 0) {
        lines.push("### Observation");
        for (const q of sg.observationQuestions) lines.push("- " + q);
        lines.push("");
      }
      if (sg.interpretationQuestions && sg.interpretationQuestions.length > 0) {
        lines.push("### Interpretation");
        for (const q of sg.interpretationQuestions) lines.push("- " + q);
        lines.push("");
      }
      if (sg.applicationQuestions && sg.applicationQuestions.length > 0) {
        lines.push("### Application");
        for (const q of sg.applicationQuestions) lines.push("- " + q);
        lines.push("");
      }
      if (sg.prayerPrompt) {
        lines.push("### Prayer prompt");
        lines.push(sg.prayerPrompt);
        lines.push("");
      }
    }
  }

  if (s.pastorNotes) {
    lines.push("## Pastor notes");
    lines.push(s.pastorNotes);
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

export function renderSermonAsText(s: Sermon): string {
  return renderSermonAsMarkdown(s)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^- /gm, "• ");
}

/**
 * Pull the small-group questions section out of a sermon as its own
 * stand-alone leader handout. Includes only what a lay leader running
 * a mid-week group needs: passage, big idea, word studies, and the grouped questions.
 *
 * Falls back to the lighter `applications.smallGroupQuestions` list when
 * the dedicated Small Group Questions add-on hasn't been generated yet.
 */
export function renderSmallGroupHandoutMarkdown(s: Sermon): string {
  const lines: string[] = [];
  lines.push(`# Small Group Discussion — ${s.title}`);
  lines.push("");
  const meta = [
    s.passage ? `**Passage:** ${s.passage}` : "",
    s.sermonDate ? `**Sunday:** ${fmtDate(s.sermonDate)}` : "",
    s.series ? `**Series:** ${s.series}` : "",
  ]
    .filter(Boolean)
    .join("  \n");
  if (meta) {
    lines.push(meta);
    lines.push("");
  }

  if (s.bigIdea?.selected) {
    lines.push("## Big idea");
    lines.push(s.bigIdea.selected);
    lines.push("");
  }

  lines.push(...renderWordStudies(s));

  const sg = s.smallGroupQuestions;
  const hasDedicated =
    !!sg &&
    (!!sg.openingIcebreaker ||
      (sg.observationQuestions && sg.observationQuestions.length > 0) ||
      (sg.interpretationQuestions && sg.interpretationQuestions.length > 0) ||
      (sg.applicationQuestions && sg.applicationQuestions.length > 0) ||
      !!sg.prayerPrompt);

  if (hasDedicated && sg) {
    if (sg.openingIcebreaker) {
      lines.push("## Opening icebreaker");
      lines.push(sg.openingIcebreaker);
      lines.push("");
    }
    if (sg.observationQuestions && sg.observationQuestions.length > 0) {
      lines.push("## Observation — what does the text say?");
      sg.observationQuestions.forEach((q, i) =>
        lines.push(`${i + 1}. ${q}`),
      );
      lines.push("");
    }
    if (sg.interpretationQuestions && sg.interpretationQuestions.length > 0) {
      lines.push("## Interpretation — what does it mean?");
      sg.interpretationQuestions.forEach((q, i) =>
        lines.push(`${i + 1}. ${q}`),
      );
      lines.push("");
    }
    if (sg.applicationQuestions && sg.applicationQuestions.length > 0) {
      lines.push("## Application — how does it shape this week?");
      sg.applicationQuestions.forEach((q, i) =>
        lines.push(`${i + 1}. ${q}`),
      );
      lines.push("");
    }
    if (sg.prayerPrompt) {
      lines.push("## Prayer prompt");
      lines.push(sg.prayerPrompt);
      lines.push("");
    }
  } else {
    const fallback =
      (s.applications?.smallGroupQuestions ?? []).concat(
        s.worshipIntegration?.smallGroupQuestions ?? [],
      );
    if (fallback.length > 0) {
      lines.push("## Discussion questions");
      fallback.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
      lines.push("");
    } else {
      lines.push(
        "_No small group questions have been generated for this sermon yet._",
      );
      lines.push("");
    }
  }

  return lines.join("\n").trim() + "\n";
}

export function renderSmallGroupHandoutText(s: Sermon): string {
  return renderSmallGroupHandoutMarkdown(s)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1");
}

/**
 * Email-friendly variant of the small-group handout. Adds a brief
 * pastoral context paragraph above the questions so the leader has
 * something they can forward to their group as-is.
 */
export function renderSmallGroupHandoutEmail(s: Sermon): string {
  const lines: string[] = [];
  const sundayLabel = s.sermonDate ? fmtDate(s.sermonDate) : null;
  const subjectBits = ["Small group discussion"];
  if (s.passage) subjectBits.push(s.passage);
  else subjectBits.push(s.title);
  lines.push(`Subject: ${subjectBits.join(" — ")}`);
  lines.push("");
  lines.push("Hi friends,");
  lines.push("");

  const intro: string[] = [];
  intro.push(
    `Here are this week's discussion questions for our group, drawn from ${
      sundayLabel ? `Sunday's (${sundayLabel}) ` : "Sunday's "
    }message${s.passage ? ` on ${s.passage}` : ""}${
      s.title ? ` — "${s.title}"` : ""
    }.`,
  );
  if (s.bigIdea?.selected) {
    intro.push(`The big idea we landed on: ${s.bigIdea.selected}`);
  }
  intro.push(
    "Use as many or as few as fit your time together. Don't feel obligated to get through all of them — depth beats breadth.",
  );
  for (const p of intro) {
    lines.push(p);
    lines.push("");
  }

  const body = renderSmallGroupHandoutText(s)
    .split("\n")
    .slice(1) // drop the "Small Group Discussion — Title" header line
    .join("\n")
    .trim();
  if (body) {
    lines.push(body);
    lines.push("");
  }

  lines.push("Thanks for shepherding your group well this week.");
  lines.push("");
  return lines.join("\n").trim() + "\n";
}
