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
  kind: WorshipKind;
  label: string;
  defaultStepName: string;
};

/**
 * The chip palette shown to the user. Each click appends a step with this
 * default name; the user can rename it inline afterwards.
 */
export const WORSHIP_ELEMENTS: WorshipElementOption[] = [
  { kind: "welcome", label: "Welcome", defaultStepName: "Welcome & Greeting" },
  { kind: "song", label: "Song", defaultStepName: "Worship Song" },
  { kind: "prayer", label: "Prayer", defaultStepName: "Opening Prayer" },
  { kind: "scripture", label: "Scripture", defaultStepName: "Scripture Reading" },
  { kind: "sermon", label: "Sermon", defaultStepName: "Sermon" },
  { kind: "communion", label: "Communion", defaultStepName: "Communion" },
  { kind: "offering", label: "Offering", defaultStepName: "Offering" },
  { kind: "benediction", label: "Benediction", defaultStepName: "Benediction" },
  { kind: "transition", label: "Transition", defaultStepName: "Transition" },
  { kind: "custom", label: "Custom", defaultStepName: "Custom Element" },
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

export function findElement(kind: WorshipKind): WorshipElementOption {
  return (
    WORSHIP_ELEMENTS.find((e) => e.kind === kind) ?? WORSHIP_ELEMENTS[9]!
  );
}
