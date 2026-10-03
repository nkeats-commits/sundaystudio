-- A trial begins only after a completed Stripe Checkout confirms a valid
-- payment method and a trialing subscription. Account creation alone grants
-- no trial. Keep historical trial dates so expired users remain ineligible.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "trial_enrollment_status" text
    NOT NULL DEFAULT 'pending';

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "trial_enrollment_session_id" text;

ALTER TABLE "users"
  ALTER COLUMN "trial_started_at" DROP DEFAULT,
  ALTER COLUMN "trial_started_at" DROP NOT NULL;

-- Users whose previous local trial is still within its original 14-day
-- window must enroll again and receive a fresh Stripe-backed trial. Expired
-- users keep their old date and are not eligible for another trial.
UPDATE "users"
SET "trial_enrollment_status" = CASE
  WHEN "trial_started_at" + interval '14 days' > NOW() THEN 'pending'
  ELSE 'expired'
END
WHERE "trial_started_at" IS NOT NULL;

ALTER TABLE "users"
  ADD CONSTRAINT "users_trial_enrollment_status_check"
  CHECK ("trial_enrollment_status" IN ('pending', 'enrolled', 'expired'));