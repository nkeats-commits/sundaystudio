-- Task #71: per-sermon opt-out for public-domain commentary sources.
-- Layered ON TOP of the user's global Settings preference: the server
-- removes any sourceId in this list from the enabled set when running
-- mergeScholarlyResources for THIS sermon only. Default empty array
-- preserves prior behavior for already-existing sermons.
ALTER TABLE "sermons"
  ADD COLUMN IF NOT EXISTS "excluded_source_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;
