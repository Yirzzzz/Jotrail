# Architecture

## 1. Goals

The architecture should optimize for:
- local-first reliability
- fast desktop interaction
- data ownership
- clear domain history
- easy iteration on UI
- replaceable editor implementation
- future custom Journey views without hard-coding one domain

It should NOT optimize for:
- multi-user collaboration
- cloud scale
- plugin marketplace on day one
- generic block databases

## 2. Proposed stack

### Desktop
Tauri 2.

### Frontend
React + TypeScript + Vite.

### Persistence
SQLite stored in the application's local data directory.

Recommended access pattern:
- use the stable Tauri SQLite plugin or a thin Rust command/repository layer
- wrap all SQL behind TypeScript/Rust repository functions
- React components must not contain SQL

### State
Keep local UI state simple.
A small store such as Zustand is acceptable for navigation/editor UI state.
Persistent domain state should come from repositories, not a giant global in-memory store.

### Styling
CSS variables + component classes. Tailwind is acceptable if it supports, rather than replaces, the token system.

### Markdown
Encapsulate editor behind a component contract such as:

```ts
interface MarkdownEditorProps {
  value: string;
  onChange(value: string): void;
  onSave?(): void;
  readOnly?: boolean;
}
```

This allows later replacement without changing Note domain logic.

## 3. Local data location

MVP should use the OS application data directory, for example conceptually:

```text
JourneyNotes/
  journey.sqlite3
  attachments/
  backups/
```

Do not hard-code platform paths.

## 4. Layering

```text
UI components
    ↓
feature hooks / application services
    ↓
domain types + repository interfaces
    ↓
SQLite repository implementation
    ↓
Tauri filesystem / database capability
```

### UI
Responsible for rendering and interaction only.

### Application services
Examples:
- `createNoteAndLogTimeline`
- `completeTaskAndLogTimeline`
- `linkItemToJourney`

These services are useful because a single user action may update a domain object and append history atomically.

### Repositories
Examples:
- `JourneyRepository`
- `NoteRepository`
- `TaskRepository`
- `TimelineRepository`

## 5. Transaction rules

Operations that mutate an object and add a corresponding timeline/history event should occur in one SQLite transaction when possible.

Example task completion:

1. update task status/completed_at
2. insert `timeline_events` row
3. link event to all relevant Journeys
4. commit

This prevents current state and history from diverging.

## 6. Event model

Timeline events are persisted history, not merely transient UI derivations.

Every event has:
- stable id
- `event_type`
- `occurred_at`
- `created_at`
- optional source object
- title/summary/snapshot payload
- zero or more Journey links
- visual importance level
- optional reflection

`occurred_at` controls chronology.
`created_at` tells when the record entered the system.

This distinction allows users to record past experiences today without corrupting the historical timeline.

## 7. Note model

MVP stores Markdown text in SQLite for implementation simplicity and reliable transactions.

Keep the storage layer abstract so a later decision can move note bodies to `.md` files or implement bidirectional export.

Important:
- notes may have zero or multiple Journey links
- do not put `journey_id` directly on the Note as the only relationship

## 8. Search

MVP:
- simple title/content search using SQLite `LIKE` is acceptable for small local datasets

Later:
- SQLite FTS5
- semantic/local AI search only if product needs it

Do not introduce vector DB infrastructure in MVP.

## 9. Autosave

Note editing should autosave with debounce.

Guidance:
- update local editor state immediately
- persist after ~500–1000 ms idle
- expose small saved/saving state
- flush on editor blur/navigation where practical

Avoid creating a new Timeline event for every autosave. Note creation/logging is one event; ordinary text edits are not timeline history by default.

## 10. Timeline creation policy

MVP should create timeline events for:
- explicit event creation
- linking/logging a Note into a Journey
- task completion/reopen if meaningful
- Journey status changes
- future domain-object state transitions

Do not emit noisy events for:
- every keystroke
- every title edit
- UI tab changes
- pin/unpin unless intentionally considered meaningful later

## 11. Attachments

Not required for first vertical slice.
When added:
- store binary files under local app data or selected workspace
- database stores metadata/path/reference
- never store large binary blobs in SQLite unless a strong reason appears

## 12. Export and backup

Not required for first vertical slice, but architecture must not block it.
A later export should be able to produce:
- Markdown notes
- Journey metadata JSON/YAML
- timeline/history JSON or Markdown report
- attachments

## 13. Privacy

Default behavior:
- no telemetry
- no network calls
- no remote AI
- no silent upload

Any future network feature should be explicit and separately permissioned.

## 14. Error handling

The app should fail locally and clearly:
- database migration error: actionable startup error
- save error: visible non-destructive warning
- malformed optional JSON payload: timeline still renders a safe fallback

Never discard user text because metadata parsing failed.
