//! Task repository. Tasks stay deliberately small — the point is that non-note
//! activity can enrich a journey without the app becoming a task manager.

use rusqlite::{params, Connection, Row};

use crate::clock::{now_utc, to_utc_opt};
use crate::db::{links_by_target, new_id, timeline};
use crate::domain::{
    LinkTargetType, NewTask, Task, TaskStatus, TaskWithLinks, TimelineImportance,
};
use crate::error::{AppError, AppResult};

fn map_task(row: &Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get("id")?,
        title: row.get("title")?,
        details_md: row.get("details_md")?,
        status: row.get("status")?,
        due_at: row.get("due_at")?,
        completed_at: row.get("completed_at")?,
        origin_type: row.get("origin_type")?,
        origin_id: row.get("origin_id")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn hydrate(conn: &Connection, tasks: Vec<Task>) -> AppResult<Vec<TaskWithLinks>> {
    let mut links = links_by_target(conn, LinkTargetType::Task)?;
    Ok(tasks
        .into_iter()
        .map(|task| {
            let link = links.remove(&task.id).unwrap_or_default();
            TaskWithLinks {
                task,
                journeys: link.journeys,
            }
        })
        .collect())
}

/// Open tasks first (soonest due first), then finished ones most-recent first.
pub fn list(conn: &Connection, journey_id: Option<&str>) -> AppResult<Vec<TaskWithLinks>> {
    let mut stmt = conn.prepare(
        "SELECT t.* FROM tasks t
          WHERE ?1 IS NULL
             OR EXISTS (SELECT 1 FROM journey_links l
                         WHERE l.target_type = 'task'
                           AND l.target_id = t.id
                           AND l.journey_id = ?1)
          ORDER BY CASE WHEN t.status IN ('done', 'cancelled') THEN 1 ELSE 0 END,
                   CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,
                   t.due_at ASC,
                   t.completed_at DESC,
                   t.created_at ASC",
    )?;
    let tasks = stmt
        .query_map(params![journey_id], map_task)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    hydrate(conn, tasks)
}

/// Tasks produced by each event, grouped by the event id that spawned them.
///
/// Loaded in one query and grouped in memory rather than per-event, so the
/// timeline stays free of N+1 queries.
pub fn by_origin(
    conn: &Connection,
    origin_type: &str,
) -> AppResult<std::collections::HashMap<String, Vec<TaskWithLinks>>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM tasks
          WHERE origin_type = ?1 AND origin_id IS NOT NULL
          ORDER BY created_at ASC",
    )?;
    let tasks = stmt
        .query_map(params![origin_type], map_task)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut grouped: std::collections::HashMap<String, Vec<TaskWithLinks>> =
        std::collections::HashMap::new();
    for task in hydrate(conn, tasks)? {
        let Some(origin) = task.task.origin_id.clone() else {
            continue;
        };
        grouped.entry(origin).or_default().push(task);
    }
    Ok(grouped)
}

pub fn find(conn: &Connection, id: &str) -> AppResult<Option<TaskWithLinks>> {
    let task = conn
        .query_row("SELECT * FROM tasks WHERE id = ?1", params![id], map_task)
        .ok();
    let Some(task) = task else {
        return Ok(None);
    };
    Ok(hydrate(conn, vec![task])?.into_iter().next())
}

pub fn get(conn: &Connection, id: &str) -> AppResult<TaskWithLinks> {
    find(conn, id)?.ok_or_else(|| AppError::NotFound(format!("task `{id}`")))
}

/// Create a task.
///
/// Adding a task **to a journey** is recorded, because deciding to do something
/// is part of how a journey develops: the gap between "8/25 decided to learn
/// ROS2" and "8/28 learned it" is the story. An unscoped task — a passing
/// errand — produces no event at all.
///
/// This is a deliberate widening of `ARCHITECTURE.md` §10, which listed only
/// completion. See DECISIONS.md D-023.
pub fn create(conn: &Connection, input: NewTask) -> AppResult<TaskWithLinks> {
    let tx = conn.unchecked_transaction()?;
    let id = create_within(&tx, input)?;
    tx.commit()?;
    get(conn, &id)
}

