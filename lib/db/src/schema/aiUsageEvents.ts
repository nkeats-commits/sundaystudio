import { pgTable, serial, text, integer, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Records every AI generation call with token counts and estimated cost.
 *
 * Cost is computed at write time using Claude Sonnet pricing:
 *   - Input:  $3.00 / 1M tokens
 *   - Output: $15.00 / 1M tokens
 *
 * user_id is a soft FK to users — admin delete cascades via explicit SQL before
 * deleting the user row, which preserves the constraint without needing ON DELETE CASCADE.
 */
export const aiUsageEventsTable = pgTable(
  "ai_usage_events",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id),
    generationType: text("generation_type").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costUsd: numeric("cost_usd", { precision: 12, scale: 8 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ai_usage_events_user_id_idx").on(t.userId),
    index("ai_usage_events_created_at_idx").on(t.createdAt),
  ],
);

export type AiUsageEvent = typeof aiUsageEventsTable.$inferSelect;
export type NewAiUsageEvent = typeof aiUsageEventsTable.$inferInsert;
