//! Subjects — the things a Journey keeps track of, and the rows a register lists.
//!
//! Everything a register displays beyond the name is **derived from events**:
//! current stage, when it last moved, how many times it has moved. Nothing is
//! cached on the row, so a subject can never disagree with its own history —
//! the same reasoning that makes the timeline persisted rather than computed
//! (DATA_MODEL.md §5), applied in the opposite direction.

use rusqlite::{params, Connection, Row};
use serde::Serialize;

use crate::clock::now_utc;
use crate::db::new_id;
use crate::domain::{NewSubject, Subject, SubjectPatch, SubjectSummary};
use crate::error::{AppError, AppResult};

/// One thing the grouper believes it found, and the events that belong to it.
///
/// Crosses the IPC boundary, so it serialises camelCase like every other shared
/// type. It lives here rather than in `domain` because it is a *proposal* — a
/// derived suggestion about existing rows, not a thing the notebook stores.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposedSubject {
    pub title: String,
    /// `(event_id, event_title, stage)`, oldest first.
    pub events: Vec<(String, String, String)>,
}

/// Longest shared leading run of *characters* — never bytes, because slicing a
/// UTF-8 string mid-codepoint panics and every title here is CJK.
fn shared_prefix(left: &str, right: &str) -> String {
    left.chars()
        .zip(right.chars())
        .take_while(|(a, b)| a == b)
        .map(|(a, _)| a)
        .collect()
}

/// Longest shared trailing run of characters.
fn shared_suffix(left: &str, right: &str) -> String {
    let common: String = left
        .chars()
        .rev()
        .zip(right.chars().rev())
        .take_while(|(a, b)| a == b)
        .map(|(a, _)| a)
        .collect();
    common.chars().rev().collect()
}

/// Whether two remainders end with the same *word*, rather than merely the same
/// character.
///
/// This is what separates a real find from a near miss:
///
/// | prefix   | remainders                | shared suffix | word? |
/// | -------- | ------------------------- | ------------- | ----- |
/// | `2026 `  | `AAAI 投稿`, `ICML 投稿`   | `投稿`         | yes   |
/// | `TMM `   | `投稿`, `一轮大修返稿`      | `稿`           | no    |
///
/// In the first row both remainders *end the same way*, so the titles diverge in
/// the middle and reconverge — the name has not finished at the prefix. In the
/// second the overlap is one character mid-word, which is coincidence.
///
/// "Word" means the suffix either is the whole remainder or is preceded by
/// whitespace in both.
fn remainders_end_with_same_word(remainders: [&str; 2]) -> bool {
    /*
     * The shared suffix arrives with its own leading whitespace attached — for
     * `AAAI 投稿` / `ICML 投稿` it is `" 投稿"`, not `"投稿"` — so it is trimmed
     * before the boundary is checked. Without the trim the head reads `"AAAI"`,
     * which does not end in whitespace, and the whole condition silently never
     * fired. A probe on the real pair is what found that.
     */
    let suffix = shared_suffix(remainders[0], remainders[1]);
    let suffix = suffix.trim_start();
    if suffix.is_empty() {
        return false;
    }

    remainders.iter().all(|rest| {
        let head = &rest[..rest.len() - suffix.len()];
        head.is_empty() || head.chars().last().is_some_and(char::is_whitespace)
    })
}

/// Whether a shared prefix is believable as a thing's name.
///
/// The problem this solves: `2026 AAAI 投稿` and `2026 IJCAI 投稿` share `2026 `,
/// which is a year rather than a submission. Three conditions, all needed:
///
/// 1. **Long enough to be a name** — two characters at minimum.
/// 2. **Both remainders non-empty** — a prefix equal to a whole title tells us
///    nothing about where the stage begins.
/// 3. **The split lands on a boundary the writer actually made.** Either the
///    prefix ends in a space (`TMM ` + `投稿`), or the script changes across the
///    cut (`卫澜深海——VLA` + `一面`, latin → CJK with no space at all). That second
///    case is exactly the one I had wrongly called unguessable.
///
/// 4. **The remainders must not end with the same word.** `2026 ` passes the
///    first three — it ends in a space — but `AAAI 投稿` / `ICML 投稿` both end in
///    `投稿`, which means the divergence is mid-name and `2026` is a year rather
///    than a submission. This condition is why the test for that case exists;
///    without it the grouper merged two different papers.
fn prefix_is_believable(prefix: &str, remainders: [&str; 2]) -> bool {
    if prefix.chars().count() < 2 {
        return false;
    }
    if remainders.iter().any(|rest| rest.trim().is_empty()) {
        return false;
    }
    if remainders_end_with_same_word(remainders) {
        return false;
    }

    let last = prefix.chars().last();
    if last.is_some_and(char::is_whitespace) {
        return true;
    }

    // A script change is a boundary the writer made without typing a separator.
    let is_cjk = |c: char| matches!(c, '\u{3000}'..='\u{9fff}' | '\u{f900}'..='\u{faff}');
    last.is_some_and(|end| {
        remainders
            .iter()
            .filter_map(|rest| rest.chars().next())
            .all(|start| is_cjk(start) != is_cjk(end))
    })
}

