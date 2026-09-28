-- Independent, optional classification groups within a Journey. Existing
-- register stages stay intact; a category does not create another register.
CREATE TABLE state_categories (
  id TEXT PRIMARY KEY,
  journey_id TEXT NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  selection_mode TEXT NOT NULL CHECK (selection_mode IN ('single', 'multiple')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (journey_id, name)
);

CREATE TABLE state_category_options (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES state_categories(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'neutral',
  position INTEGER NOT NULL,
  UNIQUE (category_id, label)
);

-- A row with no options is an explicit clear; an absent category means no
-- change. Snapshot names/values survive removal of the Journey configuration.
-- Category/option IDs deliberately have no FK to live vocabulary tables.
CREATE TABLE event_classifications (
  event_id TEXT NOT NULL REFERENCES timeline_events(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  category_name TEXT NOT NULL,
  selection_mode TEXT NOT NULL CHECK (selection_mode IN ('single', 'multiple')),
  PRIMARY KEY (event_id, category_id)
);

CREATE TABLE event_classification_options (
  event_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  label TEXT NOT NULL,
  tone TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (event_id, category_id, option_id),
  FOREIGN KEY (event_id, category_id)
    REFERENCES event_classifications(event_id, category_id) ON DELETE CASCADE
);

CREATE INDEX idx_event_classifications_category ON event_classifications(category_id);
CREATE INDEX idx_event_classification_options_option ON event_classification_options(option_id);

-- Vocabulary merges and corrections may update displayed labels, but never
-- silently destroy the old values. Audit snapshots are portable JSON and are
-- included in both SQLite backups and structured exports.
CREATE TABLE classification_audit (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('category', 'stage_set', 'event')),
  owner_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  prior_json TEXT NOT NULL CHECK (json_valid(prior_json)),
  created_at TEXT NOT NULL
);
