import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";

export type ServicePlanItem = {
  id: string;
  kind:
    | "song"
    | "scripture"
    | "prayer"
    | "sermon"
    | "communion"
    | "offering"
    | "welcome"
    | "benediction"
    | "transition"
    | "custom";
  title: string;
  body: string;
  durationMinutes?: number | null;
};

export type ServicePlanContent = {
  callToWorship?: string | null;
  openingPrayer?: string | null;
  scriptureReading?: string | null;
  sermonNotes?: string | null;
  confession?: string | null;
  assurance?: string | null;
  benediction?: string | null;
  notes?: string | null;
  order: ServicePlanItem[];
};

export const servicePlansTable = pgTable("service_plans", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  scripture: text("scripture").notNull().default(""),
  theme: text("theme").notNull().default(""),
  season: text("season").notNull().default(""),
  serviceDate: timestamp("service_date", { withTimezone: true }),
  content: jsonb("content").$type<ServicePlanContent>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ServicePlan = typeof servicePlansTable.$inferSelect;
