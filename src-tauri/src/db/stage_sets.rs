//! Stage sets — a named, reusable vocabulary for a register.
//!
//! Migration 0006 let a register acquire its stages by being used
//! (`SELECT DISTINCT stage`). This module makes that vocabulary a thing the user
//! names, which buys two properties the derived form cannot have: it is reusable
//! across Journeys, and it can report a stage with **zero** things at it.
//!
//! It is a layer on top. `timeline_events.stage` is still free text, a register
//! with no set behaves exactly as before, and attaching a set rewrites nothing.
//!
//! Not a workflow, and not a display order. A stage says what something *is now*,
//! not where it stands in a sequence, so 投递 may jump straight to offer and the
//! set ranks nothing: the register groups by recency of movement and the Overview
//! by count. `position` survives only as insertion order, so a set re-reads
//! stably.

use std::collections::HashMap;

use rusqlite::{params, Connection, Row};

use crate::clock::now_utc;
use crate::db::new_id;
use crate::domain::{
    NewStageSet, RegisterTally, StageOption, StageOptionPatch, StageSet, StageSetPatch,
    StageSetWithOptions, StageTally, STAGE_TONES,
};
use crate::error::{AppError, AppResult};

/// Validate a tone name, defaulting to `neutral`.
///
/// Rejecting an unknown tone here rather than at the edge is deliberate: the
/// database is the last place a colour could get in, and a tone that no
/// stylesheet resolves would render as an invisible border rather than an error.
fn checked_tone(tone: Option<String>) -> AppResult<String> {
    match tone {
        None => Ok("neutral".to_string()),
        Some(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return Ok("neutral".to_string());
            }
            if !STAGE_TONES.contains(&trimmed) {
                return Err(AppError::Invalid(format!(
                    "unknown stage tone `{trimmed}`; expected one of {}",
                    STAGE_TONES.join(", ")
                )));
            }
            Ok(trimmed.to_string())
        }
    }
}

/// Trim, reject empties, and reject duplicates within one set.
///
/// Duplicates have to go because the **label is the key**: events store the
/// label, so two stages sharing one would make "how many are at 一面"
/// unanswerable. The UNIQUE index would catch it too, but a named error is
/// better than a constraint violation surfacing in the UI.
fn checked_labels(labels: &[String]) -> AppResult<Vec<String>> {
    let mut seen: Vec<String> = Vec::with_capacity(labels.len());
    for label in labels {
        let trimmed = label.trim();
        if trimmed.is_empty() {
            return Err(AppError::Invalid("a stage needs a name".into()));
        }
        if seen.iter().any(|existing| existing == trimmed) {
            return Err(AppError::Invalid(format!(
                "`{trimmed}` is listed twice; a stage name has to be unique within a set"
            )));
        }
        seen.push(trimmed.to_string());
    }
    Ok(seen)
}

