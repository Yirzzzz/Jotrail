//! Optional Journey-scoped vocabularies, independent of a register's legacy
//! stage. Event snapshots are the source of truth for per-subject current values.

use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection};
use serde_json::json;

use crate::clock::now_utc;
use crate::db::{new_id, stage_sets};
use crate::domain::{
    ClassifiedOption, EventClassification, EventClassificationInput, NewStateCategory,
    OptionReplacement, StageOptionPatch, StateCategory, StateCategoryOption, StateCategoryPatch,
};
use crate::error::{AppError, AppResult};

pub fn get(conn: &Connection, id: &str) -> AppResult<StateCategory> {
    let mut category = conn
        .query_row(
            "SELECT id, journey_id, name, selection_mode FROM state_categories WHERE id = ?1",
            params![id],
            |row| {
                Ok(StateCategory {
                    id: row.get(0)?,
                    journey_id: row.get(1)?,
                    name: row.get(2)?,
                    selection_mode: row.get(3)?,
                    options: Vec::new(),
                })
            },
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound(format!("state category `{id}`"))
            }
            other => AppError::from(other),
        })?;
    let mut stmt = conn.prepare(
        "SELECT o.id, o.label, o.tone,
                (SELECT COUNT(*) FROM event_classification_options e
                  WHERE e.category_id = o.category_id AND e.option_id = o.id) AS usage_count
           FROM state_category_options o WHERE o.category_id = ?1 ORDER BY o.position, o.id",
    )?;
    category.options = stmt
        .query_map(params![id], |row| {
            Ok(StateCategoryOption {
                id: row.get(0)?,
                label: row.get(1)?,
                tone: row.get(2)?,
                usage_count: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(category)
}

pub fn list(conn: &Connection, journey_id: &str) -> AppResult<Vec<StateCategory>> {
    let mut stmt = conn.prepare(
        "SELECT id FROM state_categories WHERE journey_id = ?1 ORDER BY created_at, rowid",
    )?;
    let ids = stmt
        .query_map(params![journey_id], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    ids.iter().map(|id| get(conn, id)).collect()
}

fn checked_name(name: &str) -> AppResult<&str> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Invalid("a state category needs a name".into()));
    }
    Ok(name)
}

pub fn create(conn: &Connection, input: NewStateCategory) -> AppResult<StateCategory> {
    let name = checked_name(&input.name)?;
    if !matches!(input.selection_mode.as_str(), "single" | "multiple") {
        return Err(AppError::Invalid(
            "selection mode must be single or multiple".into(),
        ));
    }
    if input.options.is_empty() {
        return Err(AppError::Invalid(
            "a state category needs at least one option".into(),
        ));
    }
    if crate::db::journeys::find(conn, &input.journey_id)?.is_none() {
        return Err(AppError::NotFound(format!(
            "journey `{}`",
            input.journey_id
        )));
    }
    let labels = stage_sets::checked_labels(
        &input
            .options
            .iter()
            .map(|option| option.label.clone())
            .collect::<Vec<_>>(),
    )?;
    let tones = input
        .options
        .iter()
        .map(|option| stage_sets::checked_tone(option.tone.clone()))
        .collect::<AppResult<Vec<_>>>()?;
    let id = new_id("category");
    let now = now_utc();
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO state_categories (id, journey_id, name, selection_mode, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![id, input.journey_id, name, input.selection_mode, now],
    )?;
    for (position, (label, tone)) in labels.iter().zip(tones.iter()).enumerate() {
        tx.execute(
            "INSERT INTO state_category_options (id, category_id, label, tone, position)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![new_id("categoryopt"), id, label, tone, position as i64],
        )?;
    }
    tx.commit()?;
    get(conn, &id)
}

/// Shared merge validation for both old stages and independent categories.
/// Targets must be existing, retained options in the same vocabulary. This
/// avoids ambiguous chains/cycles and makes each mapping one simultaneous act.
pub(super) fn replacement_map(
    previous: &[(String, i64)],
    incoming: &[StageOptionPatch],
    replacements: &[OptionReplacement],
) -> AppResult<HashMap<String, String>> {
    let previous_ids: HashSet<&str> = previous.iter().map(|(id, _)| id.as_str()).collect();
    let mut retained = HashSet::new();
    for option in incoming {
        if let Some(id) = option.id.as_deref() {
            if !previous_ids.contains(id) || !retained.insert(id) {
                return Err(AppError::Invalid(
                    "option IDs must belong to this category and be unique".into(),
                ));
            }
        }
    }
    let mut mappings = HashMap::new();
    for replacement in replacements {
        let from = replacement.from_option_id.as_str();
        let to = replacement.to_option_id.as_str();
        if !previous_ids.contains(from)
            || retained.contains(from)
            || !retained.contains(to)
            || from == to
            || mappings.insert(from.to_string(), to.to_string()).is_some()
        {
            return Err(AppError::Invalid(
                "a removed option needs one different, retained replacement from the same category"
                    .into(),
            ));
        }
    }
    for (id, usage_count) in previous {
        if *usage_count > 0 && !retained.contains(id.as_str()) && !mappings.contains_key(id) {
            return Err(AppError::Invalid(
                "choose a replacement before removing an option used by records".into(),
            ));
        }
    }
    Ok(mappings)
}

pub(super) fn audit(
    conn: &Connection,
    scope: &str,
    owner_id: &str,
    operation: &str,
    prior: &serde_json::Value,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO classification_audit (id, scope, owner_id, operation, prior_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            new_id("classaudit"),
            scope,
            owner_id,
            operation,
            serde_json::to_string(prior)?,
            now_utc()
        ],
    )?;
    Ok(())
}

