import type { ServicePlan } from "@workspace/db";

function fmtDate(d: Date | null | string | undefined): string {
  if (!d) return "Unscheduled";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "Unscheduled";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "song":
      return "Song";
    case "scripture":
      return "Scripture";
    case "prayer":
      return "Prayer";
    case "sermon":
      return "Sermon";
    case "communion":
      return "Communion";
    case "offering":
      return "Offering";
    case "welcome":
      return "Welcome";
    case "benediction":
      return "Benediction";
    case "transition":
      return "Transition";
    default:
      return "Element";
  }
}

export function renderServicePlanAsMarkdown(p: ServicePlan): string {
  const lines: string[] = [];
  lines.push(`# ${p.title}`);
  lines.push("");

  const meta = [
    p.serviceDate ? `**Date:** ${fmtDate(p.serviceDate)}` : "",
    p.scripture ? `**Scripture:** ${p.scripture}` : "",
    p.theme ? `**Theme:** ${p.theme}` : "",
    p.season ? `**Season:** ${p.season}` : "",
  ]
    .filter(Boolean)
    .join("  \n");
  if (meta) {
    lines.push(meta);
    lines.push("");
  }

  const c = p.content;

  if (c.notes) {
    lines.push("## Pastoral Notes");
    lines.push(c.notes);
    lines.push("");
  }

  if (c.callToWorship) {
    lines.push("## Call to Worship");
    lines.push(c.callToWorship);
    lines.push("");
  }

  if (c.openingPrayer) {
    lines.push("## Opening Prayer");
    lines.push(c.openingPrayer);
    lines.push("");
  }

  if (c.scriptureReading) {
    lines.push("## Scripture Reading");
    lines.push(c.scriptureReading);
    lines.push("");
  }

  if (c.confession) {
    lines.push("## Confession");
    lines.push(c.confession);
    lines.push("");
  }

  if (c.assurance) {
    lines.push("## Assurance");
    lines.push(c.assurance);
    lines.push("");
  }

  const order = c.order ?? [];
  if (order.length > 0) {
    lines.push("## Order of Service");
    lines.push("");
    order.forEach((item, i) => {
      const dur = item.durationMinutes ? ` _(${item.durationMinutes}m)_` : "";
      lines.push(
        `${i + 1}. **${item.title}** — _${kindLabel(item.kind)}_${dur}`,
      );
      if (item.body) {
        const indented = item.body
          .split("\n")
          .map((l) => "   " + l)
          .join("\n");
        lines.push(indented);
      }
      if (item.linkedTitle) {
        lines.push(`   _Linked: ${item.linkedTitle}_`);
      }
      lines.push("");
    });
  }

  if (c.sermonNotes) {
    lines.push("## Sermon Notes");
    lines.push(c.sermonNotes);
    lines.push("");
  }

  if (c.benediction) {
    lines.push("## Benediction");
    lines.push(c.benediction);
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

export function renderServicePlanAsText(p: ServicePlan): string {
  return renderServicePlanAsMarkdown(p)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^- /gm, "• ");
}
