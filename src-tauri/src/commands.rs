//! Tauri command surface. Each command is a thin adapter: validate/convert,
//! delegate to a repository, return domain types. No SQL, no business rules.

use std::sync::MutexGuard;

use rusqlite::Connection;
use tauri::State;

use crate::db::timeline::SortOrder;
use crate::db::{
    event_images, journeys, maintenance, notes, stage_sets, state_categories, subjects, tasks,
    timeline,
};
use crate::domain::{
    ConfirmPlannedEvent, EventImageVariant, Journey, JourneyPatch, JourneyStatus, NewJourney,
    NewNote, NewStageSet, NewStateCategory, NewSubject, NewTask, NewTimelineEvent, NotePatch,
    NoteWithLinks, RegisterTally, StageSetPatch, StageSetWithOptions, StateCategory,
    StateCategoryPatch, Subject, SubjectPatch, SubjectSummary, TaskStatus, TaskWithLinks,
    TimelineEntry, TimelineEventPatch, TimelineEventState, TimelineImportance,
};
use crate::error::{AppError, AppResult};
use crate::AppState;

/// Take the database lock. Held only for the duration of one command.
fn conn(state: &AppState) -> AppResult<MutexGuard<'_, Connection>> {
    state
        .db
        .lock()
        .map_err(|_| AppError::Invalid("the database lock was poisoned by an earlier crash".into()))
}

// ---------------------------------------------------------------------------
// Journeys
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn journeys_list(state: State<'_, AppState>) -> AppResult<Vec<Journey>> {
    let db = conn(&state)?;
    journeys::list(&db)
}

#[tauri::command]
pub fn journey_get(state: State<'_, AppState>, id: String) -> AppResult<Journey> {
    let db = conn(&state)?;
    journeys::get(&db, &id)
}

#[tauri::command]
pub fn journey_create(state: State<'_, AppState>, input: NewJourney) -> AppResult<Journey> {
    let db = conn(&state)?;
    journeys::create(&db, input)
}

#[tauri::command]
pub fn journey_update(
    state: State<'_, AppState>,
    id: String,
    patch: JourneyPatch,
) -> AppResult<Journey> {
    let db = conn(&state)?;
    journeys::update(&db, &id, patch)
}

#[tauri::command]
pub fn journey_set_status(
    state: State<'_, AppState>,
    id: String,
    status: JourneyStatus,
) -> AppResult<Journey> {
    let db = conn(&state)?;
    journeys::set_status(&db, &id, status)
}

/// Notes and tasks are kept; see `journeys::delete`.
#[tauri::command]
pub fn journey_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let db = conn(&state)?;
    journeys::delete(&db, &id)
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn notes_list(
    state: State<'_, AppState>,
    search: Option<String>,
    journey_id: Option<String>,
) -> AppResult<Vec<NoteWithLinks>> {
    let db = conn(&state)?;
    notes::list(&db, search.as_deref(), journey_id.as_deref())
}

#[tauri::command]
pub fn note_get(state: State<'_, AppState>, id: String) -> AppResult<NoteWithLinks> {
    let db = conn(&state)?;
    notes::get(&db, &id)
}

#[tauri::command]
pub fn note_create(state: State<'_, AppState>, input: NewNote) -> AppResult<NoteWithLinks> {
    let db = conn(&state)?;
    notes::create(&db, input)
}

#[tauri::command]
pub fn note_update(
    state: State<'_, AppState>,
    id: String,
    patch: NotePatch,
) -> AppResult<NoteWithLinks> {
    let db = conn(&state)?;
    notes::update(&db, &id, patch)
}

#[tauri::command]
pub fn note_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let db = conn(&state)?;
    notes::soft_delete(&db, &id)
}

#[tauri::command]
pub fn notes_deleted(state: State<'_, AppState>) -> AppResult<Vec<NoteWithLinks>> {
    let db = conn(&state)?;
    notes::list_deleted(&db)
}

#[tauri::command]
pub fn note_restore(state: State<'_, AppState>, id: String) -> AppResult<NoteWithLinks> {
    let db = conn(&state)?;
    notes::restore(&db, &id)
}

