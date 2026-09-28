-- Bounded local images belong to the event and its SQLite snapshot together.
-- Existing events remain unchanged and have no attachments by default.
CREATE TABLE event_images (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES timeline_events(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0 AND width * height <= 20000000),
  position INTEGER NOT NULL CHECK (position >= 0 AND position < 6),
  data BLOB NOT NULL CHECK (length(data) = byte_size),
  thumbnail BLOB NOT NULL CHECK (length(thumbnail) > 0 AND length(thumbnail) <= 1048576)
);

CREATE INDEX event_images_by_event ON event_images(event_id, position);
