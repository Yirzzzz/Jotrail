//! Timeline event history. Events are persisted records, not a live sort of
//! current state — that is what preserves the development story when an object
//! later changes.

use std::collections::HashMap;

use rusqlite::{params, Connection, Row};
use serde::Deserialize;

use crate::clock::{now_utc, to_utc};
use crate::db::{event_images, journeys_by_event, new_id};
use crate::domain::{
    ConfirmPlannedEvent, TimelineEntry, TimelineEvent, TimelineEventPatch, TimelineEventState,
    TimelineImportance,
};
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SortOrder {
    /// Matches the primary design reference: the journey reads top-to-bottom as
    /// a story.
    #[default]
    Oldest,
    Newest,
}

fn map_event(row: &Row<'_>) -> rusqlite::Result<TimelineEvent> {
    Ok(TimelineEvent {
        id: row.get("id")?,
        event_type: row.get("event_type")?,
        title: row.get("title")?,
        summary: row.get("summary")?,
        reflection: row.get("reflection")?,
        occurred_at: row.get("occurred_at")?,
        created_at: row.get("created_at")?,
        source_type: row.get("source_type")?,
        source_id: row.get("source_id")?,
        importance: row.get("importance")?,
        payload_json: row.get("payload_json")?,
        event_state: row.get("event_state")?,
        planned_for: row.get("planned_for")?,
        subject_id: row.get("subject_id")?,
        stage: row.get("stage")?,
    })
}

/// Insert one event and its journey links. Takes `&Connection` so callers can
/// pass an open transaction and keep state + history atomic.
pub fn insert_event(
    conn: &Connection,
    event: &TimelineEvent,
    journey_ids: &[String],
) -> AppResult<()> {
    // `seq` breaks ties between events sharing a millisecond, so the timeline
    // reads in the order things actually entered the notebook. See migration
    // 0002.
    conn.execute(
        "INSERT INTO timeline_events
           (id, event_type, title, summary, reflection, occurred_at, created_at,
            source_type, source_id, importance, payload_json, event_state, planned_for,
            subject_id, stage, seq)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
                 ?12, ?13, ?14, ?15,
                 (SELECT COALESCE(MAX(seq), 0) + 1 FROM timeline_events))",
        params![
            event.id,
            event.event_type,
            event.title,
            event.summary,
            event.reflection,
            event.occurred_at,
            event.created_at,
            event.source_type,
            event.source_id,
            event.importance,
            event.payload_json,
            event.event_state,
            event.planned_for,
            event.subject_id,
            event.stage,
        ],
    )?;

    for journey_id in journey_ids {
        conn.execute(
            "INSERT OR IGNORE INTO timeline_event_journeys (event_id, journey_id)
             VALUES (?1, ?2)",
            params![event.id, journey_id],
        )?;
    }
    Ok(())
}