#[tauri::command]
pub fn timeline_revert_confirmed_event(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<TimelineEntry> {
    let db = conn(&state)?;
    timeline::revert_confirmed(&db, &id)
}

#[tauri::command]
pub fn note_link_journey(
    state: State<'_, AppState>,
    note_id: String,
    journey_id: String,
    occurred_at: Option<String>,
) -> AppResult<TimelineEntry> {
    let db = conn(&state)?;
    notes::link_to_journey(&db, &note_id, &journey_id, occurred_at.as_deref())
}

#[tauri::command]
pub fn note_unlink_journey(
    state: State<'_, AppState>,
    note_id: String,
    journey_id: String,
) -> AppResult<()> {
    let db = conn(&state)?;
    notes::unlink_from_journey(&db, &note_id, &journey_id)
}

#[tauri::command]
pub fn note_set_pinned(
    state: State<'_, AppState>,
    note_id: String,
    journey_id: String,
    pinned: bool,
) -> AppResult<()> {
    let db = conn(&state)?;
    notes::set_pinned(&db, &note_id, &journey_id, pinned)
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn tasks_list(
    state: State<'_, AppState>,
    journey_id: Option<String>,
) -> AppResult<Vec<TaskWithLinks>> {
    let db = conn(&state)?;
    tasks::list(&db, journey_id.as_deref())
}

#[tauri::command]
pub fn task_create(state: State<'_, AppState>, input: NewTask) -> AppResult<TaskWithLinks> {
    let db = conn(&state)?;
    tasks::create(&db, input)
}

#[tauri::command]
pub fn task_set_status(
    state: State<'_, AppState>,
    id: String,
    status: TaskStatus,
) -> AppResult<TaskWithLinks> {
    let db = conn(&state)?;
    tasks::set_status(&db, &id, status)
}

#[tauri::command]
pub fn task_link_journey(
    state: State<'_, AppState>,
    task_id: String,
    journey_id: String,
) -> AppResult<()> {
    let db = conn(&state)?;
    tasks::link_to_journey(&db, &task_id, &journey_id)
}

#[tauri::command]
pub fn task_unlink_journey(
    state: State<'_, AppState>,
    task_id: String,
    journey_id: String,
) -> AppResult<()> {
    let db = conn(&state)?;
    tasks::unlink_from_journey(&db, &task_id, &journey_id)
}

#[tauri::command]
pub fn task_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let db = conn(&state)?;
    tasks::delete(&db, &id)
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn timeline_list(
    state: State<'_, AppState>,
    journey_id: Option<String>,
    order: Option<SortOrder>,
) -> AppResult<Vec<TimelineEntry>> {
    let db = conn(&state)?;
    timeline::list(&db, journey_id.as_deref(), order.unwrap_or_default())
}

/// Correct an event that was already recorded.
///
/// Wording/date restrictions stay with `timeline::is_editable` (D-040). An
/// images-only patch may also attach pictures to explicit milestones (D-062).
/// Async dispatch keeps image decoding off the synchronous window IPC handler.
#[tauri::command]
pub async fn timeline_update_event(
    state: State<'_, AppState>,
    id: String,
    patch: TimelineEventPatch,
) -> AppResult<TimelineEntry> {
    let db = conn(&state)?;
    timeline::update(&db, &id, patch)
}

/// Mark a planned event as having happened.
///
/// The state flip and the real date are one write, so an entry can never be on
/// the record while still dated at the deadline it was aiming for.
#[tauri::command]
pub async fn timeline_confirm_event(
    state: State<'_, AppState>,
    id: String,
    input: ConfirmPlannedEvent,
) -> AppResult<TimelineEntry> {
    let db = conn(&state)?;
    timeline::confirm(&db, &id, input)
}

/// Abandon a planned event. Recorded history is never deletable this way.
#[tauri::command]
pub fn timeline_delete_planned_event(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let db = conn(&state)?;
    timeline::delete_planned(&db, &id)
}

/// Timeline events matching a search term.
///
/// Separate from `timeline_list` because the two have different contracts: that
/// one returns a Journey's whole history and must never be silently narrowed.
/// Matches title, summary, reflection, **stage**, and the name of the thing the
/// entry is about — so 拒稿 and TMM both find the papers they describe (D-047).
#[tauri::command]
pub fn timeline_search(
    state: State<'_, AppState>,
    search: String,
    journey_id: Option<String>,
    order: Option<SortOrder>,
) -> AppResult<Vec<TimelineEntry>> {
    let db = conn(&state)?;
    timeline::search(
        &db,
        &search,
        journey_id.as_deref(),
        order.unwrap_or(SortOrder::Newest),
    )
}

/// Tracked things whose name matches, across every Journey.
///
/// The most useful of the three search results: it opens a thing's whole history
/// rather than one moment in it.
#[tauri::command]
pub fn subject_search(
    state: State<'_, AppState>,
    search: String,
) -> AppResult<Vec<SubjectSummary>> {
    let db = conn(&state)?;
    subjects::search(&db, &search)
}

/// Record something that happened — including in the past, which is the whole
/// point of keeping `occurred_at` separate from `created_at`.
#[tauri::command]
pub async fn timeline_create_event(
    state: State<'_, AppState>,
    input: NewTimelineEvent,
) -> AppResult<TimelineEntry> {
    let db = conn(&state)?;

    create_timeline_event(&db, input)
}

/// Kept outside Tauri state so the complete save transaction is testable against
/// a temporary database, including failures after images have been inserted.
fn create_timeline_event(db: &Connection, input: NewTimelineEvent) -> AppResult<TimelineEntry> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(AppError::Invalid("an event needs a title".into()));
    }

    let occurred_at = crate::clock::to_utc_opt(input.occurred_at.as_deref())?
        .unwrap_or_else(crate::clock::now_utc);

    let mut event = timeline::draft(
        input
            .event_type
            .as_deref()
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .unwrap_or("event_recorded"),
        title,
        occurred_at,
        input.importance.unwrap_or(TimelineImportance::Normal),
    );
    event.summary = input
        .summary
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    event.reflection = input
        .reflection
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    /*
     * A commitment rather than a record.
     *
     * `planned_for` starts equal to `occurred_at`: while an event is planned its
     * position on the timeline *is* the date it is aimed at. `timeline::confirm`
     * is what later moves `occurred_at` to when it really happened and leaves
     * this holding the original target.
     */
    if input.planned {
        event.event_state = TimelineEventState::Planned;
        event.planned_for = Some(event.occurred_at.clone());
    }

    /*
     * Filing the event onto a tracked thing, when the user picked one.
     *
     * Checked against the event's own journeys: a register must not acquire an
     * event from an unrelated thread, or its counts would describe things the
     * user never put there. Validated here rather than in `insert_event`, which
     * is also used by derived paths that never carry a subject.
     */
    if let Some(subject_id) = input.subject_id.as_deref() {
        let subject = subjects::get(&db, subject_id)?;
        let journey_ids = input.journey_ids.clone().unwrap_or_default();
        if !journey_ids.contains(&subject.journey_id) {
            return Err(AppError::Invalid(
                "a tracked item can only take events from its own Journey".into(),
            ));
        }
        event.subject_id = Some(subject_id.to_string());
        event.stage = input
            .stage
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
    }

    /*
     * A thing named here rather than picked, when the register had nothing to
     * pick — a first submission to a venue that is not in the register yet.
     *
     * Validated now but created inside the transaction below, so a later failure
     * cannot leave a subject behind with no event about it. Refused outright when
     * `subject_id` is also set: the two say different things about what this event
     * is about, and guessing which one the caller meant is how a wrong register
     * row gets written.
     */
    let new_subject = match input.new_subject {
        Some(_) if input.subject_id.is_some() => {
            return Err(AppError::Invalid(
                "an event is about one thing: name a new one or pick an existing one, not both"
                    .into(),
            ));
        }
        Some(candidate) => {
            let title = candidate.title.trim();
            let kind = candidate.kind.trim();
            if title.is_empty() {
                return Err(AppError::Invalid("a tracked item needs a name".into()));
            }
            if kind.is_empty() {
                return Err(AppError::Invalid("a tracked item needs a kind".into()));
            }
            /*
             * The first Journey, because a subject belongs to exactly one and that
             * is the same Journey the guard above requires for a picked subject.
             * With none, there is nowhere to put it — a register is a Journey's.
             */
            let Some(journey_id) = input.journey_ids.as_ref().and_then(|ids| ids.first()) else {
                return Err(AppError::Invalid(
                    "a new tracked item needs a Journey to belong to".into(),
                ));
            };
            Some(NewSubject {
                journey_id: journey_id.clone(),
                kind: kind.to_string(),
                title: title.to_string(),
            })
        }
        None => None,
    };

    // A recorded transition becomes the event's payload, which is what lets the
    // journey read its tracked states back out of history later.
    if let Some(state) = input.state {
        /*
         * A transition is a fact: something *was* basic and *is now*
         * intermediate. A plan cannot carry one, because nothing has changed
         * yet — and if it did, the journey's tracked states would report a level
         * the user has not reached. Refused rather than silently dropped, since
         * quietly discarding half of what was submitted is worse than saying no.
         */
        if input.planned {
            return Err(AppError::Invalid(
                "a planned event cannot record a state change, because nothing has changed yet"
                    .into(),
            ));
        }

        let field = state.field.trim();
        let to = state.to.trim();
        if field.is_empty() || to.is_empty() {
            return Err(AppError::Invalid(
                "a state change needs a field and a new value".into(),
            ));
        }

        let normalised = crate::domain::StateChange {
            field: field.to_string(),
            from: state
                .from
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
            to: to.to_string(),
            subject: state
                .subject
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
        };

        event.event_type = "state_changed".to_string();
        event.payload_json = Some(serde_json::to_string(&normalised)?);
    }

    if input.images.is_some() && !timeline::can_edit_images(&event) {
        return Err(AppError::Invalid(
            "Images can only be attached to an explicit event".into(),
        ));
    }
    if input.classifications.is_some() && !timeline::can_edit_images(&event) {
        return Err(AppError::Invalid(
            "Classifications can only be attached to an explicit event".into(),
        ));
    }

    let journey_ids = input.journey_ids.unwrap_or_default();
    for journey_id in &journey_ids {
        if journeys::find(&db, journey_id)?.is_none() {
            return Err(AppError::NotFound(format!("journey `{journey_id}`")));
        }
    }

    let tx = db.unchecked_transaction()?;

    /*
     * The thing being tracked for the first time, created before the event that
     * is about it so the event can carry its id.
     *
     * `subjects::create` takes `&Connection` and opens no transaction of its own,
     * so it composes here — the same reason `link_within` and `create_within`
     * exist (D-038). Inside the transaction means a failure further down rolls
     * the new thing back too, rather than leaving a register row that no event
     * ever explains.
     */
    if let Some(candidate) = new_subject {
        let created = subjects::create(&tx, candidate)?;
        event.subject_id = Some(created.id);
        event.stage = input
            .stage
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
    }

    timeline::insert_event(&tx, &event, &journey_ids)?;
    if let Some(classifications) = input.classifications {
        state_categories::replace_within(&tx, &event.id, &classifications)?;
    }
    if let Some(images) = input.images {
        event_images::replace_within(&tx, &event.id, &images)?;
    }

    // Work the event revealed. Created in the same transaction so "the interview
    // showed me three gaps" is recorded as one act, and linked back to the event
    // so the timeline can render them inside it.
    for todo in input.tasks.unwrap_or_default() {
        let title = todo.title.trim();
        if title.is_empty() {
            continue;
        }
        /*
         * `create_within`, not `create`: we are already inside a transaction and
         * SQLite cannot nest them. Calling `create` here failed at runtime with
         * "cannot start a transaction within a transaction" — this path had never
         * been exercised, because no UI sent `tasks` until now.
         */
        let task_id = tasks::create_within(
            &tx,
            NewTask {
                title: title.to_string(),
                details_md: None,
                // Normalised by `tasks::create_within` via `to_utc_opt`.
                due_at: todo.due_at.clone(),
                // The first journey is filed here; the rest are linked below.
                journey_id: journey_ids.first().cloned(),
                origin_type: Some("event".into()),
                origin_id: Some(event.id.clone()),
            },
        )?;

        /*
         * An event can belong to several journeys, and work it revealed belongs
         * to all of them — a gap exposed by an interview that sits in both 秋招
         * and VLA 学习 is relevant to both. `NewTask` carries only one journey,
         * so the remainder are linked directly.
         */
        for journey_id in journey_ids.iter().skip(1) {
            tasks::link_within_tx(&tx, &task_id, journey_id)?;
        }
    }

    tx.commit()?;

    timeline::get(&db, &event.id)?
        .ok_or_else(|| AppError::NotFound(format!("timeline event `{}`", event.id)))
}

