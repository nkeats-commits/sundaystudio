/**
 * Shared definitions for the user-defined "order of service" used both by
 * the Service Builder UI and by the AI generator. A flow is the ordered
 * skeleton (kind + display name) that the AI must follow exactly when
 * generating a service plan.
 */

export type WorshipKind =
  | "song"
  | "scripture"
  | "prayer"
  | "sermon"
  | "communion"
  | "offering"
  | "welcome"
  | "benediction"
  | "transition"
  | "custom";

export type FlowStep = {
  stepName: string;
  kind: WorshipKind;
};

export type WorshipElementOption = {
  /** Stable id used as data-testid suffix and React key. */
  id: string;
  kind: WorshipKind;
  label: string;
  /** What gets dropped into the ordered list when this chip is clicked. */
  defaultStepName: string;
};

/**
 * The chip palette shown to the user. These are the canonical worship-element
 * labels — multiple chips can map to the same underlying `kind` so a pastor
 * can add a named "Opening Song" or "Closing Song" with a single click rather
 * than adding a generic "Song" and renaming it.
 */
export const WORSHIP_ELEMENTS: WorshipElementOption[] = [
  { id: "call-to-worship", kind: "welcome", label: "Call to Worship", defaultStepName: "Call to Worship" },
  { id: "opening-song", kind: "song", label: "Opening Song", defaultStepName: "Opening Song" },
  { id: "greeting", kind: "welcome", label: "Greeting", defaultStepName: "Greeting" },
  { id: "worship-set", kind: "song", label: "Worship Set", defaultStepName: "Worship Set" },
  { id: "prayer-of-confession", kind: "prayer", label: "Prayer of Confession", defaultStepName: "Prayer of Confession" },
  { id: "assurance-of-pardon", kind: "prayer", label: "Assurance of Pardon", defaultStepName: "Assurance of Pardon" },
  { id: "scripture-reading", kind: "scripture", label: "Scripture Reading", defaultStepName: "Scripture Reading" },
  { id: "sermon", kind: "sermon", label: "Sermon", defaultStepName: "Sermon" },
  { id: "communion", kind: "communion", label: "Communion", defaultStepName: "Communion" },
  { id: "offering", kind: "offering", label: "Offering", defaultStepName: "Offering" },
  { id: "closing-song", kind: "song", label: "Closing Song", defaultStepName: "Closing Song" },
  { id: "benediction", kind: "benediction", label: "Benediction", defaultStepName: "Benediction" },
  { id: "custom", kind: "custom", label: "Custom step…", defaultStepName: "Custom Step" },
];

export type StarterTemplate = {
  id: string;
  name: string;
  description: string;
  flow: FlowStep[];
};

/**
 * Built-in starter flows shown alongside the user's saved templates. These
 * are not stored in the DB — they ship with the app so a brand-new user
 * always has a sensible place to start regardless of tradition.
 */
export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "starter-liturgical",
    name: "Liturgical (Classic)",
    description:
      "A traditional 4-fold liturgical arc: Gathering → Word → Table → Sending.",
    flow: [
      { stepName: "Call to Worship", kind: "welcome" },
      { stepName: "Opening Hymn", kind: "song" },
      { stepName: "Prayer of Confession", kind: "prayer" },
      { stepName: "Words of Assurance", kind: "prayer" },
      { stepName: "Scripture Reading", kind: "scripture" },
      { stepName: "Sermon", kind: "sermon" },
      { stepName: "Communion", kind: "communion" },
      { stepName: "Hymn of Response", kind: "song" },
      { stepName: "Benediction", kind: "benediction" },
    ],
  },
  {
    id: "starter-contemporary",
    name: "Contemporary Worship",
    description:
      "A modern set: extended worship, the Word, response, sending.",
    flow: [
      { stepName: "Welcome", kind: "welcome" },
      { stepName: "Worship Set: Opener", kind: "song" },
      { stepName: "Worship Set: Anthem", kind: "song" },
      { stepName: "Worship Set: Response", kind: "song" },
      { stepName: "Pastoral Prayer", kind: "prayer" },
      { stepName: "Scripture Reading", kind: "scripture" },
      { stepName: "Sermon", kind: "sermon" },
      { stepName: "Response Song", kind: "song" },
      { stepName: "Offering", kind: "offering" },
      { stepName: "Benediction", kind: "benediction" },
    ],
  },
  {
    id: "starter-evangelical",
    name: "Evangelical Sunday",
    description:
      "Sing → pray → preach → respond. A balanced evangelical Sunday morning.",
    flow: [
      { stepName: "Welcome & Announcements", kind: "welcome" },
      { stepName: "Opening Song", kind: "song" },
      { stepName: "Worship Song", kind: "song" },
      { stepName: "Pastoral Prayer", kind: "prayer" },
      { stepName: "Scripture Reading", kind: "scripture" },
      { stepName: "Sermon", kind: "sermon" },
      { stepName: "Invitation Song", kind: "song" },
      { stepName: "Offering", kind: "offering" },
      { stepName: "Closing Prayer", kind: "benediction" },
    ],
  },
  {
    id: "starter-acoustic",
    name: "Acoustic / Intimate",
    description:
      "A stripped-back gathering — fewer songs, more space for prayer and Word.",
    flow: [
      { stepName: "Welcome", kind: "welcome" },
      { stepName: "Acoustic Worship", kind: "song" },
      { stepName: "Scripture Reading", kind: "scripture" },
      { stepName: "Reflection", kind: "sermon" },
      { stepName: "Prayer of the People", kind: "prayer" },
      { stepName: "Closing Song", kind: "song" },
      { stepName: "Benediction", kind: "benediction" },
    ],
  },
];

export function findElementById(id: string): WorshipElementOption | undefined {
  return WORSHIP_ELEMENTS.find((e) => e.id === id);
}

export function findElementByKind(
  kind: WorshipKind,
): WorshipElementOption | undefined {
  return WORSHIP_ELEMENTS.find((e) => e.kind === kind);
}
