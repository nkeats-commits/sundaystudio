import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";

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
  position: integer("position"),
});

export type HelpArticle = typeof helpArticlesTable.$inferSelect;
export type NewHelpArticle = typeof helpArticlesTable.$inferInsert;

export const helpCategoryOrderTable = pgTable("help_category_order", {
  category: text("category").primaryKey(),
  position: integer("position").notNull(),
});

export type HelpCategoryOrder = typeof helpCategoryOrderTable.$inferSelect;
