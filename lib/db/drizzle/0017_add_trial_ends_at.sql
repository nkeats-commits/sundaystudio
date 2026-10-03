-- Persist Stripe's effective trial end independently from the original
-- confirmed trial start so support extensions can move the charge/access date.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamptz;