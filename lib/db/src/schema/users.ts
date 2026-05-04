import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Billing — Stripe customer + when their 14-day trial clock starts.
  // trialStartedAt defaults to now() on first row insert so existing users
  // get a fresh 14-day trial after the migration adds the column.
  stripeCustomerId: text("stripe_customer_id"),
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  trialReminderSentAt: timestamp("trial_reminder_sent_at", { withTimezone: true }),
  trialExpiredEmailSentAt: timestamp("trial_expired_email_sent_at", { withTimezone: true }),
});

export type User = typeof usersTable.$inferSelect;
