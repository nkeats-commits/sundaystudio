import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";

export const libraryItemsTable = pgTable("library_items", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LibraryItem = typeof libraryItemsTable.$inferSelect;