#[tauri::command]
pub async fn event_image_read(
    state: State<'_, AppState>,
    id: String,
    variant: EventImageVariant,
) -> AppResult<String> {
    let db = conn(&state)?;
    event_images::read(&db, &id, variant)
}

#[cfg(all(test, feature = "local-tests"))]
mod image_save_tests {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/local-tests/event_image_commands.rs"
    ));
}

// ---------------------------------------------------------------------------
// Subjects — the things a register lists
// ---------------------------------------------------------------------------

/// One register: the things of a kind in a Journey, each with its derived stage.
///
/// `kind` omitted returns the Journey's whole set, which is how a screen finds
/// out which registers exist before rendering any.
#[tauri::command]
pub fn subjects_list(
    state: State<'_, AppState>,
    journey_id: String,
    kind: Option<String>,
) -> AppResult<Vec<SubjectSummary>> {
    let db = conn(&state)?;
    subjects::list(&db, &journey_id, kind.as_deref())
}

/// The registers a Journey has, with a real count each.
#[tauri::command]
pub fn subject_kinds(
    state: State<'_, AppState>,
    journey_id: String,
) -> AppResult<Vec<(String, i64)>> {
    let db = conn(&state)?;
    subjects::kinds(&db, &journey_id)
}

/// Stages already used in this register, most recent first — the suggestions
/// that stand in for a vocabulary editor.
#[tauri::command]
pub fn subject_stages_used(
    state: State<'_, AppState>,
    journey_id: String,
    kind: String,
) -> AppResult<Vec<String>> {
    let db = conn(&state)?;
    subjects::stages_used(&db, &journey_id, &kind)
}