/// Group titles that look like the same thing at different stages.
///
/// Pure, so the interesting behaviour is testable against the real notebook
/// without a database. Sorting puts shared prefixes adjacent, then clusters grow
/// only while every member shares the *whole* cluster prefix — which is what
/// stops `2026 AAAI` and `2026 ICML` collapsing into `2026`.
///
/// **A thing recorded only once is deliberately left alone.** With one title
/// there is no evidence of where the name ends: `上海仙工一面` could be the
/// position `上海仙工` at stage `一面`, or a single event about the whole thing.
/// Only the user knows, so guessing there would be inventing intent — which is
/// the mistake I made in the other direction earlier.
pub fn group_by_shared_prefix(titles: &[(String, String)]) -> Vec<ProposedSubject> {
    /*
     * Sorting by title is what makes shared prefixes adjacent, but it is *not*
     * the order the events should be reported in — `events` is documented as
     * oldest-first, and the caller shows the stages as a sequence. So the input
     * position travels with each title and is used to restore chronology at the
     * end (`propose_from_titles` queries `ORDER BY occurred_at, seq`).
     *
     * Without this, `TMM 一轮大修返稿` sorts before `TMM 投稿` and the preview reads
     * the revision before the submission.
     */
    let mut sorted: Vec<(usize, &(String, String))> = titles.iter().enumerate().collect();
    sorted.sort_by(|a, b| a.1 .1.cmp(&b.1 .1));

    let mut groups: Vec<ProposedSubject> = Vec::new();
    let mut index = 0;

    while index < sorted.len() {
        let mut prefix = String::new();
        let mut members: Vec<(usize, &(String, String))> = vec![sorted[index]];

        // Seed the cluster from the next title, if the pair splits believably.
        if let Some(next) = sorted.get(index + 1) {
            let candidate = shared_prefix(&sorted[index].1 .1, &next.1 .1);
            let left = &sorted[index].1 .1[candidate.len()..];
            let right = &next.1 .1[candidate.len()..];
            if prefix_is_believable(&candidate, [left, right]) {
                prefix = candidate;
                members.push(*next);
            }
        }

        if prefix.is_empty() {
            index += 1;
            continue;
        }

        // Extend only while the next title shares the *entire* cluster prefix.
        let mut cursor = index + 2;
        while let Some(next) = sorted.get(cursor) {
            if shared_prefix(&prefix, &next.1 .1).len() != prefix.len() {
                break;
            }
            let rest = &next.1 .1[prefix.len()..];
            if rest.trim().is_empty() {
                break;
            }
            members.push(*next);
            cursor += 1;
        }

        // Back into the order the events actually happened in.
        members.sort_by_key(|(position, _)| *position);

        groups.push(ProposedSubject {
            title: prefix.trim().to_string(),
            events: members
                .iter()
                .map(|(_, (id, title))| {
                    (
                        id.clone(),
                        title.clone(),
                        title[prefix.len()..].trim().to_string(),
                    )
                })
                .collect(),
        });
        index = cursor;
    }

    groups.sort_by(|a, b| a.title.cmp(&b.title));
    groups
}

