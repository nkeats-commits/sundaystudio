import {
  pgTable,
  text,
  integer,
  timestamp,
  primaryKey,
  numeric,
} from "drizzle-orm/pg-core";

/**
 * Anonymous, cross-church BPM intelligence — stores `(title, artist) -> bpm`
 * rows aggregated from every user who has explicitly confirmed a tempo on a
 * saved song. Used as a soft fallback when the AI Song Assistant suggests
 * a song the user has not added to their own repertoire AND has no
 * verified source (e.g. Planning Center). NEVER overwrites a typed value;
 * only fills blanks, and only after a minimum sample size.
 *
 * Privacy: we deliberately store no church/user identifiers — just the
 * normalized (title, artist) lookup key, the running average BPM, and a
 * sample count. The aggregate is the only thing exposed.
 */
export const crowdsourceBpmTable = pgTable(
  "crowdsource_bpm",
  {
    titleNormalized: text("title_normalized").notNull(),
    artistNormalized: text("artist_normalized").notNull(),
    // Stored as numeric so we can hold a running average without losing
    // precision over many samples. Rounded to an integer at read time.
    bpmAvg: numeric("bpm_avg", { precision: 6, scale: 2 }).notNull(),
    sampleCount: integer("sample_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.titleNormalized, t.artistNormalized] }),
  }),
);

export type CrowdsourceBpm = typeof crowdsourceBpmTable.$inferSelect;
