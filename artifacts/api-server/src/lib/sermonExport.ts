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
