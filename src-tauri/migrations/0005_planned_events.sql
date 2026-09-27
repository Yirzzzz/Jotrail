-- 0005_planned_events.sql — an event can be a commitment rather than a record.
--
-- Why: a paper journey needs "ICLR 2027 截稿" on its timeline before it has
-- happened. That is a deadline the user is holding themselves to, and it belongs
-- on the timeline for the same reason everything else does — it is part of how
-- the Journey developed.
--
-- Why this is a column and not a date comparison. It is tempting to call any
-- event with a future `occurred_at` "planned" and derive the whole thing for
-- free. That is wrong in the one case that matters most: the day the deadline
-- passes, an *unmet* commitment would silently become indistinguishable from
-- something that actually happened. The timeline would claim the paper was
-- submitted because the date arrived. A plan that was never confirmed has to
-- stay legible as a plan forever, which means the distinction is a fact about
-- the event, not a fact about the clock.
--
--   event_state = 'planned'   intended; nothing has happened yet
--   event_state = 'recorded'  it happened, at `occurred_at`
--
-- `occurred_at` keeps its meaning as *the event's position in the timeline*, so
-- ordering, month/day grouping and every existing query work untouched: while an
-- event is planned, its position is the date it is aimed at.
--
-- `planned_for` is what makes confirming lossless. Confirming sets
-- `event_state = 'recorded'` and moves `occurred_at` to when the thing actually
-- happened, while `planned_for` keeps the original target — so "the deadline was
-- the 12th, I submitted on the 10th" survives as a readable fact instead of the
-- deadline being overwritten. Same reasoning as keeping `occurred_at` separate
-- from `created_at` (0001).
--
-- Every existing row is something that happened, which is exactly the default.

ALTER TABLE timeline_events ADD COLUMN event_state TEXT NOT NULL DEFAULT 'recorded'
  CHECK (event_state IN ('planned', 'recorded'));

ALTER TABLE timeline_events ADD COLUMN planned_for TEXT;

-- Reinterpret the deadlines that already exist.
--
-- Before this column there was exactly one way to put a future date on the
-- timeline: record an event dated ahead. Anyone who wanted a deadline did that,
-- and the notebook this ships into has such a row — "2027 ICLR 截稿", dated ahead
-- of the day it was written. Leaving those as records would be the migration
-- ignoring what they plainly are, and there is no way to delete a recorded event
-- (D-040's open gap), so the user could not fix it by hand either.
--
-- Narrow on purpose:
--
--   * `event_recorded` only — the kind the user writes by hand. Everything
--     derived (`note_logged`, the task events, `journey_status_changed`) reports
--     another object and cannot meaningfully be a commitment.
--   * `occurred_at` still in the future *at migration time*. A past-dated event is
--     a record and stays one.
--
-- `planned_for` takes `occurred_at`, which is the invariant a planned row holds:
-- its place on the timeline is the date it is aimed at. Confirming it later moves
-- `occurred_at` and leaves this behind as the original target.
--
-- The comparison is lexicographic on ISO-8601, which is sound because every
-- stored timestamp is UTC in the same fixed format (`clock::now_utc`), and the
-- `strftime` below is built to match it exactly.

UPDATE timeline_events
   SET event_state = 'planned',
       planned_for = occurred_at
 WHERE event_type = 'event_recorded'
   AND occurred_at > strftime('%Y-%m-%dT%H:%M:%f', 'now') || 'Z';
