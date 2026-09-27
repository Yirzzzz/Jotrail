//! Development seed. Loads `fixtures/demo-seed.json` the first time the app
//! starts against an empty database so the primary screen has something to
//! show. Never runs in release builds, and never runs if any data exists.

use rusqlite::{params, Connection};
use serde::Deserialize;

use crate::clock::{now_utc, to_utc, to_utc_opt};
use crate::db::{new_id, timeline};
use crate::domain::{JourneyStatus, TaskStatus, TimelineEventState, TimelineImportance};
use crate::error::AppResult;

/// The fixture is compiled in so a packaged dev build behaves like a source run.
pub const DEMO_SEED: &str = include_str!("../../../fixtures/demo-seed.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeedFile {
    #[serde(default)]
    journeys: Vec<SeedJourney>,
    #[serde(default)]
    notes: Vec<SeedNote>,
    #[serde(default)]
    tasks: Vec<SeedTask>,
    #[serde(default)]
    journey_links: Vec<SeedLink>,
    #[serde(default)]
    timeline_events: Vec<SeedEvent>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeedJourney {
    id: String,
    title: String,
    description: Option<String>,
    status: Option<JourneyStatus>,
    icon: Option<String>,
    started_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeedNote {
    id: String,
    title: String,
    body_md: String,
    note_type: Option<String>,
    occurred_at: Option<String>,
    created_at: String,
    updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeedTask {
    id: String,
    title: String,
    details_md: Option<String>,
    status: Option<TaskStatus>,
    due_at: Option<String>,
    completed_at: Option<String>,
    created_at: String,
    updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeedLink {
    journey_id: String,
    target_type: String,
    target_id: String,
    #[serde(default)]
    pinned: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeedEvent {
    id: String,
    event_type: String,
    title: String,
    summary: Option<String>,
    reflection: Option<String>,
    occurred_at: String,
    created_at: Option<String>,
    source_type: Option<String>,
    source_id: Option<String>,
    importance: Option<TimelineImportance>,
    payload: Option<serde_json::Value>,
    /// `planned` makes the entry a commitment rather than a record. The fixture
    /// states it once; `planned_for` is derived from `occurred_at`, because a
    /// plan's position on the timeline *is* the date it is aimed at.
    event_state: Option<TimelineEventState>,
    #[serde(default)]
    journey_ids: Vec<String>,
}

/// True when the user has no content at all. Checked before seeding so a real
/// notebook is never touched.
pub fn is_empty(conn: &Connection) -> AppResult<bool> {
    let total: i64 = conn.query_row(
        "SELECT (SELECT COUNT(*) FROM journeys)
              + (SELECT COUNT(*) FROM notes)
              + (SELECT COUNT(*) FROM tasks)
              + (SELECT COUNT(*) FROM timeline_events)",
        [],
        |row| row.get(0),
    )?;
    Ok(total == 0)
}

/// Load a fixture. Fixture IDs are preserved so its internal references resolve,
/// and every timestamp is normalised to UTC on the way in.
pub fn apply(conn: &Connection, json: &str) -> AppResult<()> {
    let seed: SeedFile = serde_json::from_str(json)?;
    let tx = conn.unchecked_transaction()?;

    for journey in &seed.journeys {
        let started_at = to_utc(&journey.started_at)?;
        tx.execute(
            "INSERT INTO journeys
               (id, title, description, status, icon, cover_path,
                started_at, ended_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, NULL, ?6, ?6)",
            params![
                journey.id,
                journey.title,
                journey.description,
                journey.status.unwrap_or(JourneyStatus::Active),
                journey.icon,
                started_at,
            ],
        )?;
    }

    for note in &seed.notes {
        let created_at = to_utc(&note.created_at)?;
        let updated_at = to_utc_opt(note.updated_at.as_deref())?.unwrap_or_else(|| created_at.clone());
        tx.execute(
            "INSERT INTO notes
               (id, title, body_md, note_type, occurred_at, created_at, updated_at, deleted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)",
            params![
                note.id,
                note.title,
                note.body_md,
                note.note_type.clone().unwrap_or_else(|| "note".to_string()),
                to_utc_opt(note.occurred_at.as_deref())?,
                created_at,
                updated_at,
            ],
        )?;
    }

    for task in &seed.tasks {
        let created_at = to_utc(&task.created_at)?;
        let updated_at = to_utc_opt(task.updated_at.as_deref())?.unwrap_or_else(|| created_at.clone());
        tx.execute(
            "INSERT INTO tasks
               (id, title, details_md, status, due_at, completed_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                task.id,
                task.title,
                task.details_md,
                task.status.unwrap_or(TaskStatus::Todo),
                to_utc_opt(task.due_at.as_deref())?,
                to_utc_opt(task.completed_at.as_deref())?,
                created_at,
                updated_at,
            ],
        )?;
    }

    for link in &seed.journey_links {
        tx.execute(
            "INSERT OR IGNORE INTO journey_links
               (id, journey_id, target_type, target_id, pinned, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                new_id("lnk"),
                link.journey_id,
                link.target_type,
                link.target_id,
                link.pinned,
                now_utc(),
            ],
        )?;
    }

    for event in &seed.timeline_events {
        let occurred_at = to_utc(&event.occurred_at)?;
        let event_state = event.event_state.unwrap_or(TimelineEventState::Recorded);
        let planned_for = match event_state {
            TimelineEventState::Planned => Some(occurred_at.clone()),
            TimelineEventState::Recorded => None,
        };

        tx.execute(
            "INSERT INTO timeline_events
               (id, event_type, title, summary, reflection, occurred_at, created_at,
                source_type, source_id, importance, payload_json, event_state, planned_for)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                event.id,
                event.event_type,
                event.title,
                event.summary,
                event.reflection,
                occurred_at,
                // Falls back to `occurred_at`, not to now: a fixture row with no
                // `createdAt` describes a moment that was written down when it
                // happened.
                to_utc_opt(event.created_at.as_deref())?.unwrap_or_else(|| occurred_at.clone()),
                event.source_type,
                event.source_id,
                event.importance.unwrap_or(TimelineImportance::Normal),
                event.payload.as_ref().map(|p| p.to_string()),
                event_state,
                planned_for,
            ],
        )?;

        for journey_id in &event.journey_ids {
            tx.execute(
                "INSERT OR IGNORE INTO timeline_event_journeys (event_id, journey_id)
                 VALUES (?1, ?2)",
                params![event.id, journey_id],
            )?;
        }
    }

    // The fixture lists tasks but not their events. Deriving them keeps the
    // seeded database consistent with the rules the app itself follows: a task
    // joining a journey is recorded, and so is completing one.
    for task in &seed.tasks {
        let journey_ids = timeline::journey_ids_for_target(&tx, "task", &task.id)?;
        if journey_ids.is_empty() {
            continue;
        }

        let mut added = timeline::draft(
            "task_added",
            task.title.clone(),
            to_utc(&task.created_at)?,
            TimelineImportance::Compact,
        );
        added.summary = Some("Added".to_string());
        added.source_type = Some("task".into());
        added.source_id = Some(task.id.clone());
        timeline::insert_event(&tx, &added, &journey_ids)?;

        let (Some(TaskStatus::Done), Some(completed_at)) =
            (task.status, task.completed_at.as_deref())
        else {
            continue;
        };
        let mut derived = timeline::draft(
            "task_completed",
            task.title.clone(),
            to_utc(completed_at)?,
            TimelineImportance::Compact,
        );
        derived.summary = Some("Completed".to_string());
        derived.source_type = Some("task".into());
        derived.source_id = Some(task.id.clone());
        derived.payload_json = Some(
            serde_json::json!({ "field": "status", "from": "todo", "to": "done" }).to_string(),
        );
        timeline::insert_event(&tx, &derived, &journey_ids)?;
    }

    tx.commit()?;
    Ok(())
}

/// Seed only when there is nothing to lose.
pub fn apply_if_empty(conn: &Connection, json: &str) -> AppResult<bool> {
    if !is_empty(conn)? {
        return Ok(false);
    }
    apply(conn, json)?;
    Ok(true)
}

#[cfg(all(test, feature = "local-tests"))]
mod tests {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/local-tests/db_seed.rs"
    ));
}