#[tauri::command]
pub fn subject_create(state: State<'_, AppState>, input: NewSubject) -> AppResult<Subject> {
    let db = conn(&state)?;
    subjects::create(&db, input)
}

/// Rename a tracked item, or move it to another register. Its events follow it,
/// which is the whole reason it is a row rather than a string in a title.
#[tauri::command]
pub fn subject_update(
    state: State<'_, AppState>,
    id: String,
    patch: SubjectPatch,
) -> AppResult<Subject> {
    let db = conn(&state)?;
    subjects::update(&db, &id, patch)
}

/// Stop tracking something. Its events stay on the timeline — they happened.
#[tauri::command]
pub fn subject_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let db = conn(&state)?;
    subjects::delete(&db, &id)
}

/// What the app would make of this Journey's untagged event titles.
///
/// Read-only on purpose. The grouping is good where a name repeats — `TMM 投稿`
/// plus `TMM 一轮大修返稿` yields `TMM` — and silent where it does not, but it is
/// still a guess about the user's own writing, so the UI shows it and the user
/// confirms rather than a migration rewriting their notebook.
#[tauri::command]
pub fn subject_propose(
    state: State<'_, AppState>,
    journey_id: String,
) -> AppResult<Vec<subjects::ProposedSubject>> {
    let db = conn(&state)?;
    subjects::propose_from_titles(&db, &journey_id)
}

