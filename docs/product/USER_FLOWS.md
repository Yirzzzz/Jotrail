# Core User Flows

## Flow A — Create a Journey

1. User clicks `+ New Journey`.
2. Minimal form asks for:
   - Name
   - Optional description/intent
   - Optional icon/cover
3. Status defaults to `active`.
4. Start date defaults to now and remains editable.
5. Journey opens directly on its Timeline.
6. Empty-state language invites the user to write or record the first moment; it does not force configuration.

### Acceptance feeling
Creating a Journey should feel closer to opening a new notebook than configuring a database.

---

## Flow B — Write a note and associate it with a Journey

1. User creates a Note from anywhere.
2. User can start writing immediately.
3. Journey association is optional and can happen before or after writing.
4. Saving/autosaving the note persists it locally.
5. If linked to a Journey, the note can appear on that Journey Timeline.
6. `occurred_at` defaults sensibly but can be changed when the note describes a past event.

### Important
Do not show a large metadata form before the editor.

---

## Flow C — Journey Timeline

1. User opens a Journey.
2. Timeline is the default tab.
3. Items are ordered primarily by `occurred_at`.
4. Each entry reveals only enough information for scanning.
5. Clicking an entry opens the full note/task/event without losing Journey context.
6. Right rail provides context such as status, pinned items, upcoming items, and optional views.

---

## Flow D — Record a state change

Example: a user-defined item changes from `Not Ready` to `Ready`.

1. User changes state on a domain object or records an explicit event.
2. Current state updates.
3. Historical transition is appended as an immutable event.
4. Journey Timeline can render the transition as a distinct entry.
5. Previous state remains recoverable.

This pattern should support many domains, not only job search.

---

## Flow E — Task within a Journey

1. User creates a task, optionally from inside a Journey.
2. Task inherits the Journey link when created in Journey context.
3. It appears in Journey Tasks and relevant Today view.
4. On completion, task stores `completed_at`.
5. A timeline event records the completion.
6. Reopening may create another event if history is useful.

---

## Flow F — Reflection

1. User is viewing or creating a timeline event.
2. User may add a short “Why?” / reflection.
3. Reflection is optional.
4. Timeline visually differentiates it as personal context, not system metadata.

---

## Flow G — Global Timeline

1. User opens global Timeline.
2. App shows chronological events from all Journeys plus eligible unscoped events.
3. Each item clearly indicates its Journey when one exists.
4. User can filter by Journey/type/time later; MVP only needs basic filtering.

---

## Flow H — Reopen the app

1. User quits the desktop application.
2. Restarts it.
3. Last open Journey/route may be restored if simple to implement.
4. More importantly, all Notes, Journeys, Tasks, links, and Timeline history are intact.
