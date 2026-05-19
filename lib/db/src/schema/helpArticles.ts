import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const helpArticlesTable = pgTable("help_articles", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  category: text("category").notNull().default("General"),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type HelpArticle = typeof helpArticlesTable.$inferSelect;
export type NewHelpArticle = typeof helpArticlesTable.$inferInsert;
