-- 0004_prune_orphan_note_events.sql — clear note events the pre-fix code left
-- behind.
--
-- Why: until recently `New note` inside a journey logged a `note_logged` event
-- before anything had been written, and deleting a note left that event in
-- place. Both are fixed in `notes::create` / `notes::soft_delete`, but a code
-- fix is forward-only: a database written before it still shows `Untitled` rows
-- that cannot be opened — their `source_id` points at a deleted note — and that
-- the UI offers no way to remove.
--
-- The rule below is the one the code now applies at write time: a note earns a
-- timeline entry when it exists and has content. So this deletes exactly the
-- rows the current code would never have written — the source note is missing,
-- soft-deleted, or empty — and nothing else.
--
-- An empty note that is still live keeps its journey link and its Notes-tab row.
-- It only leaves the timeline until it is written into, at which point the first
-- edit with content logs it (`notes::update`). Nothing becomes unreachable.
--
-- Only note-sourced events are touched. Task events deliberately outlive their
-- task (see `tasks::delete`) because a completion describes something that
-- happened; this migration is not the place to revisit that decision.
--
-- `timeline_event_journeys` rows follow via ON DELETE CASCADE.
--
-- The explicit character set on `trim` is not decoration: SQLite's one-argument
-- `trim` strips spaces and nothing else, so a body of "\n" would read as
-- non-empty here while `body_md.trim().is_empty()` in Rust calls it empty — the
-- migration would then keep exactly the rows the code refuses to write.

DELETE FROM timeline_events
 WHERE source_type = 'note'
   AND NOT EXISTS (
     SELECT 1 FROM notes n
      WHERE n.id = timeline_events.source_id
        AND n.deleted_at IS NULL
        AND trim(n.body_md, char(32, 9, 10, 11, 12, 13)) <> ''
   );