/// Build an event record with `created_at` stamped now. `occurred_at` stays
/// caller-controlled so historical entries land at the right point.
pub fn draft(
    event_type: &str,
    title: impl Into<String>,
    occurred_at: impl Into<String>,
    importance: TimelineImportance,
) -> TimelineEvent {
    TimelineEvent {
        id: new_id("evt"),
        event_type: event_type.to_string(),
        title: title.into(),
        summary: None,
        reflection: None,
        occurred_at: occurred_at.into(),
        created_at: now_utc(),
        source_type: None,
        source_id: None,
        importance,
        payload_json: None,
        // Everything the app derives — a logged note, a completed task, a status
        // change — is by definition something that happened. Only the record
        // dialog opts into `Planned`.
        event_state: TimelineEventState::Recorded,
        planned_for: None,
        // Filed onto a tracked thing only when the user says so.
        subject_id: None,
        stage: None,
    }
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Option<TimelineEntry>> {
    let event = conn
        .query_row(
            "SELECT * FROM timeline_events WHERE id = ?1",
            params![id],
            map_event,
        )
        .ok();

    let Some(event) = event else {
        return Ok(None);
    };
    let journeys = journeys_by_event(conn)?
        .remove(&event.id)
        .unwrap_or_default();
    let tasks = crate::db::tasks::by_origin(conn, "event")?
        .remove(&event.id)
        .unwrap_or_default();
    // One event, so a targeted lookup rather than the whole-table map `list` uses.
    let stage_tone = tone_for(&stage_tones(conn)?, &event);
    let images = event_images::for_event(conn, &event.id)?;
    Ok(Some(TimelineEntry {
        event,
        journeys,
        tasks,
        stage_tone,
        images,
    }))
}

/// All events, or only those linked to `journey_id` when given.
///
/// The established non-search list path. Kept separate from `search` rather than
/// adding an optional parameter here: it has dozens of callers whose contract is
/// "the complete timeline", and a search term must never accidentally turn one of
/// those into a filtered history.
pub fn list(
    conn: &Connection,
    journey_id: Option<&str>,
    order: SortOrder,
) -> AppResult<Vec<TimelineEntry>> {
    list_matching(conn, journey_id, order, None)
}

/// Timeline events matching `search`, optionally scoped to one Journey.
///
/// **What `search` matches**, and why each field is in the list:
///
/// - `title`, `summary`, `reflection` — the words the user wrote.
/// - `stage` — the state a thing reached. Once D-046 moved state words out of
///   titles and into this column, a search that ignored it could not find 拒稿 at
///   all. It also generalises: a 秋招 register makes 二面 searchable for free.
/// - **the subject's title** — searching `TMM` finds every entry about that paper
///   even if no entry is titled `TMM`. The register groups them; search should
///   agree with the register.
///
/// `LIKE` rather than FTS5, deliberately: at personal scale (tens of events) the
/// scan costs nothing, and FTS5 would be solving a problem this notebook does not
/// have yet. The cost is ASCII-only case-insensitivity, which is documented.
pub fn search(
    conn: &Connection,
    search: &str,
    journey_id: Option<&str>,
    order: SortOrder,
) -> AppResult<Vec<TimelineEntry>> {
    list_matching(conn, journey_id, order, Some(search))
}

/// Shared SQL path for the complete and searched lists.
fn list_matching(
    conn: &Connection,
    journey_id: Option<&str>,
    order: SortOrder,
    search: Option<&str>,
) -> AppResult<Vec<TimelineEntry>> {
    // Direction comes from a closed enum, never from user input.
    let direction = match order {
        SortOrder::Oldest => "ASC",
        SortOrder::Newest => "DESC",
    };
    // Blank or whitespace-only is "no filter", not "match nothing".
    let needle = search
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    // `occurred_at` leads; `seq` (insertion order) breaks ties deterministically.
    let sql = format!(
        "SELECT e.* FROM timeline_events e
          WHERE (?1 IS NULL
                 OR EXISTS (SELECT 1 FROM timeline_event_journeys ej
                             WHERE ej.event_id = e.id AND ej.journey_id = ?1))
            AND (?2 IS NULL
                 OR e.title LIKE '%' || ?2 || '%'
                 OR e.summary LIKE '%' || ?2 || '%'
                 OR e.reflection LIKE '%' || ?2 || '%'
                 OR e.stage LIKE '%' || ?2 || '%'
                 OR EXISTS (SELECT 1 FROM subjects s
                             WHERE s.id = e.subject_id
                               AND s.title LIKE '%' || ?2 || '%'))
          ORDER BY e.occurred_at {direction}, e.seq {direction}"
    );

    let mut stmt = conn.prepare(&sql)?;
    let events = stmt
        .query_map(params![journey_id, needle], map_event)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut by_event = journeys_by_event(conn)?;
    // Work an event produced, rendered inside its entry.
    let mut spawned = crate::db::tasks::by_origin(conn, "event")?;
    // The colour each recorded stage carries, from the set describing its
    // register. One lookup for the whole list rather than a join per row.
    let tones = stage_tones(conn)?;
    let mut images_by_event = event_images::by_event(conn)?;

    Ok(events
        .into_iter()
        .map(|event| {
            let journeys = by_event.remove(&event.id).unwrap_or_default();
            let tasks = spawned.remove(&event.id).unwrap_or_default();
            let stage_tone = tone_for(&tones, &event);
            let images = images_by_event.remove(&event.id).unwrap_or_default();
            TimelineEntry {
                event,
                journeys,
                tasks,
                stage_tone,
                images,
            }
        })
        .collect())
}

/// `(subject_id, stage) -> tone`, for every stage a set names.
///
/// Keyed by subject rather than by register because that is what an event has:
/// resolving the register would mean loading the subject per row. The same stage
/// word can carry different colours in two registers, which is why the subject
/// has to be part of the key.
fn stage_tones(conn: &Connection) -> AppResult<HashMap<(String, String), String>> {
    let mut stmt = conn.prepare(
        "SELECT s.id AS subject_id, o.label, o.tone
           FROM subjects s
           JOIN register_stage_sets r
             ON r.journey_id = s.journey_id AND r.kind = s.kind
           JOIN stage_options o ON o.set_id = r.set_id",
    )?;
    let mut tones = HashMap::new();
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let subject_id: String = row.get("subject_id")?;
        let label: String = row.get("label")?;
        let tone: String = row.get("tone")?;
        tones.insert((subject_id, label), tone);
    }
    Ok(tones)
}

