//! Note repository. Notes are the primary writing object: they exist happily
//! with no journey, no tags and no metadata at all.

use rusqlite::{params, Connection, Row};

use crate::clock::{now_utc, to_utc_opt};
use crate::db::{links_by_target, new_id, timeline};
use crate::domain::{
    LinkTargetType, NewNote, Note, NotePatch, NoteWithLinks, TimelineEntry, TimelineImportance,
};
use crate::error::{AppError, AppResult};

const EXCERPT_LIMIT: usize = 160;

fn map_note(row: &Row<'_>) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get("id")?,
        title: row.get("title")?,
        body_md: row.get("body_md")?,
        note_type: row.get("note_type")?,
        occurred_at: row.get("occurred_at")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        deleted_at: row.get("deleted_at")?,
    })
}

/// First meaningful line of a note, used when the caller supplies no title.
/// The frontend derives titles the same way while typing; this is the fallback
/// that keeps the database sane if it ever doesn't.
pub fn derive_title(body: &str) -> String {
    body.lines()
        .map(|line| line.trim_start_matches('#').trim())
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(80).collect::<String>())
        .unwrap_or_else(|| "Untitled".to_string())
}

/// Plain-text-ish preview for timeline summaries. Deliberately crude: it
/// collapses whitespace rather than parsing Markdown, because a summary only
/// has to be scannable.
///
/// `title` is skipped when it is the note's own first line, so a timeline entry
/// does not print the same text as both its heading and its summary.
fn excerpt(body: &str, title: &str) -> Option<String> {
    let mut lines = body
        .lines()
        .map(|line| line.trim_start_matches('#').trim())
        .filter(|line| !line.is_empty())
        .peekable();

    // Drop a leading line that merely repeats the title.
    if lines.peek() == Some(&title.trim()) {
        lines.next();
    }

    let flattened = lines.collect::<Vec<_>>().join(" · ");

    if flattened.is_empty() {
        return None;
    }
    if flattened.chars().count() <= EXCERPT_LIMIT {
        return Some(flattened);
    }
    let truncated: String = flattened.chars().take(EXCERPT_LIMIT).collect();
    Some(format!("{}…", truncated.trim_end()))
}

fn hydrate(conn: &Connection, notes: Vec<Note>) -> AppResult<Vec<NoteWithLinks>> {
    let mut links = links_by_target(conn, LinkTargetType::Note)?;
    Ok(notes
        .into_iter()
        .map(|note| {
            let link = links.remove(&note.id).unwrap_or_default();
            NoteWithLinks {
                note,
                journeys: link.journeys,
                pinned_in: link.pinned_in,
            }
        })
        .collect())
}

/// Live notes, newest edit first. `search` matches title or body; `journey_id`
/// scopes to one journey's linked notes.
pub fn list(
    conn: &Connection,
    search: Option<&str>,
    journey_id: Option<&str>,
) -> AppResult<Vec<NoteWithLinks>> {
    let needle = search
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let mut stmt = conn.prepare(
        "SELECT n.* FROM notes n
          WHERE n.deleted_at IS NULL
            AND (?1 IS NULL
                 OR n.title LIKE '%' || ?1 || '%'
                 OR n.body_md LIKE '%' || ?1 || '%')
            AND (?2 IS NULL
                 OR EXISTS (SELECT 1 FROM journey_links l
                             WHERE l.target_type = 'note'
                               AND l.target_id = n.id
                               AND l.journey_id = ?2))
          ORDER BY n.updated_at DESC",
    )?;
    let notes = stmt
        .query_map(params![needle, journey_id], map_note)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    hydrate(conn, notes)
}

pub fn find(conn: &Connection, id: &str) -> AppResult<Option<NoteWithLinks>> {
    let note = conn
        .query_row("SELECT * FROM notes WHERE id = ?1", params![id], map_note)
        .ok();
    let Some(note) = note else {
        return Ok(None);
    };
    Ok(hydrate(conn, vec![note])?.into_iter().next())
}

pub fn get(conn: &Connection, id: &str) -> AppResult<NoteWithLinks> {
    find(conn, id)?.ok_or_else(|| AppError::NotFound(format!("note `{id}`")))
}

