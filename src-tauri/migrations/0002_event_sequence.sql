-- 0002_event_sequence.sql — deterministic ordering for simultaneous events.
--
-- Why: `occurred_at` has millisecond resolution, so two events recorded in the
-- same millisecond (completing a task the instant a note is logged, or a seed
-- run inserting several rows at once) tied on both `occurred_at` and
-- `created_at`. Ordering then fell through to `id`, which is a random UUID —
-- meaning the timeline could show a note logged *after* the task it preceded,
-- differently on each read.
--
-- `seq` records insertion order and breaks the tie the way a reader expects:
-- the order the events actually entered the notebook. It is assigned by the
-- application (SQLite cannot add an AUTOINCREMENT column to an existing table).
--
-- Existing rows are backfilled from rowid, which for an append-only table is
-- already their insertion order.

ALTER TABLE timeline_events ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;

UPDATE timeline_events SET seq = rowid WHERE seq = 0;

-- Ordering always leads with occurred_at; this index serves the tie-break.
CREATE INDEX IF NOT EXISTS idx_timeline_events_occurred_seq
  ON timeline_events(occurred_at, seq);
