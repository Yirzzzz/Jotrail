-- 0003_task_origin.sql — where a task came from.
--
-- Why: an event often produces work. An interview reveals gaps; reading a paper
-- raises questions. Those tasks belong *to* the event that spawned them, and
-- `PRODUCT_SPEC.md` §5's own example timeline says so — "new gaps discovered;
-- new tasks created".
--
-- Without this the two are unrelated rows and the causal link — the thing that
-- makes a Journey readable as development rather than as a list — is lost.
--
-- Shape deliberately mirrors `timeline_events.source_type` / `source_id`, which
-- already records the same kind of "this came from that" relationship. One
-- pattern, used twice, rather than a second mechanism.
--
-- `origin_type` is free-form TEXT for the same reason `event_type` is: a task
-- may later derive from a note, or from a future custom object, without a
-- migration.

ALTER TABLE tasks ADD COLUMN origin_type TEXT;
ALTER TABLE tasks ADD COLUMN origin_id TEXT;

-- Looking up "what did this event produce?" is the common direction.
CREATE INDEX IF NOT EXISTS idx_tasks_origin
  ON tasks(origin_type, origin_id);
