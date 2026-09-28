//! Domain types shared with the frontend. Field names serialise to camelCase so
//! the TypeScript types in `src/domain` can mirror these one-for-one.
//!
//! `event_type` is deliberately a free-form `String`: the timeline must stay
//! extensible for future domain objects. Statuses and importance *are* enums,
//! because those are closed sets the database also constrains with CHECK.

use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSqlOutput, ValueRef};
use rusqlite::ToSql;
use serde::{Deserialize, Serialize};

macro_rules! sql_enum {
    ($name:ident { $($variant:ident => $text:literal),+ $(,)? }) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
        #[serde(rename_all = "snake_case")]
        pub enum $name {
            $($variant,)+
        }

        impl $name {
            pub fn as_str(self) -> &'static str {
                match self {
                    $(Self::$variant => $text,)+
                }
            }

            pub fn parse(value: &str) -> Option<Self> {
                match value {
                    $($text => Some(Self::$variant),)+
                    _ => None,
                }
            }
        }

        impl ToSql for $name {
            fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
                Ok(ToSqlOutput::from(self.as_str()))
            }
        }

        impl FromSql for $name {
            fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
                let raw = value.as_str()?;
                Self::parse(raw).ok_or_else(|| FromSqlError::Other(
                    format!("unknown {} value `{raw}`", stringify!($name)).into(),
                ))
            }
        }
    };
}

sql_enum!(JourneyStatus {
    Planning => "planning",
    Active => "active",
    Paused => "paused",
    Completed => "completed",
    Archived => "archived",
});

sql_enum!(TaskStatus {
    Todo => "todo",
    Doing => "doing",
    Done => "done",
    Cancelled => "cancelled",
});

sql_enum!(TimelineImportance {
    Compact => "compact",
    Normal => "normal",
    Milestone => "milestone",
});

// Whether a timeline entry is a record or a commitment. `Planned` means the user
// intends it and nothing has happened yet; `Recorded` means it happened, at
// `occurred_at`. Explicit rather than derived from the date, so a deadline that
// passes unmet does not silently become history (migration 0005).
sql_enum!(TimelineEventState {
    Planned => "planned",
    Recorded => "recorded",
});

