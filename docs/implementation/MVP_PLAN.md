# MVP Plan

The implementation should prove the product thesis with the smallest coherent vertical slice before expanding scope.

## Milestone 0 — Repository and desktop shell

### Goal
A clean, runnable Tauri 2 + React + TypeScript application with formatting/typecheck/test scripts and basic navigation shell.

### Deliverables
- desktop app boots in dev mode
- app-level design tokens
- sidebar/main/context layout primitives
- routes/placeholders for Today, Notes, Timeline, Journeys
- no backend/cloud/auth

### Do not do yet
- custom view engine
- AI
- finance import
- career CRM logic
- graph view

---

## Milestone 1 — Primary Journey screen, fixture-driven

### Goal
Reproduce the visual hierarchy of the primary product reference with static/demo data first.

### Deliverables
- Journey header
- tabs
- month/date timeline layout
- multiple timeline entry variants
- contextual right rail
- sidebar Journey list
- responsive desktop behavior

### Why fixture-first
It separates visual/product validation from persistence complexity and prevents backend decisions from degrading the core screen.

---

## Milestone 2 — Local persistence

### Goal
Persist the generic core domain in SQLite.

### Deliverables
- schema migrations
- repository layer
- Journey CRUD
- Note CRUD
- Task CRUD
- Journey links
- Timeline events
- dev seed only when DB is empty

### Required test
Create data, restart app, confirm data remains.

---

## Milestone 3 — Notes-first writing flow

### Goal
Make the product genuinely usable as a notebook.

### Deliverables
- create/open/edit Note
- Markdown editing
- autosave
- save-state feedback
- optional Journey association
- basic note list/search

### Guardrail
Metadata must not stand between the user and writing.

---

## Milestone 4 — Automatic Journey Timeline

### Goal
Prove the defining loop.

### Deliverables
- link/log Note into Journey
- create timeline event with `occurred_at`
- Journey Timeline queries persisted events
- Timeline item opens source Note
- explicit reflection support
- global Timeline foundation using same event records

### Required demonstration
A note written today but assigned an earlier `occurred_at` appears at the correct historical point.

---

## Milestone 5 — Tasks and history

### Goal
Prove that non-note activity can enrich a Journey without turning it into a task manager.

### Deliverables
- lightweight Task creation
- Journey-linked Tasks view
- due/completion state
- completing a task persists a `task_completed` timeline event
- Today can show relevant tasks

---

## Milestone 6 — Polish the core loop

### Goal
Make the first vertical slice pleasant enough for daily personal use.

### Deliverables
- quick create (`Cmd/Ctrl+N`)
- command/search shell (`Cmd/Ctrl+K`)
- empty states
- keyboard/focus behavior
- pinning in Journey context rail
- better event density variants
- error/save states

---

# Post-MVP backlog

Only after the above loop works reliably:

1. Journey templates
2. Custom views / domain objects
3. Job Search template (Positions, Skills, Interviews)
4. Fitness template
5. Finance/transaction view and import
6. Markdown/file export
7. backups
8. dark theme
9. richer editor/WYSIWYG
10. local AI-assisted review or natural-language capture
11. optional sync

# First implementation slice Codex should complete

The initial autonomous coding pass should target Milestones 0–4 as one connected demo where practical, but stop adding breadth once the following path works:

```text
Launch app
 -> Open seeded Journey
 -> Create new Journey
 -> Create Note
 -> Link Note to Journey
 -> Note appears on Timeline
 -> Restart app
 -> Timeline remains intact
```
