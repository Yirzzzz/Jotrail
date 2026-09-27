//! Journey repository. A journey is a user-created thematic space; nothing here
//! knows or cares what domain it belongs to.

use rusqlite::{params, Connection, Row};

use crate::clock::{now_utc, to_utc_opt};
use crate::db::{new_id, timeline};
use crate::domain::{Journey, JourneyPatch, JourneyStatus, NewJourney, TimelineImportance};
use crate::error::{AppError, AppResult};

fn map_journey(row: &Row<'_>) -> rusqlite::Result<Journey> {
    Ok(Journey {
        id: row.get("id")?,
        title: row.get("title")?,
        description: row.get("description")?,
        status: row.get("status")?,
        icon: row.get("icon")?,
        cover_path: row.get("cover_path")?,
        started_at: row.get("started_at")?,
        ended_at: row.get("ended_at")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

/// Sidebar order: live journeys in creation order, archived ones last.
pub fn list(conn: &Connection) -> AppResult<Vec<Journey>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM journeys
          ORDER BY CASE WHEN status = 'archived' THEN 1 ELSE 0 END,
                   created_at ASC",
    )?;
    let journeys = stmt
        .query_map([], map_journey)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(journeys)
}

pub fn find(conn: &Connection, id: &str) -> AppResult<Option<Journey>> {
    let journey = conn
        .query_row("SELECT * FROM journeys WHERE id = ?1", params![id], map_journey)
        .ok();
    Ok(journey)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Journey> {
    find(conn, id)?.ok_or_else(|| AppError::NotFound(format!("journey `{id}`")))
}

pub fn create(conn: &Connection, input: NewJourney) -> AppResult<Journey> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(AppError::Invalid("a journey needs a title".into()));
    }

    let now = now_utc();
    let journey = Journey {
        id: new_id("jny"),
        title: title.to_string(),
        description: input
            .description
            .map(|d| d.trim().to_string())
            .filter(|d| !d.is_empty()),
        status: input.status.unwrap_or(JourneyStatus::Active),
        icon: input.icon.filter(|i| !i.trim().is_empty()),
        cover_path: None,
        // Start date defaults to now and stays editable.
        started_at: to_utc_opt(input.started_at.as_deref())?.unwrap_or_else(|| now.clone()),
        ended_at: None,
        created_at: now.clone(),
        updated_at: now,
    };

    conn.execute(
        "INSERT INTO journeys
           (id, title, description, status, icon, cover_path,
            started_at, ended_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            journey.id,
            journey.title,
            journey.description,
            journey.status,
            journey.icon,
            journey.cover_path,
            journey.started_at,
            journey.ended_at,
            journey.created_at,
            journey.updated_at,
        ],
    )?;

    Ok(journey)
}

pub fn update(conn: &Connection, id: &str, patch: JourneyPatch) -> AppResult<Journey> {
    let existing = get(conn, id)?;

    let title = match patch.title {
        Some(ref value) if value.trim().is_empty() => {
            return Err(AppError::Invalid("a journey needs a title".into()))
        }
        Some(value) => value.trim().to_string(),
        None => existing.title,
    };
    let description = match patch.description {
        Some(value) => value.map(|d| d.trim().to_string()).filter(|d| !d.is_empty()),
        None => existing.description,
    };
    let icon = patch.icon.or(existing.icon);
    let started_at = to_utc_opt(patch.started_at.as_deref())?.unwrap_or(existing.started_at);
    let now = now_utc();

    conn.execute(
        "UPDATE journeys
            SET title = ?2, description = ?3, icon = ?4, started_at = ?5, updated_at = ?6
          WHERE id = ?1",
        params![id, title, description, icon, started_at, now],
    )?;

    get(conn, id)
}

fn status_label(status: JourneyStatus) -> &'static str {
    match status {
        JourneyStatus::Planning => "Planning",
        JourneyStatus::Active => "Active",
        JourneyStatus::Paused => "Paused",
        JourneyStatus::Completed => "Completed",
        JourneyStatus::Archived => "Archived",
    }
}

/// Change status and append the transition to history in one transaction, so
/// current state and the timeline can never disagree.
pub fn set_status(conn: &Connection, id: &str, status: JourneyStatus) -> AppResult<Journey> {
    let existing = get(conn, id)?;
    if existing.status == status {
        return Ok(existing);
    }

    let tx = conn.unchecked_transaction()?;
    let now = now_utc();

    // Completing a journey closes its date range; reopening clears it again.
    let ended_at = match status {
        JourneyStatus::Completed | JourneyStatus::Archived => Some(now.clone()),
        _ => None,
    };

    tx.execute(
        "UPDATE journeys SET status = ?2, ended_at = ?3, updated_at = ?4 WHERE id = ?1",
        params![id, status, ended_at, now],
    )?;

    let mut event = timeline::draft(
        "journey_status_changed",
        existing.title.clone(),
        now.clone(),
        // Reaching "completed" is worth remembering; other flips are minor.
        if matches!(status, JourneyStatus::Completed) {
            TimelineImportance::Milestone
        } else {
            TimelineImportance::Compact
        },
    );
    event.summary = Some(format!(
        "{} → {}",
        status_label(existing.status),
        status_label(status)
    ));
    event.source_type = Some("journey".into());
    event.source_id = Some(id.to_string());
    event.payload_json = Some(
        serde_json::json!({
            "field": "status",
            "from": existing.status.as_str(),
            "to": status.as_str(),
        })
        .to_string(),
    );

    timeline::insert_event(&tx, &event, &[id.to_string()])?;
    tx.commit()?;

    get(conn, id)
}

/// Delete a journey.
///
/// Notes and tasks survive — they can exist without any journey, and destroying
/// someone's writing because they tidied up a timeline would be indefensible.
/// What goes is the journey itself, its links, and the events that only ever
/// described *this* journey (its status changes). Events shared with another
/// journey stay, minus this association — the same rule unlinking follows
/// (DECISIONS.md D-016).
pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    // Fail before touching anything if the journey is already gone.
    if find(conn, id)?.is_none() {
        return Err(AppError::NotFound(format!("journey `{id}`")));
    }

    let tx = conn.unchecked_transaction()?;

    // Note which events this journey touched *before* the cascade removes the
    // join rows, otherwise there is no way to tell afterwards which events to
    // re-examine.
    let affected: Vec<String> = {
        let mut stmt =
            tx.prepare("SELECT event_id FROM timeline_event_journeys WHERE journey_id = ?1")?;
        let ids = stmt
            .query_map(params![id], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<String>>>()?;
        ids
    };

    // `journey_links` and `timeline_event_journeys` both cascade from here.
    tx.execute("DELETE FROM journeys WHERE id = ?1", params![id])?;

    // An event left with no journey at all is unreachable from any timeline.
    // Drop it only when it was derived from this journey or from a link; a
    // free-standing recorded event stays as unscoped history.
    for event_id in affected {
        tx.execute(
            "DELETE FROM timeline_events
              WHERE id = ?1
                AND source_type IN ('journey', 'note', 'task')
                AND NOT EXISTS (SELECT 1 FROM timeline_event_journeys ej
                                 WHERE ej.event_id = ?1)",
            params![event_id],
        )?;
    }

    tx.commit()?;
    Ok(())
}

#[cfg(all(test, feature = "local-tests"))]
mod tests {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/local-tests/db_journeys.rs"
    ));
}
