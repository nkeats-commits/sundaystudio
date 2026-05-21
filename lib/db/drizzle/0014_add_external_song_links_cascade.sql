-- Task #193: Fix PCS songs not appearing after sync.
--
-- 1. Re-create the library_item_id FK with ON DELETE CASCADE so that
--    deleting a library_items row automatically removes the matching
--    external_song_links row.  This prevents the "ghost link" scenario
--    where a user deletes songs and the next sync silently updates 0 rows.
--
-- 2. Delete any already-orphaned rows (library_item_id no longer exists
--    in library_items) so the next sync can re-import those songs cleanly.
--
-- The constraint rename / drop-add is idempotent: IF NOT EXISTS / IF EXISTS
-- guards mean re-running this file is safe.

-- Remove orphaned rows first so the new FK constraint can be added without
-- a constraint-violation on the existing data.
DELETE FROM external_song_links
WHERE library_item_id NOT IN (SELECT id FROM library_items);--> statement-breakpoint

-- Drop the existing FK (created without CASCADE).
ALTER TABLE external_song_links
  DROP CONSTRAINT IF EXISTS external_song_links_library_item_id_fkey;--> statement-breakpoint

-- Re-add with ON DELETE CASCADE.
ALTER TABLE external_song_links
  ADD CONSTRAINT external_song_links_library_item_id_fkey
    FOREIGN KEY (library_item_id) REFERENCES library_items(id)
    ON DELETE CASCADE;
