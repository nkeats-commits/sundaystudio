-- Adds the per-user "Scholarly Sources" opt-in table for Task #56.
-- Each row holds the set of bundled-commentary source ids the user has
-- enabled in Settings. Sparse: users without a row are treated as having
-- the curated default selection at read time.
CREATE TABLE IF NOT EXISTS "user_source_preferences" (
  "user_id" text PRIMARY KEY,
  "enabled_source_ids" text[] NOT NULL DEFAULT '{}',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
