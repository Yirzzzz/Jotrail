-- 0006_subjects.sql — the thing a run of events is *about*.
--
-- Why: the timeline records moments, and a register needs things. Read the
-- notebook this ships into and the gap is visible in the data itself:
--
--   2025-08-01  2026 AAAI 投稿
--   2025-09-15  2026 AAAI 一轮拒稿
--   2026-05-04  TMM 投稿
--   2026-08-14  TMM 一轮大修返稿
--
-- Nine events, five things. The user was already encoding "these belong to the
-- same submission" as a title prefix, by hand, because the model gave them no
-- other way. A subject is that prefix made real, so the app can count it,
-- group by it, and show one row per submission with its current stage.
--
-- `kind` is free-form TEXT for the same reason `event_type` and `note_type` are
-- (DATA_MODEL.md calls the latter "extensible, not an enum lock-in"). That is
-- what makes the register generic: `paper` today, `position` next, `movie` with
-- no new code at all. There is deliberately no field-definition table — that is
-- DATA_MODEL.md §9's EAV proposal, which §4 of the same document argues against
-- and AGENTS.md §12 forbids outright. A subject is a thing with a name.
--
-- One subject belongs to one Journey, decided by the user. Notes and tasks are
-- many-to-many through `journey_links`; this is not, so it carries a plain
-- `journey_id` and dies with its Journey.

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  journey_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (journey_id) REFERENCES journeys(id) ON DELETE CASCADE
);

-- The register's own query: everything of one kind in one Journey.
CREATE INDEX IF NOT EXISTS idx_subjects_journey_kind
  ON subjects(journey_id, kind, title);

-- What an event is *about*, and what stage that thing reached.
--
-- `subject_id` is a new column rather than a reuse of `source_type`/`source_id`,
-- which mean something different: the source is what *produced* the event (a
-- note being logged, a task being completed). A hand-recorded interview has no
-- source but is very much about a position. One event could have both.
--
-- `stage` is the short label the user already types into titles — 投稿, 拒稿,
-- 一面. Pulled out as its own field so a register can show each subject's
-- current stage, which is simply the `stage` of its most recent event. Nothing
-- is stored twice: there is no `current_state` column on `subjects`, because a
-- derived value that can disagree with its own history is worse than a join.
--
-- Named `stage`, not `state`, on purpose. This schema already carries four
-- state-ish concepts — `tasks.status`, `journeys.status`,
-- `timeline_events.event_state`, and the `{field, from, to}` payload of a
-- `state_changed` event. A fifth column called `state` would be unreadable at a
-- glance. A subject is *at* a stage, which is also the more accurate word.
--
-- Free-form, and deliberately not a closed vocabulary. Papers run
-- 投稿 → 拒稿/大修 → 接收 and positions run 投递 → 一面 → 二面 → offer; asking
-- the user to define either up front would be the form-filling AGENTS.md §1
-- exists to prevent. The UI offers previously-used values for that kind as
-- suggestions instead.
--
-- ON DELETE SET NULL: deleting a subject must not delete the events that
-- happened. The interview took place whether or not the position is still
-- tracked, which is the same reasoning `tasks::delete` follows for completion
-- events.

ALTER TABLE timeline_events ADD COLUMN subject_id TEXT
  REFERENCES subjects(id) ON DELETE SET NULL;

ALTER TABLE timeline_events ADD COLUMN stage TEXT;

-- "This subject's history" and "the register's current states" are both this
-- lookup, and both want it in chronological order.
CREATE INDEX IF NOT EXISTS idx_timeline_events_subject
  ON timeline_events(subject_id, occurred_at, seq);

-- Existing events are left alone on purpose. Splitting `2026 AAAI 投稿` into a
-- subject and a state looks safe, but it is guessing at intent on real data —
-- and the two journeys use different separators (`——` in 秋招, a bare space in
-- 科研论文), so a wrong guess would corrupt the record it was trying to
-- organise. The 19 existing events are tagged by hand through the edit dialog,
-- which also lets the user settle on one naming style while doing it.
