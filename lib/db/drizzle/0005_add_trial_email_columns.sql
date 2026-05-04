-- Task #74: Trial expiry email notifications.
-- Adds two nullable timestamp columns to `users` so the cron can track
-- which emails have already been sent (idempotency guard).
ALTER TABLE "users" ADD COLUMN "trial_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_expired_email_sent_at" timestamp with time zone;
