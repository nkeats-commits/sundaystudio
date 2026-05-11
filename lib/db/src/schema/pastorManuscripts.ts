import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const pastorManuscriptsTable = pgTable("pastor_manuscripts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  fileName: text("file_name").notNull(),
  storedPath: text("stored_path").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PastorManuscript = typeof pastorManuscriptsTable.$inferSelect;
