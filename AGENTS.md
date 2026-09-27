# AGENTS.md — Journey Notes

> This file is the operating contract for coding agents working in this repository.
> Read this file first, then `README.md`, then the documents listed under **Required reading**.

## 1. Product thesis

Journey Notes is a **local-first desktop note-taking application for recording personal development over time**.

The product is NOT primarily a task manager, CRM, career tracker, finance dashboard, or Notion clone.
The note is the primary writing object. A **Journey** is a user-created thematic timeline that collects notes, tasks, events, and state changes over time.

Examples of Journeys:
- 秋招 2026
- VLA 学习
- 论文修改
- 健身
- 存钱买车
- 旅行计划
- Any user-defined long-running theme

A job-search Journey may contain positions, skills, interviews, and preparation, but those are **examples of custom views/domain objects**, not hard-coded global product structure.

### The core product loop

`Capture something -> optionally associate it with a Journey -> record meaningful changes as events -> render the Journey as a readable Timeline.`

The strongest product promise is:

> The user writes notes and lives their life; the application quietly preserves how things developed.

## 2. Non-negotiable product principles

1. **Notes first.** Writing must always feel easier than data entry.
2. **Journey is generic.** Never make the core domain specific to recruiting, study, fitness, finance, or any single use case.
3. **Timeline is the default Journey view.** It tells the story of how the Journey evolved.
4. **Global Timeline and Journey Timeline are different scopes of the same event model.**
5. **Do not force fake progress percentages onto life.** Prefer statuses, milestones, evidence, state transitions, and dates.
6. **Progressive disclosure.** Large amounts of data may exist, but only the relevant layer should be visible at once.
7. **Quiet interface.** Avoid dashboard overload, dense card grids, rainbow category colors, or enterprise-management aesthetics.
8. **Local-first and private by default.** MVP has no account, cloud dependency, telemetry, or automatic network AI calls.
9. **History matters.** State changes should be preserved as history rather than overwriting the past silently.
10. **Generic core, extensible edges.** Career-specific or finance-specific experiences should be templates/custom views built on top of the generic Journey model.

## 3. Required reading

Before changing product behavior or architecture, read:

1. `README.md`
2. `docs/product/PRODUCT_SPEC.md`
3. `docs/product/USER_FLOWS.md`
4. `docs/design/UX_SPEC.md`
5. `docs/design/STYLE_TOKENS.md`
6. `docs/architecture/ARCHITECTURE.md`
7. `docs/architecture/DATA_MODEL.md`
8. `docs/implementation/MVP_PLAN.md`
9. `docs/implementation/ACCEPTANCE.md`
10. `docs/DECISIONS.md`

Primary visual reference:

`docs/design/reference/journey-timeline-primary.png`

Secondary references are exploratory only. When they conflict with the primary reference or written specs, follow the primary reference + written specs.

## 4. Default implementation stack

Unless the repository already contains a working alternative, use:

- Tauri 2 desktop shell
- React + TypeScript + Vite frontend
- SQLite for persistent local structured data
- Tauri SQL/database layer or a small Rust repository layer
- CSS variables/design tokens + utility classes; Tailwind is acceptable if it does not obscure the design system
- Lucide-style outline icons or equivalent open icon set
- Vitest for frontend unit tests
- Rust tests for domain/repository logic where useful

Do not introduce a server, remote database, authentication, analytics, or sync service for the MVP.

### Editor strategy

The architecture must allow the Markdown editor implementation to be replaced later.
For the first vertical slice, prioritize reliable Markdown authoring/autosave over perfect Typora-style WYSIWYG behavior.
A CodeMirror-class editor + rendered Markdown view is acceptable for MVP. Do not block Journey/Timeline development on editor perfection.

## 5. Suggested source layout

Use this unless the scaffold strongly suggests a better equivalent:

```text
src/
  app/
  components/
  features/
    journeys/
    notes/
    tasks/
    timeline/
    capture/
  db/
  domain/
  hooks/
  styles/
  lib/
  test/
src-tauri/
  src/
    commands/
    db/
    domain/
  migrations/
```

Feature code should depend on shared domain primitives; career-specific language must not leak into generic Journey components.

## 6. Domain rules

### Journey
A Journey is user-created and contains:
- title
- optional description / personal intent
- start date
- status (`planning`, `active`, `paused`, `completed`, `archived`)
- optional icon/cover
- linked content

### Note
A Note is the primary writing object:
- Markdown body
- title
- timestamps
- optional Journey links
- optional tags/type metadata