/// Create a note. When `journey_id` is present the link and its timeline event
/// are written in the same transaction, so "write and file it" is one step.
pub fn create(conn: &Connection, input: NewNote) -> AppResult<NoteWithLinks> {
    let tx = conn.unchecked_transaction()?;
    let now = now_utc();
    let body = input.body_md.unwrap_or_default();

    let title = input
        .title
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| derive_title(&body));

    let note = Note {
        id: new_id("note"),
        title,
        body_md: body,
        note_type: input
            .note_type
            .filter(|t| !t.trim().is_empty())
            .unwrap_or_else(|| "note".to_string()),
        occurred_at: to_utc_opt(input.occurred_at.as_deref())?,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
    };

    tx.execute(
        "INSERT INTO notes
           (id, title, body_md, note_type, occurred_at, created_at, updated_at, deleted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            note.id,
            note.title,
            note.body_md,
            note.note_type,
            note.occurred_at,
            note.created_at,
            note.updated_at,
            note.deleted_at,
        ],
    )?;

    /*
     * An empty note is linked but **not logged**.
     *
     * `New note` inside a journey used to put an `Untitled` row on the timeline
     * before a word had been written, so mis-clicking the button recorded a
     * moment that never happened — and the row outlived deleting the note. A
     * timeline entry should mark something that exists.
     *
     * The link is still written, so the note belongs to the journey immediately
     * and shows in its Notes tab. `link_to_journey` logs it properly once there
     * is content, which is when there is something to read.
     */
    let log_it = !note.body_md.trim().is_empty();

    if let Some(journey_id) = input.journey_id.as_deref() {
        /*
         * The association is made now, but an **empty** note is not logged.
         *
         * `New note` inside a journey used to put an `Untitled` row on the
         * timeline before a word had been written, so mis-clicking the button
         * recorded a moment that never happened — and the row survived deleting
         * the note. A timeline entry should mark something that exists.
         *
         * The link is still written, so the note belongs to the journey from the
         * start and appears in its Notes tab. `update` logs it the moment it
         * first has content (see `log_if_now_worth_logging`), which is when
         * there is actually something to read.
         */
        link_within(&tx, &note, journey_id, None, log_it)?;
    }

    tx.commit()?;
    get(conn, &note.id)
}

/// Autosave path: text edits update the row but never append timeline history.
pub fn update(conn: &Connection, id: &str, patch: NotePatch) -> AppResult<NoteWithLinks> {
    let existing = get(conn, id)?.note;
    let existing_body = existing.body_md.clone();

    let body = patch.body_md.unwrap_or(existing.body_md);
    let title = patch
        .title
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| derive_title(&body));
    let occurred_at = match patch.occurred_at {
        Some(value) => to_utc_opt(value.as_deref())?,
        None => existing.occurred_at,
    };
    let note_type = patch
        .note_type
        .filter(|t| !t.trim().is_empty())
        .unwrap_or(existing.note_type);

    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE notes
            SET title = ?2, body_md = ?3, note_type = ?4, occurred_at = ?5, updated_at = ?6
          WHERE id = ?1",
        params![id, title, body, note_type, occurred_at, now_utc()],
    )?;

    /*
     * The deferred half of "an empty note is linked but not logged".
     *
     * A note created inside a journey is linked immediately but kept off the
     * timeline until it says something. This is where it earns its entry: the
     * first edit that gives it content logs it onto every journey it belongs to.
     *
     * Guarded three ways so autosave cannot produce a stream of entries:
     *   - it must have been empty before and have content now, so this fires on
     *     one transition per note, not on every keystroke;
     *   - `insert_event` is only reached for journeys it is actually linked to;
     *   - a note that already has an entry is skipped outright.
     */
    let gained_content = existing_body.trim().is_empty() && !body.trim().is_empty();
    if gained_content {
        let note = get(&tx, id)?.note;
        let already_logged: i64 = tx.query_row(
            "SELECT count(*) FROM timeline_events
              WHERE source_type = 'note' AND source_id = ?1",
            params![id],
            |row| row.get(0),
        )?;

        if already_logged == 0 {
            let journey_ids = timeline::journey_ids_for_target(&tx, "note", id)?;
            for journey_id in journey_ids {
                link_within(&tx, &note, &journey_id, None, true)?;
            }
        }
    }

    tx.commit()?;
    get(conn, id)
}

/// Soft delete, so an accidental removal stays recoverable.
///
/// The note's row is kept (recoverable), but **what it put on the timeline is
/// removed**. Leaving those entries behind was a reported bug: a deleted note's
/// row stayed on the timeline, could not be opened — its `source_id` pointed at a
/// deleted row — and there was no way to get rid of it from the UI.
///
/// The two are not inconsistent: the note is recoverable because the text is
/// worth keeping, while a timeline entry asserts "this happened and is here to
/// read", which stops being true the moment the note is gone. Re-filing a
/// recovered note logs it again.
pub fn soft_delete(conn: &Connection, id: &str) -> AppResult<()> {
    let tx = conn.unchecked_transaction()?;
    let affected = tx.execute(
        "UPDATE notes SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NULL",
        params![id, now_utc()],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("note `{id}`")));
    }

    timeline::delete_for_source(&tx, "note", id)?;
    tx.commit()?;
    Ok(())
}

