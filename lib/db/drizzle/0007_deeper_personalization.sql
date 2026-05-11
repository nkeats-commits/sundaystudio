-- Task #148: Deeper Personalization — Voice & Church Vision
-- Adds tone/voice, mission, and focus fields to church_profiles.
-- Creates pastor_manuscripts for tracking uploaded sermon files.

ALTER TABLE "church_profiles"
  ADD COLUMN IF NOT EXISTS "tone_description" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "derived_tone_description" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "mission_statement" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "focus_areas" text[] NOT NULL DEFAULT '{}';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "pastor_manuscripts" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL,
  "file_name" text NOT NULL,
  "stored_path" text NOT NULL,
  "uploaded_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "pastor_manuscripts_user_id_idx" ON "pastor_manuscripts" ("user_id");
