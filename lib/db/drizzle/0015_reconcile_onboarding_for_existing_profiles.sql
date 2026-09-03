-- Reconcile users created or repaired after the original onboarding migration.
-- A profile with both required fields is evidence that first-run capture is
-- complete, so do not show the wizard when the marker is missing.
UPDATE "users"
SET "onboarding_completed_at" = "created_at"
WHERE "onboarding_completed_at" IS NULL
  AND "id" IN (
    SELECT DISTINCT "user_id"
    FROM "church_profiles"
    WHERE btrim("church_name") != ''
      AND btrim("leader_name") != ''
  );