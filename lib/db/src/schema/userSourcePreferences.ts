import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Per-user opt-in list of bundled scholarly sources (public-domain commentaries).
 *
 * One row per user. The `enabledSourceIds` array holds the registered source ids
 * (e.g. `"matthew-henry-concise"`) that this user wants the Sermon Builder to
 * automatically consult when generating any sermon section. The set of valid
 * source ids is owned by the API server's source registry — server-side
 * validation rejects unknown ids on PUT.
 *
 * Users without a row are seeded with the curated default selection on first
 * read; we don't backfill on signup to keep this table sparse.
 */
export const userSourcePreferencesTable = pgTable("user_source_preferences", {
  userId: text("user_id").primaryKey(),
  enabledSourceIds: text("enabled_source_ids")
    .array()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type UserSourcePreferences =
  typeof userSourcePreferencesTable.$inferSelect;
