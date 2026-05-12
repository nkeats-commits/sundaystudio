-- Migration: add ai_usage_events table for tracking token consumption and cost
-- Idempotent: uses IF NOT EXISTS so re-running is safe.

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id             serial PRIMARY KEY,
  user_id        text        NOT NULL,
  generation_type text       NOT NULL,
  input_tokens   integer     NOT NULL,
  output_tokens  integer     NOT NULL,
  cost_usd       numeric(12, 8) NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_user_id_idx    ON ai_usage_events (user_id);
CREATE INDEX IF NOT EXISTS ai_usage_events_created_at_idx ON ai_usage_events (created_at);
