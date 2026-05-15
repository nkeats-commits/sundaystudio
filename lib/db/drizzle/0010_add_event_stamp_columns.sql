-- Task #173: Resend Automations integration.
-- Adds per-event idempotency stamp columns to `users` so lifecycle
-- events fire at most once per user. All columns are nullable timestamps;
-- a NULL value means the event has not yet been tracked.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "first_sermon_event_fired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "first_service_plan_event_fired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "first_library_item_event_fired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "church_profile_event_fired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "planning_center_event_fired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "scholarly_sources_event_fired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "repertoire_event_fired_at" timestamp with time zone;
