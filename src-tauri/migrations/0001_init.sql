-- 0001_init.sql — generic Journey/Note/Task/Timeline core.
--
-- Notes on intent:
--   * Journeys link to content through `journey_links`, never through a
--     `journey_id` column on the content itself, so a note or task can belong
--     to several journeys later without a schema change.
--   * `timeline_events.occurred_at` is the chronology; `created_at` only records
--     when the row entered the system. A note written today about last month
--     therefore lands in last month on the timeline.
--   * Timestamps are UTC ISO-8601 strings; rendering to local time is the UI's job.

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS journeys (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('planning', 'active', 'paused', 'completed', 'archived')),
  icon TEXT,
  cover_path TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_journeys_status
  ON journeys(status);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled',
  body_md TEXT NOT NULL DEFAULT '',
  note_type TEXT NOT NULL DEFAULT 'note',
  occurred_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_notes_updated_at
  ON notes(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notes_deleted_at
  ON notes(deleted_at);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  details_md TEXT,
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'doing', 'done', 'cancelled')),
  due_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status_due
  ON tasks(status, due_at);

CREATE TABLE IF NOT EXISTS journey_links (
  id TEXT PRIMARY KEY,
  journey_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (journey_id) REFERENCES journeys(id) ON DELETE CASCADE,
  UNIQUE (journey_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_journey_links_journey
  ON journey_links(journey_id, target_type);

CREATE INDEX IF NOT EXISTS idx_journey_links_target
  ON journey_links(target_type, target_id);

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  reflection TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  importance TEXT NOT NULL DEFAULT 'normal'
    CHECK (importance IN ('compact', 'normal', 'milestone')),
  payload_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_timeline_events_occurred
  ON timeline_events(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_timeline_events_source
  ON timeline_events(source_type, source_id);

CREATE TABLE IF NOT EXISTS timeline_event_journeys (
  event_id TEXT NOT NULL,
  journey_id TEXT NOT NULL,
  PRIMARY KEY (event_id, journey_id),
  FOREIGN KEY (event_id) REFERENCES timeline_events(id) ON DELETE CASCADE,
  FOREIGN KEY (journey_id) REFERENCES journeys(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_timeline_event_journeys_journey
  ON timeline_event_journeys(journey_id, event_id);
