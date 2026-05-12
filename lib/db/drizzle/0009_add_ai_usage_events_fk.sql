-- Migration: add foreign key constraint from ai_usage_events.user_id to users.id
-- Idempotent: DO block checks pg_constraint before adding.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_usage_events_user_id_fkey'
      AND conrelid = 'ai_usage_events'::regclass
  ) THEN
    ALTER TABLE ai_usage_events
      ADD CONSTRAINT ai_usage_events_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;
END$$;
