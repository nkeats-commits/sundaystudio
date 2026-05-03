import {
  pgTable,
  text,
  timestamp,
  serial,
  integer,
} from "drizzle-orm/pg-core";

/**
 * One row per user who has connected their Planning Center account. Tokens
 * are stored verbatim — Replit's secrets system protects the OAuth client
 * credentials, but per-user access tokens have nowhere obviously better to
 * live. If a future task introduces a KMS, encrypt these fields at rest.
 *
 * `expiresAt` is the access token's hard deadline. Refresh slightly before
 * to avoid race conditions on long-running imports.
 */
export const pcsConnectionsTable = pgTable("pcs_connections", {
  id: serial("id").primaryKey(),
  // One connection per user. Multi-tenancy here mirrors the rest of the
  // app, which keys data off Clerk's userId today.
  userId: text("user_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // PCO returns the connected organization id with /me; cached here so the
  // Integrations UI can label the connection ("Connected to: Hillside
  // Church") without a round-trip on every render.
  organizationId: text("organization_id"),
  organizationName: text("organization_name"),
  // Stats from the last sync. Updated by /sync and on the OAuth callback's
  // initial import. Null on a brand-new connection that hasn't synced yet.
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastSyncSongCount: integer("last_sync_song_count"),
  lastSyncError: text("last_sync_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type PcsConnection = typeof pcsConnectionsTable.$inferSelect;
