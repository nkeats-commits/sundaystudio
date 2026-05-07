-- Task #95: First-run onboarding wizard.
-- Adds onboarding_completed_at to users so the wizard only fires once.
-- Existing users who already have a complete church profile are grandfathered:
-- their onboarding_completed_at is set to their created_at date so the
-- wizard never appears for them.
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "users"
SET "onboarding_completed_at" = "created_at"
WHERE "id" IN (
  SELECT DISTINCT "user_id"
  FROM "church_profiles"
  WHERE "church_name" != ''
    AND "leader_name" != ''
);
