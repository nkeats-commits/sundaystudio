import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  serial,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * A reusable "order of service" the user has saved. The flow is just the
 * ordered skeleton (kind + step name); generators / the AI fill in body
 * content per slot when a service plan is generated from this template.
 */
export type ServiceFlowStep = {
  stepName: string;
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
};

export const serviceTemplatesTable = pgTable(
  "service_templates",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    flow: jsonb("flow").$type<ServiceFlowStep[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    // Case-insensitive uniqueness of (userId, name) so concurrent inserts
    // can't slip past the application-level duplicate check.
    uniqueUserLowerName: uniqueIndex(
      "service_templates_user_lower_name_uniq",
    ).on(table.userId, sql`lower(${table.name})`),
  }),
);

export type ServiceTemplate = typeof serviceTemplatesTable.$inferSelect;