/// The tone for one event's stage, or `None` when its register has no set or the
/// stage was recorded outside it. `None` renders untoned rather than as an error —
/// a stage typed before the set existed is still what the user wrote.
fn tone_for(tones: &HashMap<(String, String), String>, event: &TimelineEvent) -> Option<String> {
    let subject_id = event.subject_id.as_deref()?;
    let stage = event.stage.as_deref()?;
    tones
        .get(&(subject_id.to_string(), stage.to_string()))
        .cloned()
}

/// Whether an event may be corrected after the fact.
///
/// Only what the user recorded by hand, at normal weight. Two exclusions, for
/// different reasons:
///
///   * **Derived entries** — `note_logged`, the task events,
///     `journey_status_changed` — restate another object. Editing the entry
///     would let it disagree with the note or task it reports, so those are
///     corrected at their source.
///   * **Milestones and minor entries** are read-only by the user's own choice
///     (DECISIONS.md D-040). A milestone is also structural: it feeds the
///     development spine, so re-dating one moves a turning point on the path.
///
/// **Planned events are always editable**, whatever their weight. D-040's
/// restraint protects *history* — an account of something that happened, which
/// should not be quietly rewritten. A plan is not history: it is a statement
/// about the future, and revising it (the deadline moved, the wording was rough)
/// is the normal way a plan behaves. Locking a mistyped deadline until its date
/// arrived would be the rule protecting nothing.
pub fn is_editable(event: &TimelineEvent) -> bool {
    if matches!(event.event_state, TimelineEventState::Planned) {
        return true;
    }
    event.event_type == "event_recorded" && matches!(event.importance, TimelineImportance::Normal)
}

/// Adding a photograph does not rewrite dates, milestones or derived history.
/// Even a read-only milestone may manage its own pictures, but a note/task's
/// derived event cannot become an independent attachment container.
pub fn can_edit_images(event: &TimelineEvent) -> bool {
    event.source_type.is_none()
        && event.source_id.is_none()
        && matches!(
            event.event_type.as_str(),
            "event_recorded" | "state_changed"
        )
}

