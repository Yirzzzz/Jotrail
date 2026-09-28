//! Journey Notes — local-first desktop notebook.
//!
//! Layering: `commands` (IPC surface) → `db` (repositories, all SQL) →
//! `domain` (types shared with the frontend). Nothing above `db` writes SQL and
//! nothing below it knows about Tauri.

pub mod clock;
pub mod commands;
pub mod db;
pub mod domain;
pub mod error;

use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::Manager;

use crate::error::AppResult;

/// Everything the commands need. The connection is behind a mutex because
/// SQLite work here is short and local; there is no pool to manage.
pub struct AppState {
    pub db: Mutex<Connection>,
    pub database_path: PathBuf,
    pub seeded_demo_data: bool,
}

const DATABASE_FILE: &str = "journey.sqlite3";

/// Whether the user asked for no demo data. Anything other than `0`/`false`/
/// empty counts as opting out, so `=1`, `=true` and `=yes` all work.
fn seed_opted_out() -> bool {
    match std::env::var("JOURNEY_NOTES_NO_SEED") {
        Ok(value) => !matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "" | "0" | "false"
        ),
        Err(_) => false,
    }
}

fn init_state(data_dir: PathBuf) -> AppResult<AppState> {
    let database_path = data_dir.join(DATABASE_FILE);
    let conn = db::open(&database_path)?;

    // Demo data exists to make the first launch legible during development. A
    // release build always starts empty, and even in development an existing
    // notebook is never touched.
    //
    // `JOURNEY_NOTES_NO_SEED=1` opts out, for starting a real notebook from a
    // development build rather than having the fixture appear in it.
    let seed_wanted = cfg!(debug_assertions) && !seed_opted_out();
    let seeded_demo_data = if seed_wanted {
        db::seed::apply_if_empty(&conn, db::seed::DEMO_SEED)?
    } else {
        false
    };

    Ok(AppState {
        db: Mutex::new(conn),
        database_path,
        seeded_demo_data,
    })
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            // A database that cannot be opened or migrated is fatal and worth
            // saying out loud rather than limping along with no persistence.
            let state = init_state(data_dir)
                .map_err(|err| format!("Journey Notes could not open its local database: {err}"))?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::journeys_list,
            commands::journey_get,
            commands::journey_create,
            commands::journey_update,
            commands::journey_set_status,
            commands::journey_delete,
            commands::notes_list,
            commands::note_get,
            commands::note_create,
            commands::note_update,
            commands::note_delete,
            commands::notes_deleted,
            commands::note_restore,
            commands::note_link_journey,
            commands::note_unlink_journey,
            commands::note_set_pinned,
            commands::tasks_list,
            commands::task_create,
            commands::task_set_status,
            commands::task_link_journey,
            commands::task_unlink_journey,
            commands::task_delete,
            commands::timeline_list,
            commands::timeline_create_event,
            commands::timeline_update_event,
            commands::event_image_read,
            commands::timeline_confirm_event,
            commands::timeline_delete_planned_event,
            commands::timeline_revert_confirmed_event,
            commands::timeline_search,
            commands::subject_search,
            commands::subjects_list,
            commands::subject_kinds,
            commands::subject_stages_used,
            commands::subject_create,
            commands::subject_update,
            commands::subject_delete,
            commands::subject_propose,
            commands::stage_sets_list,
            commands::state_categories_list,
            commands::state_category_create,
            commands::state_category_update,
            commands::stage_set_create,
            commands::stage_set_update,
            commands::stage_set_delete,
            commands::stage_set_attach,
            commands::stage_set_detach,
            commands::stage_set_for_register,
            commands::register_tallies,
            commands::app_info,
            commands::backups_list,
            commands::backup_create,
            commands::backup_restore,
            commands::notebook_export,
            commands::data_folder_open,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start Journey Notes");
}

#[cfg(all(test, feature = "local-tests"))]
mod tests {
    include!(concat!(env!("CARGO_MANIFEST_DIR"), "/local-tests/lib.rs"));
}