pub fn update(conn: &Connection, id: &str, patch: StateCategoryPatch) -> AppResult<StateCategory> {
    let tx = conn.unchecked_transaction()?;
    let existing = get(&tx, id)?;
    let name = match patch.name.as_deref() {
        Some(name) => checked_name(name)?.to_string(),
        None => existing.name.clone(),
    };
    if patch.options.is_none()
        && patch
            .replacements
            .as_ref()
            .is_some_and(|items| !items.is_empty())
    {
        return Err(AppError::Invalid(
            "replacements require an updated option list".into(),
        ));
    }
    let mut stored = by_event(&tx)?;
    stored.retain(|_, categories| {
        categories.retain(|category| category.category_id == id);
        !categories.is_empty()
    });
    audit(
        &tx,
        "category",
        id,
        "update",
        &json!({"category": existing, "events": stored}),
    )?;

    if let Some(options) = patch.options {
        if options.is_empty() {
            return Err(AppError::Invalid(
                "a state category needs at least one option".into(),
            ));
        }
        let labels = stage_sets::checked_labels(
            &options
                .iter()
                .map(|option| option.label.clone())
                .collect::<Vec<_>>(),
        )?;
        let tones = options
            .iter()
            .map(|option| stage_sets::checked_tone(option.tone.clone()))
            .collect::<AppResult<Vec<_>>>()?;
        let previous = existing
            .options
            .iter()
            .map(|option| (option.id.clone(), option.usage_count))
            .collect::<Vec<_>>();
        let replacements = replacement_map(
            &previous,
            &options,
            patch.replacements.as_deref().unwrap_or_default(),
        )?;

        // Event rows are snapshots, not foreign keys into the live option list.
        // Rebuild from original IDs so label swaps and merges cannot chain.
        tx.execute(
            "DELETE FROM state_category_options WHERE category_id = ?1",
            params![id],
        )?;
        let mut updated = HashMap::new();
        for (position, ((option, label), tone)) in options
            .iter()
            .zip(labels.iter())
            .zip(tones.iter())
            .enumerate()
        {
            let option_id = option.id.clone().unwrap_or_else(|| new_id("categoryopt"));
            tx.execute(
                "INSERT INTO state_category_options (id, category_id, label, tone, position)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![option_id, id, label, tone, position as i64],
            )?;
            updated.insert(
                option_id.clone(),
                (
                    position as i64,
                    ClassifiedOption {
                        id: option_id,
                        label: label.clone(),
                        tone: tone.clone(),
                    },
                ),
            );
        }
        for (event_id, categories) in &stored {
            tx.execute(
                "DELETE FROM event_classification_options WHERE event_id = ?1 AND category_id = ?2",
                params![event_id, id],
            )?;
            let mut seen = HashSet::new();
            for selected in &categories[0].options {
                let target = replacements.get(&selected.id).unwrap_or(&selected.id);
                if !seen.insert(target) {
                    continue;
                }
                let (position, selected) = updated
                    .get(target)
                    .ok_or_else(|| AppError::Invalid("a used option needs a replacement".into()))?;
                insert_selected(&tx, event_id, id, selected, *position)?;
            }
        }
    }
    tx.execute(
        "UPDATE state_categories SET name = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, name, now_utc()],
    )?;
    tx.execute(
        "UPDATE event_classifications SET category_name = ?2 WHERE category_id = ?1",
        params![id, name],
    )?;
    tx.commit()?;
    get(conn, id)
}

fn insert_selected(
    conn: &Connection,
    event_id: &str,
    category_id: &str,
    option: &ClassifiedOption,
    position: i64,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO event_classification_options (event_id, category_id, option_id, label, tone, position)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![event_id, category_id, option.id, option.label, option.tone, position],
    )?;
    Ok(())
}