/// Confirm that a planned event happened, moving it onto the record.
///
/// Two things change together, which is why this is one command: the state flips
/// to `Recorded`, and `occurred_at` moves from the date that was *aimed at* to
/// the date it actually happened. `planned_for` keeps the original target, so
/// the entry can still say "due the 12th, done on the 10th" — the fact the user
/// most wants back from a deadline they beat.
///
/// Only planned events qualify. Confirming something already on the record is
/// refused rather than silently ignored: it would mean the UI offered an action
/// on an entry it does not apply to, which is worth surfacing.
///
/// It also takes what the entry turned out to be **about**, and the stage it
/// reached. That belongs here rather than in a second dialog because confirming is
/// the moment a plan becomes a fact, and a stage is a fact — `2027 ICRA` is not at
/// 投稿 until the submission actually happens (D-051).
pub fn confirm(
    conn: &Connection,
    id: &str,
    input: ConfirmPlannedEvent,
) -> AppResult<TimelineEntry> {
    let tx = conn.unchecked_transaction()?;
    let existing = conn
        .query_row(
            "SELECT * FROM timeline_events WHERE id = ?1",
            params![id],
            map_event,
        )
        .ok()
        .ok_or_else(|| AppError::NotFound(format!("timeline event `{id}`")))?;

    if !matches!(existing.event_state, TimelineEventState::Planned) {
        return Err(AppError::Invalid(
            "only a planned event can be marked as happened".into(),
        ));
    }

    if input.images.is_some() && !can_edit_images(&existing) {
        return Err(AppError::Invalid(
            "Images can only be attached to an explicit event".into(),
        ));
    }

    let title = match input.title {
        Some(value) => {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                return Err(AppError::Invalid("an event needs a title".into()));
            }
            trimmed
        }
        None => existing.title,
    };

    let occurred_at = match input.occurred_at.as_deref() {
        Some(value) => to_utc(value)?,
        None => now_utc(),
    };

    /*
     * The target is preserved on the way through, not overwritten.
     *
     * `planned_for` is normally already set at creation. The `unwrap_or_else`
     * covers an event that somehow reached `planned` without one, so confirming
     * still records what it had been aimed at rather than losing it.
     */
    let planned_for = existing
        .planned_for
        .unwrap_or_else(|| existing.occurred_at.clone());

    /*
     * What it turned out to be about.
     *
     * `new_subject` is created inside this transaction, the same way
     * `timeline_create_event` does it (D-049): a failure below must not leave a
     * register row that no entry explains. Both are refused together, because they
     * disagree about what the entry is about.
     */
    if input.subject_id.is_some() && input.new_subject.is_some() {
        return Err(AppError::Invalid(
            "an event is about one thing: name a new one or pick an existing one, not both".into(),
        ));
    }

    let mut subject_id = existing.subject_id;
    if let Some(candidate) = input.new_subject {
        let kind = candidate.kind.trim();
        let subject_title = candidate.title.trim();
        if subject_title.is_empty() {
            return Err(AppError::Invalid("a tracked item needs a name".into()));
        }
        if kind.is_empty() {
            return Err(AppError::Invalid("a tracked item needs a kind".into()));
        }

        /*
         * The Journey it joins is the entry's own — a subject belongs to exactly
         * one, and this entry is already filed, so there is no separate answer to
         * ask for. The first is used when an entry spans several, matching the
         * rule `timeline_create_event` follows.
         */
        let journey_id = journeys_by_event(&tx)?
            .remove(id)
            .and_then(|refs| refs.into_iter().next())
            .map(|reference| reference.id)
            .ok_or_else(|| {
                AppError::Invalid("a new tracked item needs a Journey to belong to".into())
            })?;

        let created = crate::db::subjects::create(
            &tx,
            crate::domain::NewSubject {
                journey_id,
                kind: kind.to_string(),
                title: subject_title.to_string(),
            },
        )?;
        subject_id = Some(created.id);
    } else if let Some(chosen) = input.subject_id {
        // `Some(None)` unfiles; a named one is checked against the entry's own
        // Journeys, the same guard `timeline_create_event` applies.
        subject_id = match chosen {
            Some(value) => {
                let subject = crate::db::subjects::get(&tx, &value)?;
                let journeys = journeys_by_event(&tx)?.remove(id).unwrap_or_default();
                if !journeys.iter().any(|item| item.id == subject.journey_id) {
                    return Err(AppError::Invalid(
                        "a tracked item can only take events from its own Journey".into(),
                    ));
                }
                Some(value)
            }
            None => None,
        };
    }

    /*
     * The stage. Dropped when nothing is filed, because a stage with nothing to be
     * the stage *of* is meaningless — the same rule the create path applies.
     */
    let stage = match input.stage {
        Some(value) => value
            .as_deref()
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string),
        None => existing.stage,
    };
    let stage = if subject_id.is_some() { stage } else { None };

    tx.execute(
        "UPDATE timeline_events
            SET event_state = ?2, occurred_at = ?3, planned_for = ?4, title = ?5,
                subject_id = ?6, stage = ?7
          WHERE id = ?1",
        params![
            id,
            TimelineEventState::Recorded,
            occurred_at,
            planned_for,
            title,
            subject_id,
            stage
        ],
    )?;
    if let Some(images) = input.images {
        event_images::replace_within(&tx, id, &images)?;
    }
    tx.commit()?;

    get(conn, id)?.ok_or_else(|| AppError::NotFound(format!("timeline event `{id}`")))
}

/// Undo an accidental confirmation of a user's own plan.
///
/// The target date proves this entry came from a plan. Derived entries and
/// ordinary recorded history cannot be turned into plans. Keeping all wording,
/// filing and stage data lets the user confirm it again when it actually happens;
/// planned stages are excluded from every current-state query.
pub fn revert_confirmed(conn: &Connection, id: &str) -> AppResult<TimelineEntry> {
    let tx = conn.unchecked_transaction()?;
    let existing = tx
        .query_row(
            "SELECT * FROM timeline_events WHERE id = ?1",
            params![id],
            map_event,
        )
        .ok()
        .ok_or_else(|| AppError::NotFound(format!("timeline event `{id}`")))?;

    if !matches!(existing.event_state, TimelineEventState::Recorded)
        || existing.event_type != "event_recorded"
        || existing.source_type.is_some()
        || existing.source_id.is_some()
        || existing.planned_for.is_none()
    {
        return Err(AppError::Invalid(
            "only a confirmed plan can be returned to planned; other recorded history is kept"
                .into(),
        ));
    }

    tx.execute(
        "UPDATE timeline_events SET event_state = 'planned', occurred_at = planned_for
          WHERE id = ?1",
        params![id],
    )?;
    tx.commit()?;

    get(conn, id)?.ok_or_else(|| AppError::NotFound(format!("timeline event `{id}`")))
}

