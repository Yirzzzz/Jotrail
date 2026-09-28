//! SQLite access layer. Everything that touches SQL lives under this module;
//! commands and the frontend only ever see domain types.

pub mod event_images;
pub mod journeys;
pub mod maintenance;
pub mod migrations;
pub mod notes;
pub mod seed;
pub mod stage_sets;
pub mod subjects;
pub mod tasks;
pub mod timeline;

use std::collections::HashMap;
use std::path::Path;

use rusqlite::Connection;

use crate::domain::{JourneyRef, LinkTargetType};
use crate::error::AppResult;

/// Open (creating if needed) the database at `path` and bring the schema up to
/// date. A failure here is fatal and surfaced at startup.
pub fn open(path: &Path) -> AppResult<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(path)?;
    prepare(&conn)?;
    Ok(conn)
}

/// In-memory database for tests. Exercises the real migrations.
pub fn open_in_memory() -> AppResult<Connection> {
    let conn = Connection::open_in_memory()?;
    prepare(&conn)?;
    Ok(conn)
}

fn prepare(conn: &Connection) -> AppResult<()> {
    // `journal_mode` returns a row, so it must be queried rather than executed.
    // In-memory databases reject WAL, which is fine — ignore the result.
    let _ = conn.query_row("PRAGMA journal_mode = WAL", [], |row| {
        row.get::<_, String>(0)
    });
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA synchronous = NORMAL;
         PRAGMA busy_timeout = 5000;",
    )?;
    migrations::run(conn)?;
    Ok(())
}

/// Application-side ID. Prefixed so a stray ID in a log or a database row is
/// self-describing.
pub fn new_id(prefix: &str) -> String {
    format!("{prefix}_{}", uuid::Uuid::new_v4().simple())
}

/// Journey associations for one kind of linked content.
#[derive(Debug, Default, Clone)]
pub struct TargetLinks {
    pub journeys: Vec<JourneyRef>,
    pub pinned_in: Vec<String>,
}

/// Every journey link for `target_type`, grouped by target id.
///
/// This deliberately loads all links of a type in one query and groups in
/// memory rather than issuing a query per row: a personal notebook has at most
/// a few thousand links, and this keeps list endpoints free of N+1 queries
/// without dynamic `IN (...)` SQL.
pub fn links_by_target(
    conn: &Connection,
    target_type: LinkTargetType,
) -> AppResult<HashMap<String, TargetLinks>> {
    let mut stmt = conn.prepare(
        "SELECT l.target_id, j.id, j.title, j.icon, l.pinned
           FROM journey_links l
           JOIN journeys j ON j.id = l.journey_id
          WHERE l.target_type = ?1
          ORDER BY j.created_at ASC",
    )?;

    let mut grouped: HashMap<String, TargetLinks> = HashMap::new();
    let mut rows = stmt.query([target_type])?;
    while let Some(row) = rows.next()? {
        let target_id: String = row.get(0)?;
        let journey = JourneyRef {
            id: row.get(1)?,
            title: row.get(2)?,
            icon: row.get(3)?,
        };
        let pinned: bool = row.get(4)?;
        let entry = grouped.entry(target_id).or_default();
        if pinned {
            entry.pinned_in.push(journey.id.clone());
        }
        entry.journeys.push(journey);
    }
    Ok(grouped)
}

/// Journeys attached to each timeline event, grouped by event id.
pub fn journeys_by_event(conn: &Connection) -> AppResult<HashMap<String, Vec<JourneyRef>>> {
    let mut stmt = conn.prepare(
        "SELECT ej.event_id, j.id, j.title, j.icon
           FROM timeline_event_journeys ej
           JOIN journeys j ON j.id = ej.journey_id
          ORDER BY j.created_at ASC",
    )?;

    let mut grouped: HashMap<String, Vec<JourneyRef>> = HashMap::new();
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let event_id: String = row.get(0)?;
        grouped.entry(event_id).or_default().push(JourneyRef {
            id: row.get(1)?,
            title: row.get(2)?,
            icon: row.get(3)?,
        });
    }
    Ok(grouped)
}

#[cfg(all(test, feature = "local-tests"))]
mod tests {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/local-tests/db_mod.rs"
    ));
}