/// `create`'s body, without the transaction — for callers that already have one.
///
/// Same split as `link_within` below, and for the same reason: SQLite has no
/// nested transactions, so a caller writing an event *and* the tasks it revealed
/// in one atomic act cannot go through `create`. Doing so fails at runtime with
/// "cannot start a transaction within a transaction".
///
/// Returns the new task's id rather than the task itself: reading it back with
/// `get` inside the caller's transaction would see its own uncommitted writes,
/// which is correct but wasteful when the caller usually re-reads the whole
/// aggregate afterwards anyway.
pub fn create_within(conn: &Connection, input: NewTask) -> AppResult<String> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(AppError::Invalid("a task needs a title".into()));
    }

    let now = now_utc();
    let task = Task {
        id: new_id("task"),
        title: title.to_string(),
        details_md: input
            .details_md
            .map(|d| d.trim().to_string())
            .filter(|d| !d.is_empty()),
        status: TaskStatus::Todo,
        due_at: to_utc_opt(input.due_at.as_deref())?,
        completed_at: None,
        origin_type: input
            .origin_type
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty()),
        origin_id: input
            .origin_id
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty()),
        created_at: now.clone(),
        updated_at: now,
    };

    conn.execute(
        "INSERT INTO tasks
           (id, title, details_md, status, due_at, completed_at,
            origin_type, origin_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            task.id,
            task.title,
            task.details_md,
            task.status,
            task.due_at,
            task.completed_at,
            task.origin_type,
            task.origin_id,
            task.created_at,
            task.updated_at,
        ],
    )?;

    // A task created inside a journey inherits that journey, and the decision is
    // recorded on its timeline.
    if let Some(journey_id) = input.journey_id.as_deref() {
        if crate::db::journeys::find(conn, journey_id)?.is_none() {
            return Err(AppError::NotFound(format!("journey `{journey_id}`")));
        }
        link_within(conn, &task, journey_id)?;
    }

    Ok(task.id)
}

/// Link an existing task to one more journey, inside a caller's transaction.
///
/// Exists for the event path: an event can span several journeys, and work it
/// revealed belongs to all of them, but `NewTask` carries only one. Takes an id
/// rather than a `&Task` because the caller has just created it and holds no
/// struct — and reads it back through the same transaction, so it sees the
/// uncommitted row.
pub fn link_within_tx(conn: &Connection, task_id: &str, journey_id: &str) -> AppResult<()> {
    if crate::db::journeys::find(conn, journey_id)?.is_none() {
        return Err(AppError::NotFound(format!("journey `{journey_id}`")));
    }
    let task = get(conn, task_id)?.task;
    link_within(conn, &task, journey_id)
}

/// Link a task to a journey and record that it was added. Shared by `create` and
/// `link_to_journey`, and takes `&Connection` so both can pass a transaction.
///
/// A task that came *from* something already on the timeline — an event that
/// revealed it — records no "added" entry of its own: the event says so, and
/// repeating it would be noise directly beside the thing it repeats.
fn link_within(conn: &Connection, task: &Task, journey_id: &str) -> AppResult<()> {
    let inserted = conn.execute(
        "INSERT OR IGNORE INTO journey_links
           (id, journey_id, target_type, target_id, pinned, created_at)
         VALUES (?1, ?2, 'task', ?3, 0, ?4)",
        params![new_id("lnk"), journey_id, task.id, now_utc()],
    )?;

    // Already linked: nothing new happened, so nothing to record.
    if inserted == 0 {
        return Ok(());
    }

    if task.origin_type.is_none() {
        // A task linked after the fact is dated when it was created, not now, so
        // it lands where the decision actually belongs on the timeline.
        let mut event = timeline::draft(
            "task_added",
            task.title.clone(),
            task.created_at.clone(),
            TimelineImportance::Compact,
        );
        event.summary = Some("Added".to_string());
        event.source_type = Some("task".into());
        event.source_id = Some(task.id.clone());
        timeline::insert_event(conn, &event, &[journey_id.to_string()])?;
    }

    // A task that is already finished when it joins a journey would otherwise
    // show only "Added"; record the completion too so the row is not misleading.
    if task.status == TaskStatus::Done {
        if let Some(completed_at) = task.completed_at.as_deref() {
            let mut done = timeline::draft(
                "task_completed",
                task.title.clone(),
                completed_at.to_string(),
                TimelineImportance::Compact,
            );
            done.summary = Some("Completed".to_string());
            done.source_type = Some("task".into());
            done.source_id = Some(task.id.clone());
            done.payload_json = Some(
                serde_json::json!({ "field": "status", "from": "todo", "to": "done" }).to_string(),
            );
            timeline::insert_event(conn, &done, &[journey_id.to_string()])?;
        }
    }

    Ok(())
}