// ---------------------------------------------------------------------------
// Stage sets — a register's named vocabulary of labels and colours
// ---------------------------------------------------------------------------

/// Every stage set, with its stages and how many registers use each.
#[tauri::command]
pub fn stage_sets_list(state: State<'_, AppState>) -> AppResult<Vec<StageSetWithOptions>> {
    let db = conn(&state)?;
    stage_sets::list(&db)
}

#[tauri::command]
pub fn state_categories_list(
    state: State<'_, AppState>,
    journey_id: String,
) -> AppResult<Vec<StateCategory>> {
    let db = conn(&state)?;
    state_categories::list(&db, &journey_id)
}

#[tauri::command]
pub fn state_category_create(
    state: State<'_, AppState>,
    input: NewStateCategory,
) -> AppResult<StateCategory> {
    let db = conn(&state)?;
    state_categories::create(&db, input)
}

#[tauri::command]
pub fn state_category_update(
    state: State<'_, AppState>,
    id: String,
    patch: StateCategoryPatch,
) -> AppResult<StateCategory> {
    let db = conn(&state)?;
    state_categories::update(&db, &id, patch)
}

/// Create a set and its stages in one call. A set with no stages is refused —
/// the vocabulary is the set.
#[tauri::command]
pub fn stage_set_create(
    state: State<'_, AppState>,
    input: NewStageSet,
) -> AppResult<StageSetWithOptions> {
    let db = conn(&state)?;
    stage_sets::create(&db, input)
}

