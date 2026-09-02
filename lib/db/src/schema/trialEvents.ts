import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Durable conversion funnel events. These are intentionally separate from
 * Resend event delivery: product analytics must remain available when email
 * credentials are absent or an automation provider is unavailable.
 */
export const trialEventsTable = pgTable(
  "trial_events",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id),
    eventName: text("event_name").notNull(),
    trialDay: integer("trial_day").notNull(),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("trial_events_user_id_idx").on(t.userId),
    index("trial_events_name_created_at_idx").on(t.eventName, t.createdAt),
  ],
);

export type TrialEvent = typeof trialEventsTable.$inferSelect;
export type NewTrialEvent = typeof trialEventsTable.$inferInsert;