/// Move a task through its lifecycle, appending history for the transitions
/// that carry meaning. State and history are written together.
pub fn set_status(conn: &Connection, id: &str, status: TaskStatus) -> AppResult<TaskWithLinks> {
    let existing = get(conn, id)?;
    if existing.task.status == status {
        return Ok(existing);
    }

    let tx = conn.unchecked_transaction()?;
    let now = now_utc();
    let completed_at = match status {
        TaskStatus::Done => Some(now.clone()),
        _ => None,
    };

    tx.execute(
        "UPDATE tasks SET status = ?2, completed_at = ?3, updated_at = ?4 WHERE id = ?1",
        params![id, status, completed_at, now],
    )?;

    // Completing and reopening are worth remembering; todo↔doing is not.
    let logged = match (existing.task.status, status) {
        (_, TaskStatus::Done) => Some(("task_completed", "Completed")),
        (TaskStatus::Done, _) => Some(("task_reopened", "Reopened")),
        _ => None,
    };

    if let Some((event_type, label)) = logged {
        let journey_ids = timeline::journey_ids_for_target(&tx, "task", id)?;
        let mut event = timeline::draft(
            event_type,
            existing.task.title.clone(),
            now.clone(),
            TimelineImportance::Compact,
        );
        event.summary = Some(label.to_string());
        event.source_type = Some("task".into());
        event.source_id = Some(id.to_string());
        event.payload_json = Some(
            serde_json::json!({
                "field": "status",
                "from": existing.task.status.as_str(),
                "to": status.as_str(),
            })
            .to_string(),
        );
        timeline::insert_event(&tx, &event, &journey_ids)?;
    }

    tx.commit()?;
    get(conn, id)
}

/// Attach an existing task to a journey. A task started from Today can be filed
/// later, the same way a note can (D-008).
pub fn link_to_journey(conn: &Connection, task_id: &str, journey_id: &str) -> AppResult<()> {
    let task = get(conn, task_id)?.task;
    if crate::db::journeys::find(conn, journey_id)?.is_none() {
        return Err(AppError::NotFound(format!("journey `{journey_id}`")));
    }

    let tx = conn.unchecked_transaction()?;
    link_within(&tx, &task, journey_id)?;
    tx.commit()?;
    Ok(())
}

pub fn unlink_from_journey(conn: &Connection, task_id: &str, journey_id: &str) -> AppResult<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "DELETE FROM journey_links
          WHERE target_type = 'task' AND target_id = ?1 AND journey_id = ?2",
        params![task_id, journey_id],
    )?;
    timeline::detach_source_from_journey(&tx, "task", task_id, journey_id)?;
    tx.commit()?;
    Ok(())
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    let affected = conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("task `{id}`")));
    }
    // Journey links are keyed by target id, not by a foreign key, so clear them
    // explicitly. Completion events stay: they describe something that happened.
    conn.execute(
        "DELETE FROM journey_links WHERE target_type = 'task' AND target_id = ?1",
        params![id],
    )?;
    Ok(())
}

#[cfg(all(test, feature = "local-tests"))]
mod tests {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/local-tests/db_tasks.rs"
    ));
}
