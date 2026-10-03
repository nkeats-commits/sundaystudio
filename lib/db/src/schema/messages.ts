import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

import { conversations, conversationsLegacyUnowned } from "./conversations";

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("messages_conversation_id_created_at_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    check("messages_role_check", sql`${table.role} in ('user', 'assistant')`),
    check(
      "messages_content_length_check",
      sql`char_length(${table.content}) between 1 and 20000`,
    ),
  ],
);

/**
 * Kept only to preserve pre-owner starter messages during schema pushes.
 * No application route or service should access this archive.
 */
export const messagesLegacyUnowned = pgTable("messages_legacy_unowned", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  foreignKey({
    name: "messages_conversation_id_conversations_id_fk",
    columns: [table.conversationId],
    foreignColumns: [conversationsLegacyUnowned.id],
  }).onDelete("cascade"),
]);

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
}).extend({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(20_000),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