sql_enum!(LinkTargetType {
    Note => "note",
    Task => "task",
    Event => "event",
    CustomObject => "custom_object",
});

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Journey {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: JourneyStatus,
    pub icon: Option<String>,
    pub cover_path: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Sidebar/timeline badge form of a journey — enough to render context without
/// loading the whole record.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JourneyRef {
    pub id: String,
    pub title: String,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub body_md: String,
    pub note_type: String,
    pub occurred_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteWithLinks {
    #[serde(flatten)]
    pub note: Note,
    pub journeys: Vec<JourneyRef>,
    pub pinned_in: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub details_md: Option<String>,
    pub status: TaskStatus,
    pub due_at: Option<String>,
    pub completed_at: Option<String>,
    /// What produced this task — an event that revealed work to do, for
    /// instance. Free-form for the same reason `event_type` is.
    pub origin_type: Option<String>,
    pub origin_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskWithLinks {
    #[serde(flatten)]
    pub task: Task,
    pub journeys: Vec<JourneyRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEvent {
    pub id: String,
    pub event_type: String,
    pub title: String,
    pub summary: Option<String>,
    pub reflection: Option<String>,
    /// Drives chronology.
    pub occurred_at: String,
    /// Records when the row entered the system; never used for ordering.
    pub created_at: String,
    pub source_type: Option<String>,
    pub source_id: Option<String>,
    pub importance: TimelineImportance,
    pub payload_json: Option<String>,
    /// Whether this is a record of something that happened, or a commitment
    /// still ahead of the user (migration 0005).
    pub event_state: TimelineEventState,
    /// The date a planned event is aimed at. Kept after confirmation, so
    /// "the deadline was the 12th, I submitted on the 10th" stays readable
    /// instead of the target being overwritten by the outcome.
    pub planned_for: Option<String>,
    /// The thing this event is *about* — a paper, a position, a film (migration
    /// 0006). Distinct from `source_*`, which records what *produced* the event.
    pub subject_id: Option<String>,
    /// The stage that thing reached: 投稿, 拒稿, 一面. Free-form; a register reads
    /// a subject's current stage off its most recent event.
    ///
    /// `stage`, not `state`: this type already has `event_state`, and the schema
    /// has two `status` columns plus a `state_changed` payload. A fifth spelling
    /// of the same word would be unreadable.
    pub stage: Option<String>,
}

/// A thing a Journey keeps track of, and the unit a register lists.
///
/// Deliberately thin: a name and a kind. No custom fields, no schema — those are
/// DATA_MODEL.md §9's EAV tables, which §4 of the same document argues against
/// before real extension needs are proven. What makes it general is that `kind`
/// is free-form: `paper`, `position`, `film`, all without a code change.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subject {
    pub id: String,
    /// One Journey, by decision — unlike notes and tasks, which are many-to-many
    /// through `journey_links`.
    pub journey_id: String,
    pub kind: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

/// A subject with everything a register row needs, all of it derived from events
/// rather than stored a second time.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectSummary {
    #[serde(flatten)]
    pub subject: Subject,
    /// The `stage` of the most recent event about it, or `None` when nothing has
    /// been recorded yet. Never stored on the row: a cached current state that
    /// can disagree with its own history is worse than a join.
    pub current_stage: Option<String>,
    /// Display name of the legacy category, resolved through this subject's register.
    #[serde(default)]
    pub stage_category_name: Option<String>,
    /// When that most recent event happened.
    pub last_event_at: Option<String>,
    /// How many events are on record — evidence of movement, not a score.
    pub event_count: i64,
    #[serde(default)]
    pub classifications: Vec<EventClassification>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEntry {
    #[serde(flatten)]
    pub event: TimelineEvent,
    pub journeys: Vec<JourneyRef>,
    /// Tasks this event produced. Rendered inside the entry, so the work an
    /// event revealed reads as part of it rather than as unrelated rows.
    pub tasks: Vec<TaskWithLinks>,
    /// The tone of this entry's `stage`, when its register has a set naming it.
    ///
    /// Derived rather than stored: the colour belongs to the *stage set*, so an
    /// entry that cached it would go stale the moment the set was recoloured.
    /// Resolved here rather than in the frontend because the join runs from the
    /// event through its subject to the register's set, which is three tables the
    /// UI has no business knowing about.
    pub stage_tone: Option<String>,
    #[serde(default)]
    pub stage_category_name: Option<String>,
    /// Attachment metadata only; originals and thumbnails load on demand.
    #[serde(default)]
    pub images: Vec<EventImage>,
    #[serde(default)]
    pub classifications: Vec<EventClassification>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventImage {
    pub id: String,
    pub event_id: String,
    pub file_name: String,
    pub mime_type: String,
    pub byte_size: u64,
    pub width: u32,
    pub height: u32,
}

/// An ordered attachment list is either retained IDs or new local bytes. IDs
/// may only refer to images already owned by the event being edited.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged, deny_unknown_fields)]
pub enum EventImageInput {
    Existing {
        id: String,
    },
    New {
        #[serde(rename = "fileName")]
        file_name: String,
        #[serde(rename = "dataBase64")]
        data_base64: String,
    },
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventImageVariant {
    Thumbnail,
    Original,
}

// ---------------------------------------------------------------------------
// Command inputs
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewJourney {
    pub title: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub started_at: Option<String>,
    pub status: Option<JourneyStatus>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JourneyPatch {
    pub title: Option<String>,
    /// `Some(None)` clears the field; `None` leaves it untouched.
    #[serde(default, with = "double_option")]
    pub description: Option<Option<String>>,
    pub icon: Option<String>,
    pub started_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewNote {
    pub title: Option<String>,
    pub body_md: Option<String>,
    pub note_type: Option<String>,
    pub occurred_at: Option<String>,
    /// When present, the note is linked and logged to this journey in the same
    /// transaction that creates it.
    pub journey_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotePatch {
    pub title: Option<String>,
    pub body_md: Option<String>,
    #[serde(default, with = "double_option")]
    pub occurred_at: Option<Option<String>>,
    pub note_type: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewTask {
    pub title: String,
    pub details_md: Option<String>,
    pub due_at: Option<String>,
    pub journey_id: Option<String>,
    /// Set when the task comes from something — currently an event. A task with
    /// an origin does not record its own "added" entry, because whatever it came
    /// from is already on the timeline saying so.
    pub origin_type: Option<String>,
    pub origin_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewTimelineEvent {
    pub event_type: Option<String>,
    pub title: String,
    pub summary: Option<String>,
    pub reflection: Option<String>,
    pub occurred_at: Option<String>,
    pub importance: Option<TimelineImportance>,
    pub journey_ids: Option<Vec<String>>,
    /// An optional state transition, e.g. readiness `not_ready` -> `ready`.
    ///
    /// Present when the user is recording that something *changed* rather than
    /// simply happened. Stored as the event's `payload_json`, which is what makes
    /// the transition readable back out of history instead of being buried in
    /// prose.
    pub state: Option<StateChange>,
    /// To-dos the event comes with. Created with the event in one transaction
    /// and linked back to it, so "the interview showed me three gaps" is
    /// recorded as one act.
    ///
    /// Carries a due date as well as a title, because this is meant to be the
    /// *same* unit as the Today task composer rather than a reduced version of
    /// it — and a due date is what puts the item into "Up next".
    pub tasks: Option<Vec<NewEventTask>>,
    /// Records a commitment instead of a fact: a deadline, a booked date, an
    /// intention. `occurred_at` then means "aimed at", and the entry stays
    /// visibly unconfirmed until the user says it happened.
    #[serde(default)]
    pub planned: bool,
    /// The thing this event is about, when the user picked one. Optional, and it
    /// must stay optional: AGENTS.md §1 requires that recording stays easier
    /// than filing, so an event never needs a subject to be written.
    pub subject_id: Option<String>,
    /// The stage that subject reached. Only meaningful alongside `subject_id`.
    pub stage: Option<String>,
    /// A thing to start tracking, named here rather than picked from the register.
    ///
    /// Created inside the same transaction as the event and filed onto it, so
    /// `stage` applies exactly as it would to a `subject_id`. Ignored when
    /// `subject_id` is set — that already names a thing.
    pub new_subject: Option<NewEventSubject>,
    pub images: Option<Vec<EventImageInput>>,
    pub classifications: Option<Vec<EventClassificationInput>>,
}

/// A thing to start tracking *while* recording the event that is about it.
///
/// The first event about something is the moment it becomes worth tracking: a
/// paper exists, as far as the notebook is concerned, once it has been submitted
/// somewhere. Requiring the row first meant leaving the dialog, creating it in the
/// register, and coming back — four steps to write down one moment (D-049).
///
/// It joins the event's **first** Journey, because a subject belongs to exactly
/// one, and that is also the Journey the subject guard checks against.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewEventSubject {
    /// Which register it joins — the user's own word: 论文, 岗位, 电影.
    pub kind: String,
    pub title: String,
}

/// Correcting an event that was already recorded.
///
/// Deliberately smaller than `NewTimelineEvent`: only what a user can get wrong
/// about a moment they already described — its wording and when it happened.
/// Weight, journeys, the tracked transition and the to-dos it revealed are all
/// left out, so an edit cannot quietly restructure history (DECISIONS.md D-040).
/// An images-only patch is also allowed on explicit events of any weight, while
/// their historical wording and dates stay protected (D-062).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEventPatch {
    pub title: Option<String>,
    /// `Some(None)` clears the field; `None` leaves it untouched.
    #[serde(default, with = "double_option")]
    pub summary: Option<Option<String>>,
    #[serde(default, with = "double_option")]
    pub reflection: Option<Option<String>>,
    pub occurred_at: Option<String>,
    /// Filing an existing event onto a subject, or moving it off one.
    ///
    /// Included here — unlike weight, journeys and the to-dos an event revealed,
    /// which D-040 keeps out of an edit — because filing is a *correction of an
    /// association*, the same reasoning D-016 applies to note links. It is also
    /// how a notebook written before registers existed gets organised, one entry
    /// at a time, without re-recording anything.
    #[serde(default, with = "double_option")]
    pub subject_id: Option<Option<String>>,
    #[serde(default, with = "double_option")]
    pub stage: Option<Option<String>>,
    /// Omitted preserves attachments; an empty list removes them all.
    pub images: Option<Vec<EventImageInput>>,
    /// Only named categories change; an empty option list explicitly clears one.
    pub classifications: Option<Vec<EventClassificationInput>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewSubject {
    pub journey_id: String,
    pub kind: String,
    pub title: String,
}

/// A named, reusable set of stages — 「面试流程」, 「观影」.
///
/// Global rather than per-Journey, which is the point of it existing: the set is
/// defined once and picked again by next year's Journey. What it is *not* is a
/// workflow, and not a display order either — see `0007_stage_sets.sql`. A stage
/// says what something *is now*, so the set is a vocabulary of labels and their
/// colours, carrying neither transitions nor positions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageSet {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

/// One stage in a set.
///
/// `label` is the user's own word and is also the value written to
/// `timeline_events.stage`, so a set can be attached to a register that already
/// has hand-typed stages and they line up without a data migration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageOption {
    pub id: String,
    pub set_id: String,
    pub label: String,
    /// A tone *name* from a closed list, never a colour. See `StageTone`.
    pub tone: String,
    /// Insertion order, and nothing more. Not a display order: the register
    /// groups by recency of movement and the Overview's cross-section by count.
    /// Kept only so a set re-reads in a stable order.
    pub position: i64,
    #[serde(default)]
    pub usage_count: i64,
}

/// A set with its stages, which is how every caller wants it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageSetWithOptions {
    #[serde(flatten)]
    pub set: StageSet,
    pub options: Vec<StageOption>,
    /// How many registers use it. Shown before a delete, which would otherwise
    /// silently strip order and colour from every register pointing here.
    pub register_count: i64,
}

/// The stages allowed for a `tone`.
///
/// A closed list, and that is the whole design decision: the user picks a
/// *meaning* and the stylesheet owns the colour. A colour picker would put a hex
/// literal in the database, which is `AGENTS.md` §7's "never hard-code a colour
/// in a component" with extra steps, and nothing would keep it legible on the
/// page or above 4.5:1.
///
/// Six, deliberately: enough to separate the stages of a real register, few
/// enough that the page does not become the rainbow of category colours
/// `UX_SPEC.md` warns against.
pub const STAGE_TONES: [&str; 6] = [
    "neutral", "channel", "warm", "positive", "caution", "negative",
];

/// Creating a set, with its stages in one call.
///
/// One call rather than create-then-add-each because a set with no stages is not
/// useful and should not be reachable: `stage_options` is where the vocabulary
/// lives, so an empty set is an empty register description.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewStageSet {
    pub name: String,
    pub options: Vec<NewStageOption>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewStageOption {
    pub label: String,
    /// Defaults to `neutral` when absent, so a set can be typed without ever
    /// opening the palette.
    #[serde(default)]
    pub tone: Option<String>,
}

/// Renaming a set, or replacing its stages wholesale.
///
/// `options`, when present, is the set's complete new list — but each entry
/// carries the id of the row it replaces, when it has one. That distinction is
/// load-bearing: an entry *with* an id whose label changed is a **rename**, and a
/// rename has to reach the events that already stored the old label, or every
/// thing recorded at 一面 silently falls out of a set that now says 第一轮.
/// An entry with no id is a new stage. An id that stops appearing is dropped.
///
/// Without ids the two cases are indistinguishable, which is the same
/// value-as-key problem `Subject` exists to solve for names (0006).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageSetPatch {
    pub name: Option<String>,
    pub options: Option<Vec<StageOptionPatch>>,
    pub replacements: Option<Vec<OptionReplacement>>,
}

/// One entry in a set's new list. See `StageSetPatch::options`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageOptionPatch {
    /// The existing row this entry is, when it is an existing one.
    pub id: Option<String>,
    pub label: String,
    #[serde(default)]
    pub tone: Option<String>,
}

/// How many subjects sit at each stage of a register.
///
/// Counts, never percentages (D-007). Every stage of the set appears, including
/// the ones with nothing at them — a zero is a real answer, and it is the reason
/// the set had to become rows rather than `SELECT DISTINCT`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageTally {
    pub label: String,
    pub tone: String,
    pub count: i64,
    /// True when this stage is recorded on events but is *not* in the register's
    /// set — a stage typed before the set existed, or left behind by a rename.
    ///
    /// Surfaced rather than hidden: dropping these rows would make the counts
    /// add up to less than the register and quietly lose things the user
    /// recorded. It renders untoned and last.
    pub off_set: bool,
}

/// One register's cross-section: how many things sit at each stage.
///
/// The unit the Journey Overview renders. Whole registers rather than one stage
/// at a time, because the honest denominator is the register — "9 papers" — and
/// a stage count without it is the free-floating metric D-007 refuses.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterTally {
    pub kind: String,
    /// The set's name, when the register has one attached.
    pub set_name: Option<String>,
    pub stages: Vec<StageTally>,
    /// Things with nothing recorded about them yet. A real state, kept separate
    /// from the stages rather than invented as one.
    pub unstaged: i64,
    pub total: i64,
}

/// Renaming a subject, which is the whole reason it is a row and not a string.
///
/// Free-text grouping would split a thing's history the moment its name changed;
/// here the id is stable and the events keep pointing at it. `kind` can change
/// too, which moves it between registers.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectPatch {
    pub title: Option<String>,
    pub kind: Option<String>,
}

/// Confirming that a planned event actually happened.
///
/// Separate from `TimelineEventPatch` because it is a different act: the patch
/// corrects how a moment is described, this one changes what the entry *is* —
/// from something intended to something on the record. Doing it in one command
/// keeps the state flip and the real date atomic, so an entry can never be
/// "recorded" while still dated at its deadline.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmPlannedEvent {
    /// When it actually happened. Defaults to now, which is the common case;
    /// editable because a deadline is often met a few days early.
    pub occurred_at: Option<String>,
    /// An optional rewording, because what was planned as "投稿 ICLR 2027" is
    /// often better recorded as "投稿 ICLR 2027 完成". Saves a second dialog.
    pub title: Option<String>,
    /// The thing this turned out to be about. `Some(None)` unfiles it; `None`
    /// leaves whatever the plan already carried.
    ///
    /// Confirming is the moment a plan becomes a fact, which is exactly when a
    /// stage becomes true — so this is the same question `NewTimelineEvent` asks,
    /// asked at the other moment it applies (DECISIONS.md D-051).
    #[serde(default, with = "double_option")]
    pub subject_id: Option<Option<String>>,
    /// A thing to start tracking, named at the moment it turns out to matter.
    /// Mutually exclusive with `subject_id`, same as on `NewTimelineEvent`.
    pub new_subject: Option<NewEventSubject>,
    /// The stage it reached. `Some(None)` clears it; `None` leaves it.
    #[serde(default, with = "double_option")]
    pub stage: Option<Option<String>>,
    pub images: Option<Vec<EventImageInput>>,
    pub classifications: Option<Vec<EventClassificationInput>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateCategory {
    pub id: String,
    pub journey_id: String,
    pub name: String,
    pub selection_mode: String,
    pub options: Vec<StateCategoryOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateCategoryOption {
    pub id: String,
    pub label: String,
    pub tone: String,
    pub usage_count: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewStateCategory {
    pub journey_id: String,
    pub name: String,
    pub selection_mode: String,
    pub options: Vec<NewStageOption>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateCategoryPatch {
    pub name: Option<String>,
    pub options: Option<Vec<StageOptionPatch>>,
    pub replacements: Option<Vec<OptionReplacement>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionReplacement {
    pub from_option_id: String,
    pub to_option_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventClassificationInput {
    pub category_id: String,
    pub option_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventClassification {
    pub category_id: String,
    pub category_name: String,
    pub selection_mode: String,
    pub options: Vec<ClassifiedOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassifiedOption {
    pub id: String,
    pub label: String,
    pub tone: String,
}

/// One to-do recorded alongside an event.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewEventTask {
    pub title: String,
    pub due_at: Option<String>,
}

/// A recorded transition. `field` names what changed ("readiness",
/// "capability"); `subject` names *whose* it is, so several tracked states can
/// live in one journey.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateChange {
    pub field: String,
    pub from: Option<String>,
    pub to: String,
    pub subject: Option<String>,
}

/// Distinguishes "field absent" from "field explicitly set to null" in patches,
/// so clearing a description is possible without a separate command.
mod double_option {
    use serde::{Deserialize, Deserializer};

    pub fn deserialize<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
    where
        D: Deserializer<'de>,
        T: Deserialize<'de>,
    {
        Option::<T>::deserialize(deserializer).map(Some)
    }
}

#[cfg(all(test, feature = "local-tests"))]
mod tests {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/local-tests/domain.rs"
    ));
}
