import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Billing — the trial clock starts only after Stripe confirms a card-backed
  // trial subscription. New users remain pending until that confirmation.
  stripeCustomerId: text("stripe_customer_id"),
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  trialEnrollmentStatus: text("trial_enrollment_status")
    .$type<"pending" | "enrolled" | "expired">()
    .notNull()
    .default("pending"),
  trialEnrollmentSessionId: text("trial_enrollment_session_id"),
  trialReminderSentAt: timestamp("trial_reminder_sent_at", { withTimezone: true }),
  trialExpiredEmailSentAt: timestamp("trial_expired_email_sent_at", { withTimezone: true }),
  trialMidpointEmailSentAt: timestamp("trial_midpoint_email_sent_at", { withTimezone: true }),
  trialFinalReminderEmailSentAt: timestamp("trial_final_reminder_email_sent_at", { withTimezone: true }),
  trialActivationEventFiredAt: timestamp("trial_activation_event_fired_at", { withTimezone: true }),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  // Resend Automations idempotency stamps — each column is set to now()
  // the first time the corresponding lifecycle event fires. A NULL value
  // means the event has never been tracked for this user.
  firstSermonEventFiredAt: timestamp("first_sermon_event_fired_at", { withTimezone: true }),
  firstServicePlanEventFiredAt: timestamp("first_service_plan_event_fired_at", { withTimezone: true }),
  firstLibraryItemEventFiredAt: timestamp("first_library_item_event_fired_at", { withTimezone: true }),
  churchProfileEventFiredAt: timestamp("church_profile_event_fired_at", { withTimezone: true }),
  planningCenterEventFiredAt: timestamp("planning_center_event_fired_at", { withTimezone: true }),
  scholarlySourcesEventFiredAt: timestamp("scholarly_sources_event_fired_at", { withTimezone: true }),
  repertoireEventFiredAt: timestamp("repertoire_event_fired_at", { withTimezone: true }),
});

export type User = typeof usersTable.$inferSelect;
