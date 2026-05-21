import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { libraryItemsTable } from "./libraryItems";

/**
 * Links a saved library_items row back to the external system it came from
 * (Planning Center today, possibly Hymnary etc. later). Used to:
 *
 *  - Identify songs as "verified" so the AI generator can trust their BPM.
 *  - Power incremental re-sync without dup detection by title alone (which
 *    is fragile when arrangements share titles).
 *  - Avoid creating duplicate library rows on repeated imports.
 *
 * `(source, externalId)` is the natural key. We allow at most one link
 * per (source, externalId) so a re-sync upserts cleanly.
 */
export const externalSongLinksTable = pgTable(
  "external_song_links",
  {
    id: serial("id").primaryKey(),
    libraryItemId: integer("library_item_id")
      .notNull()
      .references(() => libraryItemsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    // Source system identifier. Today: "pcs". Future: "hymnary",
    // "crowdsource", etc. Kept as text rather than an enum so adding a new
    // source doesn't require a migration.
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    // Per-source upstream payload snippet (e.g. PCS arrangement bpm/key).
    // Free-form so each source can store what it needs without schema
    // changes. Read with a typed parser per source.
    metadata: text("metadata"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    sourceExternalIdx: uniqueIndex(
      "external_song_links_source_external_id_idx",
    ).on(t.source, t.externalId, t.userId),
  }),
);

export type ExternalSongLink = typeof externalSongLinksTable.$inferSelect;