Notes may exist without a Journey.
A note may eventually belong to multiple Journeys; do not design the schema in a way that makes this impossible.

### Task
A task is lightweight and can be linked to zero or more Journeys.
Completing/reopening/changing important task state should be capable of producing a timeline event.

### Event / Timeline entry
A timeline event represents something meaningful that happened at a time:
- note created / intentionally logged
- explicit event recorded
- task completed
- status changed
- milestone reached
- state transition

The Timeline is not just “sort all database rows by created_at”. Preserve `occurred_at` separately from `created_at`.

### State history
Never silently destroy meaningful historical state. Example:

`Not Ready -> Ready -> Applied`

should be recoverable as a sequence of events.

## 7. UI rules

### Overall
- Desktop-first.
- Calm, editorial, personal.
- Light theme remains the primary design reference. Dark mode is implemented as a
  second token block (`[data-theme='dark']` in `src/styles/tokens.css`); keep both
  working, and never hard-code a colour in a component.
- Use whitespace, typography, separators, alignment, and subtle surfaces before adding cards.
- One restrained accent family; semantic states may use muted supporting colors.
- Avoid saturated gradients and gamified visuals.

### Layout
Primary Journey screen has three conceptual regions:
1. left navigation sidebar
2. main reading/timeline column
3. contextual right rail

The right rail may collapse at narrower desktop widths.

### Journey header
Show:
- Journey name
- date range
- optional statement/intent
- status
- navigation tabs

Do NOT lead with stats like “42 notes / 67% complete”.

### Timeline
Timeline is readable, chronological, and visually varied by importance:
- compact activity row
- note excerpt
- task group
- state transition
- milestone
- reflection

Not every event should become a large card.

### Context rail
Good content:
- about
- status
- focus
- pinned notes
- upcoming items
- optional custom views

Bad default content:
- vanity metrics
- arbitrary progress percentages
- a dozen charts

## 8. Coding standards

- TypeScript strict mode.
- Prefer explicit domain types over `any` or ad-hoc JSON in UI code.
- Keep persistence concerns outside presentational components.
- Keep functions small and intention-revealing.
- Prefer boring, maintainable code over clever abstractions.
- Avoid premature plugin architecture.
- Avoid premature generic “everything is a block” architecture.
- Add database migrations rather than editing production schema destructively.
- All user-visible dates must be timezone-safe.
- Store machine timestamps in UTC; render in local time.
- Preserve an explicit `occurred_at` for timeline chronology.

## 9. UX quality bar

When implementing from the reference image:
- Match composition and visual hierarchy, not every generated-image pixel.
- Use real text components, not screenshots baked into UI.
- Use responsive constraints so the app still works at common laptop widths.
- Do not fill every empty area just because space exists.
- Hover/selection/focus states must be subtle and consistent.
- Keyboard navigation matters: `Cmd/Ctrl+K` search, `Cmd/Ctrl+N` capture/new note are desired patterns.

## 10. Workflow for agents

For each substantial task:

1. Read the relevant specs.
2. State the smallest coherent vertical slice you will implement.
3. Inspect existing code before adding a new abstraction.
4. Implement the slice end-to-end.
5. Run formatting, typecheck, tests, and build/dev checks that are available.
6. Fix failures caused by your changes.
7. Update `docs/implementation/STATUS.md` with completed work, known limitations, and the next logical step.

Do not claim something is complete if it has not been run or tested.

## 11. Current implementation priority

The first working vertical slice should prove the core thesis:

1. app shell matching the Journey reference
2. create/open a Journey
3. create a Markdown Note
4. link the Note to a Journey
5. show it in that Journey's Timeline
6. create/complete a Task linked to the Journey
7. record the completion as a Timeline event
8. persist everything across app restart

Only after this works should the agent expand into custom views such as Positions, Skills, Finance, or Fitness.

## 12. Hard “do not” list

Do not:
- turn the app into a hard-coded job hunting tracker
- make Career, Positions, Skills, Finance, etc. top-level mandatory modules
- require metadata forms before a user can write
- build cloud sync before local persistence is reliable
- build an AI assistant before the underlying timeline/event model is correct
- make the home page a KPI dashboard
- use a kanban as the main product metaphor
- implement a generic block editor before proving the Journey loop
- overengineer a plugin system in MVP

If a requested change conflicts with the product thesis, note the conflict in `docs/DECISIONS.md` before implementing it.