fn map_set(row: &Row<'_>) -> rusqlite::Result<StageSet> {
    Ok(StageSet {
        id: row.get("id")?,
        name: row.get("name")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn map_option(row: &Row<'_>) -> rusqlite::Result<StageOption> {
    Ok(StageOption {
        id: row.get("id")?,
        set_id: row.get("set_id")?,
        label: row.get("label")?,
        tone: row.get("tone")?,
        position: row.get("position")?,
    })
}

fn options_of(conn: &Connection, set_id: &str) -> AppResult<Vec<StageOption>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM stage_options WHERE set_id = ?1 ORDER BY position, label COLLATE NOCASE",
    )?;
    let rows = stmt
        .query_map(params![set_id], map_option)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Every set, with its stages and how many registers use it.
pub fn list(conn: &Connection) -> AppResult<Vec<StageSetWithOptions>> {
    let mut stmt = conn.prepare(
        "SELECT s.*,
                (SELECT COUNT(*) FROM register_stage_sets r WHERE r.set_id = s.id)
                  AS register_count
           FROM stage_sets s
          ORDER BY s.name COLLATE NOCASE",
    )?;
    let sets = stmt
        .query_map([], |row| {
            Ok((map_set(row)?, row.get::<_, i64>("register_count")?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    sets.into_iter()
        .map(|(set, register_count)| {
            let options = options_of(conn, &set.id)?;
            Ok(StageSetWithOptions {
                set,
                options,
                register_count,
            })
        })
        .collect()
}

pub fn get(conn: &Connection, id: &str) -> AppResult<StageSetWithOptions> {
    let mut stmt = conn.prepare(
        "SELECT s.*,
                (SELECT COUNT(*) FROM register_stage_sets r WHERE r.set_id = s.id)
                  AS register_count
           FROM stage_sets s WHERE s.id = ?1",
    )?;
    let found = stmt
        .query_row(params![id], |row| {
            Ok((map_set(row)?, row.get::<_, i64>("register_count")?))
        })
        .ok();

    let (set, register_count) =
        found.ok_or_else(|| AppError::NotFound(format!("stage set `{id}`")))?;
    let options = options_of(conn, &set.id)?;
    Ok(StageSetWithOptions {
        set,
        options,
        register_count,
    })
}

/// Create a set and its stages in one transaction.
///
/// At least one stage is required: the vocabulary *is* the set, so an empty one
/// describes nothing and would show up as a pickable option that does no work.
pub fn create(conn: &Connection, input: NewStageSet) -> AppResult<StageSetWithOptions> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(AppError::Invalid("a stage set needs a name".into()));
    }
    if input.options.is_empty() {
        return Err(AppError::Invalid(
            "a stage set needs at least one stage".into(),
        ));
    }

    let labels = checked_labels(
        &input
            .options
            .iter()
            .map(|option| option.label.clone())
            .collect::<Vec<_>>(),
    )?;
    let tones = input
        .options
        .iter()
        .map(|option| checked_tone(option.tone.clone()))
        .collect::<AppResult<Vec<_>>>()?;

    let now = now_utc();
    let set_id = new_id("stgset");

    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO stage_sets (id, name, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?3)",
        params![set_id, name, now],
    )?;
    for (position, (label, tone)) in labels.iter().zip(tones.iter()).enumerate() {
        tx.execute(
            "INSERT INTO stage_options (id, set_id, label, tone, position)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![new_id("stgopt"), set_id, label, tone, position as i64],
        )?;
    }
    tx.commit()?;

    get(conn, &set_id)
}

/// Rename a set, and/or replace its stage list.
///
/// The whole thing is one transaction because a rename has to reach two tables:
/// `stage_options.label` and every `timeline_events.stage` that stored the old
/// label. Half of that applied would leave things recorded at a stage the set no
/// longer contains — visible as "off set" rows in the tally, which is a correct
/// report of a state that should never have been created.
pub fn update(
    conn: &Connection,
    id: &str,
    patch: StageSetPatch,
) -> AppResult<StageSetWithOptions> {
    let existing = get(conn, id)?;
    let tx = conn.unchecked_transaction()?;

    if let Some(name) = patch.name.as_deref() {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(AppError::Invalid("a stage set needs a name".into()));
        }
        tx.execute(
            "UPDATE stage_sets SET name = ?2 WHERE id = ?1",
            params![id, trimmed],
        )?;
    }

    if let Some(options) = patch.options {
        if options.is_empty() {
            return Err(AppError::Invalid(
                "a stage set needs at least one stage".into(),
            ));
        }
        replace_options(&tx, &existing, &options)?;
    }

    tx.execute(
        "UPDATE stage_sets SET updated_at = ?2 WHERE id = ?1",
        params![id, now_utc()],
    )?;
    tx.commit()?;

    get(conn, id)
}

/// Apply a new stage list to an existing set, cascading renames onto events.
///
/// Runs inside the caller's transaction — never opens its own, which is the
/// nested-transaction bug D-038 fixed in `tasks::create`.
fn replace_options(
    tx: &rusqlite::Transaction<'_>,
    existing: &StageSetWithOptions,
    incoming: &[StageOptionPatch],
) -> AppResult<()> {
    let labels = checked_labels(
        &incoming
            .iter()
            .map(|option| option.label.clone())
            .collect::<Vec<_>>(),
    )?;
    let tones = incoming
        .iter()
        .map(|option| checked_tone(option.tone.clone()))
        .collect::<AppResult<Vec<_>>>()?;

    let previous_label: HashMap<&str, &str> = existing
        .options
        .iter()
        .map(|option| (option.id.as_str(), option.label.as_str()))
        .collect();

    /*
     * Which registers use this set. A rename rewrites events, and it must only
     * rewrite events belonging to a register described by *this* set: two
     * registers can legitimately use the word 投稿 under different sets, and
     * renaming one set's 投稿 must not touch the other's.
     */
    let mut registers = tx.prepare(
        "SELECT journey_id, kind FROM register_stage_sets WHERE set_id = ?1",
    )?;
    let attached = registers
        .query_map(params![existing.set.id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    // Renames first, while the old labels are still on the events.
    for (option, label) in incoming.iter().zip(labels.iter()) {
        let Some(option_id) = option.id.as_deref() else {
            continue;
        };
        let Some(old_label) = previous_label.get(option_id) else {
            return Err(AppError::Invalid(format!(
                "stage `{option_id}` does not belong to this set"
            )));
        };
        if old_label == label {
            continue;
        }

        for (journey_id, kind) in &attached {
            tx.execute(
                "UPDATE timeline_events SET stage = ?1
                  WHERE stage = ?2
                    AND subject_id IN (
                      SELECT id FROM subjects WHERE journey_id = ?3 AND kind = ?4
                    )",
                params![label, old_label, journey_id, kind],
            )?;
        }
    }

    // Then the list itself. Deleted wholesale rather than diffed: positions are
    // dense and every surviving row is rewritten anyway.
    tx.execute(
        "DELETE FROM stage_options WHERE set_id = ?1",
        params![existing.set.id],
    )?;
    for (position, (option, (label, tone))) in incoming
        .iter()
        .zip(labels.iter().zip(tones.iter()))
        .enumerate()
    {
        /*
         * Existing rows keep their id. Nothing in the schema requires it —
         * events reference the label — but a stable id means the editor can send
         * the same list back without every stage looking new, which is what
         * makes a second rename work.
         */
        let option_id = option
            .id
            .clone()
            .filter(|id| previous_label.contains_key(id.as_str()))
            .unwrap_or_else(|| new_id("stgopt"));
        tx.execute(
            "INSERT INTO stage_options (id, set_id, label, tone, position)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![option_id, existing.set.id, label, tone, position as i64],
        )?;
    }

    Ok(())
}

/// Delete a set. Its attachments go with it; recorded stages stay.
///
/// Events keep their `stage` text, so history is untouched — the registers that
/// used this set simply return to free-text behaviour, and their stages report as
/// "off set" until another set is attached. Deleting history because a
/// description of it was deleted would be the destructive move `subjects::delete`
/// also refuses.
pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    let affected = conn.execute("DELETE FROM stage_sets WHERE id = ?1", params![id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("stage set `{id}`")));
    }
    Ok(())
}

/// Point a register at a set, replacing whatever it used before.
pub fn attach(conn: &Connection, journey_id: &str, kind: &str, set_id: &str) -> AppResult<()> {
    let kind = kind.trim();
    if kind.is_empty() {
        return Err(AppError::Invalid("a register needs a kind".into()));
    }
    // Both sides are checked so a typo cannot create an attachment pointing at
    // nothing — the FK covers the ids, but not that the set exists *now*.
    get(conn, set_id)?;
    if crate::db::journeys::find(conn, journey_id)?.is_none() {
        return Err(AppError::NotFound(format!("journey `{journey_id}`")));
    }

    conn.execute(
        "INSERT INTO register_stage_sets (journey_id, kind, set_id, attached_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (journey_id, kind)
           DO UPDATE SET set_id = excluded.set_id, attached_at = excluded.attached_at",
        params![journey_id, kind, set_id, now_utc()],
    )?;
    Ok(())
}

/// Stop describing a register with a set. Recorded stages are left alone.
pub fn detach(conn: &Connection, journey_id: &str, kind: &str) -> AppResult<()> {
    conn.execute(
        "DELETE FROM register_stage_sets WHERE journey_id = ?1 AND kind = ?2",
        params![journey_id, kind],
    )?;
    Ok(())
}

/// The set a register uses, if any.
pub fn for_register(
    conn: &Connection,
    journey_id: &str,
    kind: &str,
) -> AppResult<Option<StageSetWithOptions>> {
    let set_id: Option<String> = conn
        .query_row(
            "SELECT set_id FROM register_stage_sets WHERE journey_id = ?1 AND kind = ?2",
            params![journey_id, kind],
            |row| row.get(0),
        )
        .ok();

    match set_id {
        None => Ok(None),
        Some(id) => Ok(Some(get(conn, &id)?)),
    }
}

/// Every register in a Journey, with how many things sit at each stage.
///
/// What the Journey Overview renders. Four rules, all of them about honesty:
///
/// - **Counts, never percentages** (D-007). A register has no completion.
/// - **Every stage of the set appears, including empty ones.** A zero is the
///   answer to "how many are at 大修", and being able to say it is the reason a
///   set exists as rows.
/// - **Stages recorded but not in the set are reported, not dropped.** Otherwise
///   the parts would add up to less than the register and things the user
///   recorded would vanish from the count.
/// - **Ordered by count, not by the set.** A stage says what something *is now*
///   and carries no position (D-043, revised), so the set cannot supply an order
///   here. Biggest group first is a fact about the data and is what a reader of a
///   cross-section wants anyway; the label breaks ties so the bar does not
///   reshuffle between reads.
pub fn tallies(conn: &Connection, journey_id: &str) -> AppResult<Vec<RegisterTally>> {
    let kinds = crate::db::subjects::kinds(conn, journey_id)?;
    let mut out = Vec::with_capacity(kinds.len());

    for (kind, total) in kinds {
        let subjects = crate::db::subjects::list(conn, journey_id, Some(&kind))?;
        let set = for_register(conn, journey_id, &kind)?;

        let mut recorded: HashMap<String, i64> = HashMap::new();
        let mut unstaged = 0;
        for subject in &subjects {
            match subject.current_stage.as_deref() {
                Some(stage) => *recorded.entry(stage.to_string()).or_insert(0) += 1,
                None => unstaged += 1,
            }
        }

        let mut stages: Vec<StageTally> = Vec::new();
        if let Some(set) = &set {
            for option in &set.options {
                stages.push(StageTally {
                    count: recorded.remove(&option.label).unwrap_or(0),
                    label: option.label.clone(),
                    tone: option.tone.clone(),
                    off_set: false,
                });
            }
        }

        // Whatever is left was recorded without being in the set.
        for (label, count) in recorded {
            stages.push(StageTally {
                label,
                tone: "neutral".to_string(),
                count,
                off_set: true,
            });
        }

        /*
         * Biggest first, then by label.
         *
         * One sort over everything rather than "set order, then leftovers":
         * an off-set stage is a real place things are, and sorting it behind the
         * set would be ranking it by a position the set no longer defines. The
         * label tiebreak is what makes the order stable across reads, including
         * among the empty stages that all tie at zero.
         */
        stages.sort_by(|left, right| {
            right
                .count
                .cmp(&left.count)
                .then_with(|| left.label.cmp(&right.label))
        });

        out.push(RegisterTally {
            kind,
            set_name: set.map(|set| set.set.name),
            stages,
            unstaged,
            total,
        });
    }

    Ok(out)
}

#[cfg(all(test, feature = "local-tests"))]
mod tests {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/local-tests/db_stage_sets.rs"
    ));
}