/// What the grouper would make of a Journey's untagged hand-written events.
///
/// Read-only. The caller shows this and the user confirms, because a parse this
/// good is still a guess — see `group_by_shared_prefix` on why singletons are
/// left out, and the ICML case in the tests for one it gets subtly wrong.
pub fn propose_from_titles(conn: &Connection, journey_id: &str) -> AppResult<Vec<ProposedSubject>> {
    let mut stmt = conn.prepare(
        "SELECT e.id, e.title
           FROM timeline_events e
           JOIN timeline_event_journeys ej ON ej.event_id = e.id
          WHERE ej.journey_id = ?1
            AND e.event_type = 'event_recorded'
            AND e.subject_id IS NULL
          ORDER BY e.occurred_at, e.seq",
    )?;
    let titles = stmt
        .query_map(params![journey_id], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<rusqlite::Result<Vec<(String, String)>>>()?;

    Ok(group_by_shared_prefix(&titles))
}

fn map_subject(row: &Row<'_>) -> rusqlite::Result<Subject> {
    Ok(Subject {
        id: row.get("id")?,
        journey_id: row.get("journey_id")?,
        kind: row.get("kind")?,
        title: row.get("title")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

/// Create a thing to track. `kind` is free-form, which is what makes a film
/// register cost no code.
pub fn create(conn: &Connection, input: NewSubject) -> AppResult<Subject> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(AppError::Invalid("a tracked item needs a name".into()));
    }

    let kind = input.kind.trim();
    if kind.is_empty() {
        return Err(AppError::Invalid("a tracked item needs a kind".into()));
    }

    if crate::db::journeys::find(conn, &input.journey_id)?.is_none() {
        return Err(AppError::NotFound(format!(
            "journey `{}`",
            input.journey_id
        )));
    }

    let now = now_utc();
    let subject = Subject {
        id: new_id("sub"),
        journey_id: input.journey_id,
        kind: kind.to_string(),
        title: title.to_string(),
        created_at: now.clone(),
        updated_at: now,
    };

    conn.execute(
        "INSERT INTO subjects (id, journey_id, kind, title, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            subject.id,
            subject.journey_id,
            subject.kind,
            subject.title,
            subject.created_at,
            subject.updated_at,
        ],
    )?;

    Ok(subject)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Subject> {
    conn.query_row(
        "SELECT * FROM subjects WHERE id = ?1",
        params![id],
        map_subject,
    )
    .map_err(|_| AppError::NotFound(format!("tracked item `{id}`")))
}

/// Rename a subject, or move it to another register.
///
/// This is the whole point of the row existing. Grouping events by a free-text
/// subject would split a thing's history the moment its name changed; here the
/// id is stable, the events keep pointing at it, and the rename is invisible to
/// history.
pub fn update(conn: &Connection, id: &str, patch: SubjectPatch) -> AppResult<Subject> {
    let existing = get(conn, id)?;

    let title = match patch.title {
        Some(value) => {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                return Err(AppError::Invalid("a tracked item needs a name".into()));
            }
            trimmed
        }
        None => existing.title,
    };

    let kind = match patch.kind {
        Some(value) => {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                return Err(AppError::Invalid("a tracked item needs a kind".into()));
            }
            trimmed
        }
        None => existing.kind,
    };

    conn.execute(
        "UPDATE subjects SET title = ?2, kind = ?3, updated_at = ?4 WHERE id = ?1",
        params![id, title, kind, now_utc()],
    )?;

    get(conn, id)
}

/// Stop tracking something. Its events survive.
///
/// `subject_id` is `ON DELETE SET NULL`, so the interviews and submissions stay
/// on the timeline — they happened, whether or not the thing is still being
/// followed. Same choice `tasks::delete` makes about completion events.
pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    let affected = conn.execute("DELETE FROM subjects WHERE id = ?1", params![id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("tracked item `{id}`")));
    }
    Ok(())
}

