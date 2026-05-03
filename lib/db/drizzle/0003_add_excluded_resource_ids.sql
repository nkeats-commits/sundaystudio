-- Task #71: Auto-include Resource Library in Sermon Builder.
-- The Sermon Builder no longer asks the pastor to hand-attach Library rows
-- per-sermon. Instead the server auto-includes every Library row whose
-- relatedPassage matches the sermon's passages, MINUS this opt-out list.
-- Default empty array preserves the new "everything that matches is in"
-- behavior for already-existing sermons.
ALTER TABLE "sermons"
  ADD COLUMN IF NOT EXISTS "excluded_resource_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;
