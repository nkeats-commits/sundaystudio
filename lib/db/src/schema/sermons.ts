import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const sermonSeriesTable = pgTable("sermon_series", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  bigIdea: text("big_idea").notNull().default(""),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  plannedSermonCount: integer("planned_sermon_count"),
  status: text("status").notNull().default("planning"),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type SermonSeries = typeof sermonSeriesTable.$inferSelect;

export type SermonStudyOutput = {
  context?: string | null;
  observation?: string | null;
  interpretation?: string | null;
  application?: string | null;
  crossReferences?: string[] | null;
  interpretiveCautions?: string[] | null;
  resourceInsights?: string | null;
};

export type SermonBigIdeaOption = {
  bigIdea: string;
  rationale?: string | null;
};

export type SermonBigIdeaOutput = {
  selected?: string | null;
  options: SermonBigIdeaOption[];
};

export type SermonOutlinePoint = {
  heading: string;
  summary?: string | null;
  scriptureSupport?: string[] | null;
};

export type SermonOutlineOption = {
  title: string;
  approach?: string | null;
  points: SermonOutlinePoint[];
};

export type SermonOutlineOutput = {
  selectedIndex?: number | null;
  options: SermonOutlineOption[];
};

export type SermonManuscriptOutput = {
  format: "manuscript" | "notes" | "outline";
  introduction?: string | null;
  body: string;
  conclusion?: string | null;
};

export type SermonApplicationItem = {
  audience: string;
  application: string;
};

export type SermonApplicationsOutput = {
  groups: SermonApplicationItem[];
  smallGroupQuestions?: string[] | null;
};

export type SermonIllustrationItem = {
  kind: "story" | "analogy" | "historical" | "cultural" | "personal" | "other";
  title: string;
  body: string;
  verifyBeforeUsing: boolean;
  notes?: string | null;
};

export type SermonIllustrationsOutput = {
  illustrations: SermonIllustrationItem[];
};

export type SermonConclusionOutput = {
  conclusion: string;
  callToResponse?: string | null;
  closingPrayer?: string | null;
};

/**
 * Per-section fingerprints used by the Sermon Builder to detect when a
 * downstream section was generated against now-stale upstream values
 * (e.g. the user changed the selected Big Idea after generating the
 * Manuscript). Each value is a short hash string produced by the client
 * using a stable serialization of the section's upstream inputs.
 *
 * Missing keys are treated as "current" — existing sermons saved before
 * this column existed never look stale.
 */
export type SermonSectionHashes = {
  study?: string;
  bigIdea?: string;
  outline?: string;
  manuscript?: string;
  applications?: string;
  illustrations?: string;
  worshipIntegration?: string;
};

export type SermonWorshipIntegrationOutput = {
  themes?: string[] | null;
  songs?: { title: string; artist?: string | null; whyItFits?: string | null }[] | null;
  callToWorship?: string | null;
  responseMoment?: string | null;
  communionMoment?: string | null;
  benediction?: string | null;
  prayerPrompts?: string[] | null;
  teamDevotionalSeed?: string | null;
  smallGroupQuestions?: string[] | null;
  socialSummary?: string | null;
  emailSummary?: string | null;
};

export const sermonsTable = pgTable("sermons", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  sermonDate: timestamp("sermon_date", { withTimezone: true }),
  passage: text("passage").notNull().default(""),
  secondaryPassages: jsonb("secondary_passages").$type<string[]>().notNull().default([]),
  theme: text("theme").notNull().default(""),
  series: text("series").notNull().default(""),
  seriesId: integer("series_id"),
  seriesOrder: integer("series_order"),
  occasion: text("occasion").notNull().default(""),
  audience: text("audience").notNull().default(""),
  length: text("length").notNull().default(""),
  tone: text("tone").notNull().default(""),
  style: text("style").notNull().default(""),
  depth: text("depth").notNull().default(""),
  outputFormat: text("output_format").notNull().default("manuscript"),
  pastorNotes: text("pastor_notes").notNull().default(""),
  study: jsonb("study").$type<SermonStudyOutput | null>(),
  bigIdea: jsonb("big_idea").$type<SermonBigIdeaOutput | null>(),
  outline: jsonb("outline").$type<SermonOutlineOutput | null>(),
  manuscript: jsonb("manuscript").$type<SermonManuscriptOutput | null>(),
  applications: jsonb("applications").$type<SermonApplicationsOutput | null>(),
  illustrations: jsonb("illustrations").$type<SermonIllustrationsOutput | null>(),
  conclusion: jsonb("conclusion").$type<SermonConclusionOutput | null>(),
  worshipIntegration: jsonb("worship_integration").$type<SermonWorshipIntegrationOutput | null>(),
  sectionHashes: jsonb("section_hashes").$type<SermonSectionHashes>().notNull().default({}),
  attachedResourceIds: jsonb("attached_resource_ids").$type<number[]>().notNull().default([]),
  tags: text("tags").array().notNull().default([]),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Sermon = typeof sermonsTable.$inferSelect;

export const sermonResourcesTable = pgTable("sermon_resources", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  resourceType: text("resource_type").notNull().default("note"),
  title: text("title").notNull(),
  author: text("author").notNull().default(""),
  publisher: text("publisher").notNull().default(""),
  year: text("year").notNull().default(""),
  pageOrLocation: text("page_or_location").notNull().default(""),
  url: text("url").notNull().default(""),
  excerpt: text("excerpt").notNull().default(""),
  summary: text("summary").notNull().default(""),
  notes: text("notes").notNull().default(""),
  relatedPassage: text("related_passage").notNull().default(""),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type SermonResource = typeof sermonResourcesTable.$inferSelect;

export const sermonExportsTable = pgTable("sermon_exports", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sermonId: integer("sermon_id").notNull(),
  format: text("format").notNull().default("markdown"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SermonExport = typeof sermonExportsTable.$inferSelect;