/// One register: every subject of a kind in a Journey, with its derived stage.
///
/// `kind` omitted lists the Journey's whole set, which is what the Journey
/// overview needs to know which registers exist at all.
///
/// The correlated subqueries pick the *last* event by the timeline's own
/// ordering — `occurred_at` then `seq` — so a subject whose two events share a
/// millisecond still reports the stage that was entered second. Sorting the same
/// way `list` does anywhere else would be wrong here: a register is a set, so it
/// reads alphabetically by name, and the caller groups by stage for display.
/// Only recorded events set a stage; plans stay in the entry count and history
/// but never report a state the thing has not reached.
pub fn list(
    conn: &Connection,
    journey_id: &str,
    kind: Option<&str>,
) -> AppResult<Vec<SubjectSummary>> {
    let mut stmt = conn.prepare(
        "SELECT s.*,
                (SELECT e.stage FROM timeline_events e
                  WHERE e.subject_id = s.id AND e.stage IS NOT NULL
                    AND e.event_state = 'recorded'
                  ORDER BY e.occurred_at DESC, e.seq DESC LIMIT 1) AS current_stage,
                (SELECT e.occurred_at FROM timeline_events e
                  WHERE e.subject_id = s.id
                  ORDER BY e.occurred_at DESC, e.seq DESC LIMIT 1) AS last_event_at,
                (SELECT COUNT(*) FROM timeline_events e
                  WHERE e.subject_id = s.id) AS event_count
           FROM subjects s
          WHERE s.journey_id = ?1
            AND (?2 IS NULL OR s.kind = ?2)
          ORDER BY s.title COLLATE NOCASE",
    )?;

    let rows = stmt
        .query_map(params![journey_id, kind], |row| {
            Ok(SubjectSummary {
                subject: map_subject(row)?,
                current_stage: row.get("current_stage")?,
                last_event_at: row.get("last_event_at")?,
                event_count: row.get("event_count")?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(rows)
}

/// Which registers a Journey has, and how many things are in each.
///
/// Real arithmetic on real rows — "12 papers, 4 positions" — not an invented
/// score (D-007). A register exists through its subjects or an explicit stage-set
/// configuration. The latter remains visible before its first subject, with a
/// truthful zero count, so the event form can offer its configured states.
pub fn kinds(conn: &Connection, journey_id: &str) -> AppResult<Vec<(String, i64)>> {
    let mut stmt = conn.prepare(
        "WITH register_kinds AS (
           SELECT kind FROM subjects WHERE journey_id = ?1
           UNION
           SELECT kind FROM register_stage_sets WHERE journey_id = ?1
         )
         SELECT k.kind, COUNT(s.id) AS total
           FROM register_kinds k
           LEFT JOIN subjects s ON s.journey_id = ?1 AND s.kind = k.kind
          GROUP BY k.kind
          ORDER BY k.kind COLLATE NOCASE",
    )?;
    let rows = stmt
        .query_map(params![journey_id], |row| {
            Ok((row.get("kind")?, row.get("total")?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Stages already used for a kind, most recent first.
///
/// This is the alternative to a vocabulary editor. The user types 投稿 once and
/// it is offered from then on, so a register acquires its own language by being
/// used rather than by being configured first (AGENTS.md §1).
pub fn stages_used(conn: &Connection, journey_id: &str, kind: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT e.stage
           FROM timeline_events e
           JOIN subjects s ON s.id = e.subject_id
          WHERE s.journey_id = ?1 AND s.kind = ?2 AND e.stage IS NOT NULL
          GROUP BY e.stage
          ORDER BY MAX(e.occurred_at) DESC",
    )?;
    let rows = stmt
        .query_map(params![journey_id, kind], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<String>>>()?;
    Ok(rows)
}

/// Tracked things whose name matches `needle`, across every Journey.
///
/// Exists for search. `Cmd+K` searched Journeys and notes only, so a paper the
/// register knows by name was unfindable — the user reported exactly that about
/// `TMM` (D-047). A subject result is the most useful hit of the three, because it
/// opens the thing's whole history rather than one moment in it.
///
/// Journey-scoped ordering is by title: a set of tracked things has no chronology
/// of its own, and the caller shows each one's own stage beside it.
pub fn search(conn: &Connection, needle: &str) -> AppResult<Vec<SubjectSummary>> {
    let needle = needle.trim();
    if needle.is_empty() {
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare(
        "SELECT s.*,
                (SELECT e.stage FROM timeline_events e
                  WHERE e.subject_id = s.id AND e.stage IS NOT NULL
                    AND e.event_state = 'recorded'
                  ORDER BY e.occurred_at DESC, e.seq DESC LIMIT 1) AS current_stage,
                (SELECT e.occurred_at FROM timeline_events e
                  WHERE e.subject_id = s.id
                  ORDER BY e.occurred_at DESC, e.seq DESC LIMIT 1) AS last_event_at,
                (SELECT COUNT(*) FROM timeline_events e
                  WHERE e.subject_id = s.id) AS event_count
           FROM subjects s
          WHERE s.title LIKE '%' || ?1 || '%'
          ORDER BY s.title COLLATE NOCASE",
    )?;

    let rows = stmt
        .query_map(params![needle], |row| {
            Ok(SubjectSummary {
                subject: map_subject(row)?,
                current_stage: row.get("current_stage")?,
                last_event_at: row.get("last_event_at")?,
                event_count: row.get("event_count")?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(rows)
}

/// The stage a subject was at *before* a given moment.
///
/// Used to derive the `from` side of a transition without asking the user for it:
/// filing "TMM · 大修" after "TMM · 投稿" is enough for the card to read
/// `投稿 → 大修`. Takes `occurred_at` and `seq` so it answers "before this event"
/// in the timeline's own order rather than "before now".
pub fn stage_before(
    conn: &Connection,
    subject_id: &str,
    occurred_at: &str,
    seq: i64,
) -> AppResult<Option<String>> {
    let stage = conn
        .query_row(
            "SELECT stage FROM timeline_events
              WHERE subject_id = ?1 AND stage IS NOT NULL AND event_state = 'recorded'
                AND (occurred_at < ?2 OR (occurred_at = ?2 AND seq < ?3))
              ORDER BY occurred_at DESC, seq DESC LIMIT 1",
            params![subject_id, occurred_at, seq],
            |row| row.get(0),
        )
        .ok();
    Ok(stage)
}

#[cfg(all(test, feature = "local-tests"))]
mod tests {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/local-tests/db_subjects.rs"
    ));
}
