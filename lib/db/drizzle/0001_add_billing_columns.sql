-- Additive migration for the subscription billing feature.
-- Adds two columns to the existing `users` table:
--   * stripe_customer_id  — set when the user starts a Stripe Checkout session.
--   * trial_started_at    — anchor for the local 14-day trial clock; defaults
--                            to now() so existing rows immediately get a fresh
--                            14-day trial after this migration runs.
-- The IF NOT EXISTS guard keeps the migration idempotent against environments
-- where the columns were already added via `drizzle-kit push`.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "trial_started_at" timestamp with time zone
    DEFAULT now() NOT NULL;