/// Give up on a planned event, removing it.
///
/// The one deletion the timeline allows, and only because a plan that was
/// abandoned is not history being erased — nothing happened. A recorded event is
/// still permanent (D-040's gap, still open).
pub fn delete_planned(conn: &Connection, id: &str) -> AppResult<()> {
    let tx = conn.unchecked_transaction()?;
    let existing = tx
        .query_row(
            "SELECT * FROM timeline_events WHERE id = ?1",
            params![id],
            map_event,
        )
        .ok()
        .ok_or_else(|| AppError::NotFound(format!("timeline event `{id}`")))?;

    if !matches!(existing.event_state, TimelineEventState::Planned) {
        return Err(AppError::Invalid(
            "only a planned event can be removed; recorded history is kept".into(),
        ));
    }

    // Keep any work the plan produced, without an origin that no longer exists.
    tx.execute(
        "UPDATE tasks SET origin_type = NULL, origin_id = NULL
          WHERE origin_type = 'event' AND origin_id = ?1",
        params![id],
    )?;
    // `timeline_event_journeys` rows follow via ON DELETE CASCADE.
    tx.execute("DELETE FROM timeline_events WHERE id = ?1", params![id])?;
    tx.commit()?;
    Ok(())
}

/// Correct a recorded event's wording or its date.
///
/// Enforces `is_editable` here rather than trusting the caller. The frontend
/// hides the affordance on entries that do not qualify, but that is a
/// convenience; this is the guarantee.
pub fn update(conn: &Connection, id: &str, patch: TimelineEventPatch) -> AppResult<TimelineEntry> {
    let existing = conn
        .query_row(
            "SELECT * FROM timeline_events WHERE id = ?1",
            params![id],
            map_event,
        )
        .ok()
        .ok_or_else(|| AppError::NotFound(format!("timeline event `{id}`")))?;

    let images_only = patch.images.is_some()
        && patch.title.is_none()
        && patch.summary.is_none()
        && patch.reflection.is_none()
        && patch.occurred_at.is_none()
        && patch.subject_id.is_none()
        && patch.stage.is_none();
    if patch.images.is_some() && !can_edit_images(&existing) {
        return Err(AppError::Invalid(
            "Images can only be attached to an explicit event".into(),
        ));
    }
    if !is_editable(&existing) && !images_only {
        return Err(AppError::Invalid(
            "only planned events and recorded events of normal weight can be edited".into(),
        ));
    }
    if images_only {
        let tx = conn.unchecked_transaction()?;
        event_images::replace_within(&tx, id, patch.images.as_deref().unwrap_or_default())?;
        tx.commit()?;
        // Do not even normalise other fields on an images-only edit. A stage
        // can intentionally survive after its subject is untracked, for example.
        return get(conn, id)?.ok_or_else(|| AppError::NotFound(format!("timeline event `{id}`")));
    }

    let title = match patch.title {
        Some(value) => {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                // The same refusal `timeline_create_event` makes: an event with
                // no title is a row nobody can read.
                return Err(AppError::Invalid("an event needs a title".into()));
            }
            trimmed
        }
        None => existing.title,
    };

    // `Some(None)` clears, `None` leaves alone, and text that trims to nothing
    // is stored as NULL — the normalisation `timeline_create_event` already
    // applies on the way in.
    fn resolve(patched: Option<Option<String>>, current: Option<String>) -> Option<String> {
        match patched {
            Some(value) => value
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            None => current,
        }
    }

    let summary = resolve(patch.summary, existing.summary);
    let reflection = resolve(patch.reflection, existing.reflection);

    let occurred_at = match patch.occurred_at.as_deref() {
        Some(value) => to_utc(value)?,
        None => existing.occurred_at,
    };

    /*
     * While an event is planned, `occurred_at` *is* the date it is aimed at, so
     * moving a deadline has to move both columns or they would disagree: the
     * entry would sit at the new date while still claiming the old one as its
     * target, and confirming it later would report a deadline the user had
     * already changed. On a recorded event `planned_for` is history and stays
     * exactly as it is.
     */
    let planned_for = match existing.event_state {
        TimelineEventState::Planned => Some(occurred_at.clone()),
        TimelineEventState::Recorded => existing.planned_for,
    };

    /*
     * Filing onto a tracked thing, or off one.
     *
     * `Some(None)` unfiles, `None` leaves it alone. The subject must belong to a
     * Journey this event is actually on — otherwise a register could acquire an
     * event from an unrelated thread, and its counts would describe something
     * the user never put there.
     */
    let subject_id = match patch.subject_id {
        Some(Some(candidate)) => {
            let subject = crate::db::subjects::get(conn, &candidate)?;
            let on_that_journey: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM timeline_event_journeys
                                WHERE event_id = ?1 AND journey_id = ?2)",
                params![id, subject.journey_id],
                |row| row.get(0),
            )?;
            if !on_that_journey {
                return Err(AppError::Invalid(
                    "a tracked item can only take events from its own Journey".into(),
                ));
            }
            Some(candidate)
        }
        Some(None) => None,
        None => existing.subject_id,
    };

    // A stage with nothing to be the stage *of* is meaningless, so unfiling
    // clears it rather than leaving an orphan label behind.
    let stage = match (&subject_id, patch.stage) {
        (None, _) => None,
        (Some(_), Some(value)) => value
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty()),
        (Some(_), None) => existing.stage,
    };

    // `created_at`, `seq`, `event_type`, `importance`, `source_*` and
    // `payload_json` are deliberately untouched: this corrects how a moment is
    // described, not what kind of moment it was or when it was written down.
    // Re-dating therefore moves the entry within the existing `occurred_at, seq`
    // ordering without disturbing the tie-break (migration 0002).
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE timeline_events
            SET title = ?2, summary = ?3, reflection = ?4, occurred_at = ?5,
                planned_for = ?6, subject_id = ?7, stage = ?8
          WHERE id = ?1",
        params![
            id,
            title,
            summary,
            reflection,
            occurred_at,
            planned_for,
            subject_id,
            stage
        ],
    )?;
    if let Some(images) = patch.images {
        event_images::replace_within(&tx, id, &images)?;
    }
    tx.commit()?;

    get(conn, id)?.ok_or_else(|| AppError::NotFound(format!("timeline event `{id}`")))
}