pub fn list_deleted(conn: &Connection) -> AppResult<Vec<NoteWithLinks>> {
    let mut stmt = conn
        .prepare("SELECT * FROM notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id")?;
    let notes = stmt
        .query_map([], map_note)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    hydrate(conn, notes)
}

/// Recover text and surviving Journey links. Past note-log entries were removed
/// by deletion; restoring does not invent their lost dates or snapshots.
pub fn restore(conn: &Connection, id: &str) -> AppResult<NoteWithLinks> {
    if conn.execute(
        "UPDATE notes SET deleted_at = NULL WHERE id = ?1 AND deleted_at IS NOT NULL",
        [id],
    )? == 0
    {
        return Err(AppError::NotFound(format!("deleted note `{id}`")));
    }
    get(conn, id)
}

/// Shared by `create` and `link_to_journey`. Writes the association and the
/// `note_logged` event that puts the note on the journey's timeline.
fn link_within(
    conn: &Connection,
    note: &Note,
    journey_id: &str,
    occurred_at: Option<&str>,
    // Write the `note_logged` event. False for a note with no content yet.
    log_event: bool,
) -> AppResult<Option<String>> {
    // Fails loudly rather than silently orphaning if the journey is gone.
    if crate::db::journeys::find(conn, journey_id)?.is_none() {
        return Err(AppError::NotFound(format!("journey `{journey_id}`")));
    }

    conn.execute(
        "INSERT OR IGNORE INTO journey_links
           (id, journey_id, target_type, target_id, pinned, created_at)
         VALUES (?1, ?2, 'note', ?3, 0, ?4)",
        params![new_id("lnk"), journey_id, note.id, now_utc()],
    )?;

    // Chronology preference: explicit override, then the note's own
    // occurred_at, then when it was written.
    let when = to_utc_opt(occurred_at)?
        .or_else(|| note.occurred_at.clone())
        .unwrap_or_else(|| note.created_at.clone());

    let mut event = timeline::draft(
        "note_logged",
        note.title.clone(),
        when,
        TimelineImportance::Normal,
    );
    event.summary = excerpt(&note.body_md, &note.title);
    event.source_type = Some("note".into());
    event.source_id = Some(note.id.clone());

    if !log_event {
        return Ok(None);
    }

    timeline::insert_event(conn, &event, &[journey_id.to_string()])?;
    Ok(Some(event.id))
}

/// Link an existing note to a journey and log it onto that timeline.
pub fn link_to_journey(
    conn: &Connection,
    note_id: &str,
    journey_id: &str,
    occurred_at: Option<&str>,
) -> AppResult<TimelineEntry> {
    let note = get(conn, note_id)?.note;

    let tx = conn.unchecked_transaction()?;
    // Filing a note by hand always logs it: the act is deliberate.
    let event_id = link_within(&tx, &note, journey_id, occurred_at, true)?
        .ok_or_else(|| AppError::Invalid("linking a note must record an event".into()))?;
    tx.commit()?;

    timeline::get(conn, &event_id)?
        .ok_or_else(|| AppError::NotFound(format!("timeline event `{event_id}`")))
}

/// Remove an association. The derived `note_logged` event goes too — see
/// `timeline::detach_source_from_journey`.
pub fn unlink_from_journey(conn: &Connection, note_id: &str, journey_id: &str) -> AppResult<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "DELETE FROM journey_links
          WHERE target_type = 'note' AND target_id = ?1 AND journey_id = ?2",
        params![note_id, journey_id],
    )?;
    timeline::detach_source_from_journey(&tx, "note", note_id, journey_id)?;
    tx.commit()?;
    Ok(())
}

pub fn set_pinned(
    conn: &Connection,
    note_id: &str,
    journey_id: &str,
    pinned: bool,
) -> AppResult<()> {
    let affected = conn.execute(
        "UPDATE journey_links SET pinned = ?3
          WHERE target_type = 'note' AND target_id = ?1 AND journey_id = ?2",
        params![note_id, journey_id, pinned],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!(
            "link between note `{note_id}` and journey `{journey_id}`"
        )));
    }
    Ok(())
}

#[cfg(all(test, feature = "local-tests"))]
mod tests {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/local-tests/db_notes.rs"
    ));
}