/// Caller owns the transaction with text, images and optional subject creation.
pub fn replace_within(
    conn: &Connection,
    event_id: &str,
    changes: &[EventClassificationInput],
) -> AppResult<()> {
    let mut seen = HashSet::new();
    let mut validated = Vec::new();
    for change in changes {
        if !seen.insert(&change.category_id) {
            return Err(AppError::Invalid(
                "a state category may only be supplied once".into(),
            ));
        }
        let category = get(conn, &change.category_id)?;
        let belongs: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM timeline_event_journeys WHERE event_id = ?1 AND journey_id = ?2)",
            params![event_id, category.journey_id], |row| row.get(0),
        )?;
        if !belongs {
            return Err(AppError::Invalid(
                "a state category must belong to the event's Journey".into(),
            ));
        }
        let option_ids: HashSet<&str> = change.option_ids.iter().map(String::as_str).collect();
        if category.selection_mode == "single" && option_ids.len() > 1 {
            return Err(AppError::Invalid(
                "a single-select category accepts at most one option".into(),
            ));
        }
        if option_ids
            .iter()
            .any(|id| !category.options.iter().any(|option| option.id == *id))
        {
            return Err(AppError::Invalid(
                "selected options must belong to their state category".into(),
            ));
        }
        let options = category
            .options
            .iter()
            .filter(|option| option_ids.contains(option.id.as_str()))
            .map(|option| ClassifiedOption {
                id: option.id.clone(),
                label: option.label.clone(),
                tone: option.tone.clone(),
            })
            .collect::<Vec<_>>();
        validated.push((category, options));
    }
    if validated.is_empty() {
        return Ok(());
    }
    let prior = for_event(conn, event_id)?;
    if !prior.is_empty() {
        audit(
            conn,
            "event",
            event_id,
            "classifications_updated",
            &json!({"classifications": prior}),
        )?;
    }
    for (category, options) in validated {
        conn.execute(
            "DELETE FROM event_classifications WHERE event_id = ?1 AND category_id = ?2",
            params![event_id, category.id],
        )?;
        conn.execute(
            "INSERT INTO event_classifications (event_id, category_id, category_name, selection_mode) VALUES (?1, ?2, ?3, ?4)",
            params![event_id, category.id, category.name, category.selection_mode],
        )?;
        for (position, option) in options.iter().enumerate() {
            insert_selected(conn, event_id, &category.id, option, position as i64)?;
        }
    }
    Ok(())
}

fn snapshots(
    conn: &Connection,
    event_id: Option<&str>,
) -> AppResult<HashMap<String, Vec<EventClassification>>> {
    let mut stmt = conn.prepare(
        "SELECT c.event_id, c.category_id, c.category_name, c.selection_mode, o.option_id, o.label, o.tone
           FROM event_classifications c LEFT JOIN event_classification_options o
             ON o.event_id = c.event_id AND o.category_id = c.category_id
          WHERE (?1 IS NULL OR c.event_id = ?1)
          ORDER BY c.event_id, c.rowid, o.position, o.option_id",
    )?;
    let mut out: HashMap<String, Vec<EventClassification>> = HashMap::new();
    let mut rows = stmt.query(params![event_id])?;
    while let Some(row) = rows.next()? {
        let event_id: String = row.get(0)?;
        let category_id: String = row.get(1)?;
        let categories = out.entry(event_id).or_default();
        if categories
            .last()
            .map_or(true, |item| item.category_id != category_id)
        {
            categories.push(EventClassification {
                category_id,
                category_name: row.get(2)?,
                selection_mode: row.get(3)?,
                options: Vec::new(),
            });
        }
        if let Some(id) = row.get::<_, Option<String>>(4)? {
            categories
                .last_mut()
                .expect("category inserted")
                .options
                .push(ClassifiedOption {
                    id,
                    label: row.get(5)?,
                    tone: row.get(6)?,
                });
        }
    }
    Ok(out)
}

pub fn for_event(conn: &Connection, event_id: &str) -> AppResult<Vec<EventClassification>> {
    Ok(snapshots(conn, Some(event_id))?
        .remove(event_id)
        .unwrap_or_default())
}

pub fn by_event(conn: &Connection) -> AppResult<HashMap<String, Vec<EventClassification>>> {
    snapshots(conn, None)
}

/// Newest recorded snapshot independently per subject/category. Plans never
/// change the current value; an empty snapshot is kept, so clearing works.
pub fn by_subject(conn: &Connection) -> AppResult<HashMap<String, Vec<EventClassification>>> {
    let snapshots = by_event(conn)?;
    let mut stmt = conn.prepare(
        "SELECT e.subject_id, e.id FROM timeline_events e
          WHERE e.subject_id IS NOT NULL AND e.event_state = 'recorded'
            AND EXISTS(SELECT 1 FROM event_classifications c WHERE c.event_id = e.id)
          ORDER BY e.occurred_at DESC, e.seq DESC",
    )?;
    let mut out: HashMap<String, Vec<EventClassification>> = HashMap::new();
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let subject_id: String = row.get(0)?;
        let event_id: String = row.get(1)?;
        let current = out.entry(subject_id).or_default();
        for category in snapshots.get(&event_id).into_iter().flatten() {
            if !current
                .iter()
                .any(|item| item.category_id == category.category_id)
            {
                current.push(category.clone());
            }
        }
    }
    Ok(out)
}

#[cfg(all(test, feature = "local-tests"))]
mod tests {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/local-tests/db_state_categories.rs"
    ));
}