/// Remove every event sourced from `(source_type, source_id)`, in every journey.
///
/// Used when the source itself goes away. Deleting a note used to leave its
/// `note_logged` entries on the timeline pointing at a row that no longer
/// existed — visible, unopenable, and unremovable from the UI.
///
/// This differs from `detach_source_from_journey`, which un-files a note from one
/// journey and is a *correction of the association*. Here the note itself is
/// gone, so nothing it put on any timeline should remain.
pub fn delete_for_source(conn: &Connection, source_type: &str, source_id: &str) -> AppResult<()> {
    // `timeline_event_journeys` rows go with the events via ON DELETE CASCADE.
    conn.execute(
        "DELETE FROM timeline_events WHERE source_type = ?1 AND source_id = ?2",
        params![source_type, source_id],
    )?;
    Ok(())
}

/// Detach a journey from every event sourced from `(source_type, source_id)`,
/// then drop events left with no journey at all.
///
/// Used when a link is removed: the `*_logged` event records the association,
/// so undoing the association is a correction rather than erasing history.
pub fn detach_source_from_journey(
    conn: &Connection,
    source_type: &str,
    source_id: &str,
    journey_id: &str,
) -> AppResult<()> {
    conn.execute(
        "DELETE FROM timeline_event_journeys
          WHERE journey_id = ?1
            AND event_id IN (SELECT id FROM timeline_events
                              WHERE source_type = ?2 AND source_id = ?3)",
        params![journey_id, source_type, source_id],
    )?;
    conn.execute(
        "DELETE FROM timeline_events
          WHERE source_type = ?1 AND source_id = ?2
            AND NOT EXISTS (SELECT 1 FROM timeline_event_journeys ej
                             WHERE ej.event_id = timeline_events.id)",
        params![source_type, source_id],
    )?;
    Ok(())
}

/// Journeys a task/note is linked to, used to fan an event out to the same
/// journeys as its source object.
pub fn journey_ids_for_target(
    conn: &Connection,
    target_type: &str,
    target_id: &str,
) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT journey_id FROM journey_links
          WHERE target_type = ?1 AND target_id = ?2",
    )?;
    let ids = stmt
        .query_map(params![target_type, target_id], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<String>>>()?;
    Ok(ids)
}

#[cfg(all(test, feature = "local-tests"))]
mod tests {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/local-tests/db_timeline.rs"
    ));
}
