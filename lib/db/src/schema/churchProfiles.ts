import { pgTable, text, integer, serial, timestamp } from "drizzle-orm/pg-core";

export const churchProfilesTable = pgTable("church_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  churchName: text("church_name").notNull(),
  denomination: text("denomination").notNull().default(""),
  theology: text("theology").notNull().default(""),
  location: text("location").notNull().default(""),
  averageAttendance: integer("average_attendance"),
  musicStyle: text("music_style").notNull().default(""),
  traditions: text("traditions").notNull().default(""),
  leaderName: text("leader_name").notNull(),
  leaderRole: text("leader_role").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ChurchProfile = typeof churchProfilesTable.$inferSelect;