/// Rename a set, and/or replace its stage list.
///
/// Renaming a stage cascades onto every event that recorded the old label, in the
/// same transaction — otherwise things recorded at 一面 would fall out of a set
/// that now calls it 第一轮.
#[tauri::command]
pub fn stage_set_update(
    state: State<'_, AppState>,
    id: String,
    patch: StageSetPatch,
) -> AppResult<StageSetWithOptions> {
    let db = conn(&state)?;
    stage_sets::update(&db, &id, patch)
}

/// Delete a set. Recorded stages survive as plain text: history is not deleted
/// because a description of it was.
#[tauri::command]
pub fn stage_set_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let db = conn(&state)?;
    stage_sets::delete(&db, &id)
}

/// Describe a register with a set, replacing whatever it used before.
#[tauri::command]
pub fn stage_set_attach(
    state: State<'_, AppState>,
    journey_id: String,
    kind: String,
    set_id: String,
) -> AppResult<()> {
    let db = conn(&state)?;
    stage_sets::attach(&db, &journey_id, &kind, &set_id)
}

/// Stop describing a register with a set. Its recorded stages are left alone.
#[tauri::command]
pub fn stage_set_detach(
    state: State<'_, AppState>,
    journey_id: String,
    kind: String,
) -> AppResult<()> {
    let db = conn(&state)?;
    stage_sets::detach(&db, &journey_id, &kind)
}

/// The set describing one register, if it has one.
#[tauri::command]
pub fn stage_set_for_register(
    state: State<'_, AppState>,
    journey_id: String,
    kind: String,
) -> AppResult<Option<StageSetWithOptions>> {
    let db = conn(&state)?;
    stage_sets::for_register(&db, &journey_id, &kind)
}

/// How many things sit at each stage, per register — the Overview's cross-section.
///
/// Counts only. A register has no completion, so there is no percentage to
/// report (D-007).
#[tauri::command]
pub fn register_tallies(
    state: State<'_, AppState>,
    journey_id: String,
) -> AppResult<Vec<RegisterTally>> {
    let db = conn(&state)?;
    stage_sets::tallies(&db, &journey_id)
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub database_path: String,
    pub schema_version: i64,
    pub seeded_demo_data: bool,
}

/// Surfaced in Settings so the user can always find their own data on disk.
#[tauri::command]
pub fn app_info(state: State<'_, AppState>) -> AppResult<AppInfo> {
    let db = conn(&state)?;
    Ok(AppInfo {
        database_path: state.database_path.to_string_lossy().to_string(),
        schema_version: crate::db::migrations::current_version(&db)?,
        seeded_demo_data: state.seeded_demo_data,
    })
}

fn data_dir(state: &AppState) -> AppResult<&std::path::Path> {
    state
        .database_path
        .parent()
        .ok_or_else(|| AppError::Invalid("The data directory is unavailable".into()))
}

#[tauri::command]
pub fn backups_list(state: State<'_, AppState>) -> AppResult<Vec<maintenance::BackupInfo>> {
    maintenance::list_backups(data_dir(&state)?)
}

#[tauri::command]
pub fn backup_create(state: State<'_, AppState>) -> AppResult<maintenance::BackupInfo> {
    let db = conn(&state)?;
    maintenance::create_backup(&db, data_dir(&state)?)
}

#[tauri::command]
pub fn backup_restore(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<maintenance::BackupInfo> {
    let mut db = conn(&state)?;
    maintenance::restore_backup(&mut db, data_dir(&state)?, &id)
}

#[tauri::command]
pub fn notebook_export(state: State<'_, AppState>) -> AppResult<maintenance::ExportInfo> {
    let db = conn(&state)?;
    maintenance::export_notebook(&db, data_dir(&state)?)
}

#[tauri::command]
pub fn data_folder_open(state: State<'_, AppState>, kind: String) -> AppResult<()> {
    let path = maintenance::folder(data_dir(&state)?, &kind)?;
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut command = std::process::Command::new("explorer");
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let mut command = std::process::Command::new("xdg-open");
    if !command.arg(path).status()?.success() {
        return Err(AppError::Invalid("Could not open the data folder".into()));
    }
    Ok(())
}
