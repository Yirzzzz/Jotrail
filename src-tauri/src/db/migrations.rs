//! Forward-only migration runner. Schema changes are new files here, never
//! edits to an already-applied migration.

use rusqlite::{params, Connection};

use crate::clock::now_utc;
use crate::error::{AppError, AppResult};

struct Migration {
    version: i64,
    name: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "init",
        sql: include_str!("../../migrations/0001_init.sql"),
    },
    Migration {
        version: 2,
        name: "event_sequence",
        sql: include_str!("../../migrations/0002_event_sequence.sql"),
    },
    Migration {
        version: 3,
        name: "task_origin",
        sql: include_str!("../../migrations/0003_task_origin.sql"),
    },
    // Data, not schema: a one-time sweep of rows the pre-fix code wrote.
    Migration {
        version: 4,
        name: "prune_orphan_note_events",
        sql: include_str!("../../migrations/0004_prune_orphan_note_events.sql"),
    },
    Migration {
        version: 5,
        name: "planned_events",
        sql: include_str!("../../migrations/0005_planned_events.sql"),
    },
    Migration {
        version: 6,
        name: "subjects",
        sql: include_str!("../../migrations/0006_subjects.sql"),
    },
    Migration {
        version: 7,
        name: "stage_sets",
        sql: include_str!("../../migrations/0007_stage_sets.sql"),
    },
    Migration {
        version: 8,
        name: "event_images",
        sql: include_str!("../../migrations/0008_event_images.sql"),
    },
    Migration {
        version: 9,
        name: "state_categories",
        sql: include_str!("../../migrations/0009_state_categories.sql"),
    },
];

pub fn run(conn: &Connection) -> AppResult<()> {
    run_until(conn, MIGRATIONS.last().expect("migrations exist").version)
}

/// Build an exact historical schema for strict backup validation. Never rolls
/// an existing database back; callers use a fresh isolated connection.
pub(super) fn run_until(conn: &Connection, target_version: i64) -> AppResult<()> {
    if !MIGRATIONS
        .iter()
        .any(|migration| migration.version == target_version)
    {
        return Err(AppError::Invalid("unknown migration target".into()));
    }
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
           version INTEGER PRIMARY KEY,
           name TEXT NOT NULL,
           applied_at TEXT NOT NULL
         );",
    )?;

    if current_version(conn)? > target_version {
        return Err(AppError::Invalid(
            "cannot migrate a database backwards".into(),
        ));
    }
    for migration in MIGRATIONS
        .iter()
        .filter(|migration| migration.version <= target_version)
    {
        let already_applied: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?1)",
            params![migration.version],
            |row| row.get(0),
        )?;
        if already_applied {
            continue;
        }

        // Each migration is all-or-nothing so a partial schema can never be
        // recorded as applied.
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(migration.sql)?;
        tx.execute(
            "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
            params![migration.version, migration.name, now_utc()],
        )?;
        tx.commit()?;
    }

    Ok(())
}

/// Highest applied migration version, or 0 on a fresh database.
pub fn current_version(conn: &Connection) -> AppResult<i64> {
    let version: Option<i64> =
        conn.query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })?;
    Ok(version.unwrap_or(0))
}

#[cfg(all(test, feature = "local-tests"))]
mod tests {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/local-tests/db_migrations.rs"
    ));
}
