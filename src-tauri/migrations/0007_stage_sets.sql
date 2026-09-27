-- 0007_stage_sets.sql — a reusable, named set of stages, with a tone each.
--
-- Why: migration 0006 made `stage` free text, and a register acquired its
-- vocabulary by being used. That works, but the vocabulary is then a *by-product
-- of one Journey's events* — `SELECT DISTINCT stage`. Two things follow, and both
-- were felt on real data:
--
--   1. It cannot be reused. Next year's 秋招 starts from an empty suggestion
--      list, because 一面 exists only inside this year's rows.
--   2. It cannot be counted honestly. "How many are at 大修" needs to know that
--      大修 is a stage of this register at all, including when the answer is 0 —
--      and a zero has no row to be derived from.
--
-- A stage set fixes all three by making the vocabulary a thing the user names,
-- rather than a residue of what they happened to type.
--
-- **This is a layer on top, not a replacement.** `timeline_events.stage` stays
-- free TEXT, a register with no set behaves exactly as it did, and no existing
-- row is touched. That is deliberate: the notebook this ships into already has
-- stages typed by hand, and they must keep working while the user decides
-- whether to formalise them.
--
-- What this is NOT: a workflow, and not a display order either. The user was
-- explicit twice over — anything may follow anything (投递 may jump straight to
-- offer), and a stage is *not* a position in a sequence: it only says what
-- something is right now. So a stage set is a **vocabulary of labels, each with a
-- colour**, and nothing else. Modelling permitted moves would also break the one
-- thing the timeline is for: recording what actually happened, including the
-- paths nobody planned.
--
-- What this is also NOT: a field definition table. Stages are named, fields are
-- not — DATA_MODEL.md §4 argues against EAV and AGENTS.md §12 forbids a schema
-- editor. A subject remains a thing with a name.

-- The set itself. Global rather than per-Journey, which is the whole point:
-- 「面试流程」is defined once and picked again by 秋招 2027.
CREATE TABLE IF NOT EXISTS stage_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- One stage. `label` is the user's own word and doubles as the value stored on
-- events; `tone` is a *name* from a closed list, never a colour literal, so the
-- palette stays inside the design system (AGENTS.md §7: never hard-code a colour
-- in a component — a user-supplied hex would be exactly that, stored in a table).
--
-- `position` is **insertion order only** — where the stage sits in the editor's
-- list. It is deliberately not a display order: a stage says what something is
-- now, not where it stands in a sequence, so the register groups by recency of
-- movement and the Overview's cross-section by count. The column is kept because
-- a set still needs *some* stable order to be stored and re-read in, or the
-- editor would reshuffle its own rows between saves.
--
-- UNIQUE(set_id, label) because the label is how an event refers to a stage.
-- Two stages with one name would make "how many are at 一面" unanswerable.
CREATE TABLE IF NOT EXISTS stage_options (
  id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL,
  label TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'neutral',
  position INTEGER NOT NULL,
  UNIQUE (set_id, label),
  FOREIGN KEY (set_id) REFERENCES stage_sets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stage_options_set
  ON stage_options(set_id, position);

-- Which set a register uses.
--
-- Keyed by `(journey_id, kind)` because that pair *is* a register: there is no
-- `registers` table, since a kind exists only as a property of the subjects
-- carrying it (0006). A table whose only column was a name would earn nothing
-- and would put the same fact in two places.
--
-- One set per register, so every paper in 论文 is described by the same
-- vocabulary — which is what makes the counts comparable.
CREATE TABLE IF NOT EXISTS register_stage_sets (
  journey_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  set_id TEXT NOT NULL,
  attached_at TEXT NOT NULL,
  PRIMARY KEY (journey_id, kind),
  FOREIGN KEY (journey_id) REFERENCES journeys(id) ON DELETE CASCADE,
  FOREIGN KEY (set_id) REFERENCES stage_sets(id) ON DELETE CASCADE
);

-- Answers "which registers use this set", which is what a delete has to warn
-- about.
CREATE INDEX IF NOT EXISTS idx_register_stage_sets_set
  ON register_stage_sets(set_id);
