# Product Spec — Journey Notes

## 1. Product definition

Journey Notes is a desktop notebook for people who want to record not only information, but also **how parts of their life develop over time**.

The user creates Notes as usual. They can optionally associate notes, tasks, events, and other structured items with one or more Journeys. A Journey then becomes a readable chronological record of that theme.

The product is best described as:

> A local-first personal development notebook where every long-running theme can become its own timeline.

## 2. Core vocabulary

### Note
The primary writing object. Markdown-oriented, fast to create, easy to edit, useful even without any metadata.

### Journey
A user-created thematic space spanning time.

Examples:
- 秋招 2026
- VLA 学习
- 论文修改
- 健身
- 存钱买车
- 旅行计划

A Journey is not necessarily a project and may have no fixed completion percentage or deadline.

### Timeline
A chronological narrative of meaningful events within a Journey or across the whole app.

### Task
A lightweight action item. Tasks may be linked to a Journey, and meaningful transitions such as completion may appear on its Timeline.

### Event
A meaningful occurrence with an explicit `occurred_at` time. Events may be user-created or generated from changes to other objects.

### Reflection
A short personal explanation attached to an event or moment: “why I did this”, “what I learned”, “why I changed direction”. Reflections are especially valuable when looking back later.

### Custom View
A later-stage view tailored to the nature of a Journey: Positions/Skills for job search, Metrics/Workouts for fitness, Papers/Experiments for research, etc. Custom views are not the generic core.

## 3. Product mental model

Traditional note apps emphasize:

`Note -> Folder -> Folder`

Journey Notes adds:

`Thing -> Relation -> Time`

and, at product level:

`Everything -> Journey -> Timeline`

A user should be able to write normally while the app quietly accumulates context and history.

## 4. Core user need

A user often wants to answer questions such as:

- What was I focused on three months ago?
- Why did I start learning this skill?
- What changed between when I first considered an opportunity and when I acted on it?
- What did I learn during this period?
- What did I once think I was not ready for, and when did that change?
- How did a project, goal, habit, or life theme evolve?

Conventional notes preserve snapshots. Journey Notes should preserve **development**.

## 5. Example: job search Journey

This is an example, not the product's universal schema.

Journey: `秋招 2026`

Possible timeline:

- Aug 25 — Save ByteDance VLA role; reflection: not ready because ROS2/C++ are weak.
- Aug 26 — Note: learn ROS2 Action.
- Aug 28 — Skill state changes from Basic to Intermediate, supported by evidence.
- Sep 05 — Revisit position; Not Ready -> Ready.
- Sep 09 — Prepare application.
- Sep 12 — Applied.
- Later — Interview note; new gaps discovered; new tasks created.

The value is not merely tracking application status. The value is being able to look back and understand the user's changing capabilities and decisions.

## 6. Example: VLA learning Journey

Journey: `VLA 学习`

Timeline may contain:

- paper reading notes
- model reproductions
- experiments
- questions
- milestones
- new concepts learned
- changes in understanding

## 7. Example: fitness Journey

Journey: `健身`

Timeline may contain:

- first session
- training notes
- measurements
- milestones
- setbacks
- reflections

No career-specific schema should be required.

## 8. Primary screens

### Today
A calm daily entry point showing what matters today, not a KPI dashboard.

Potential content:
- today's tasks/events
- recent notes
- current focus Journeys
- optional daily journal/reflection

### Notes
Global note library/search/editor.

### Timeline
Global chronological view across all Journeys and unscoped events.

### Journeys
List of user-created Journeys.

### Journey detail
The product-defining page. Default tab: Timeline.

Suggested tabs:
- Timeline
- Notes
- Tasks
- Overview
- optional custom views

## 9. Journey detail behavior

A Journey header may show:
- name
- date range
- status
- short description/intent
- optional cover/icon

Timeline displays varying item forms based on meaning:
- tiny activity row
- note excerpt
- task group
- state change
- reflection
- milestone

The Timeline should feel like an editorial record, not a database table.

## 10. The role of Overview

Overview is secondary, for deliberate review.
It may summarize:
- current focus
- recent development
- open tasks
- milestones
- custom domain summaries

Do not make Overview the default because the product is about lived chronology, not static metrics.

## 11. Capture philosophy

The fastest interaction should be:

`write first -> structure later`

Desired shortcuts eventually:
- `Cmd/Ctrl+N` quick capture / new note
- `Cmd/Ctrl+K` command/search

Natural-language capture can be explored later, but must not be required for MVP.

## 12. MVP scope

Must have:
- local desktop app
- Journey CRUD
- Note CRUD with Markdown
- optional Note -> Journey links
- Task CRUD with optional Journey links
- event/history model
- Journey Timeline
- global Timeline foundation
- persistence across restart
- polished primary Journey screen
- basic search/navigation

Nice after core loop:
- pinned items
- Journey upcoming items
- richer milestone/reflection entry types
- custom views/templates
- export/import
- ~~dark mode~~ — done; light, dark and follow-the-OS (DECISIONS.md D-027)

## 13. Explicit non-goals for MVP

- team collaboration
- account/login
- cloud sync
- mobile app
- full accounting import
- full recruiting CRM
- complex habit tracker
- full plugin marketplace
- AI assistant
- graph view
- perfect Notion-style block editor
- perfect Typora-style WYSIWYG Markdown

## 14. Product success criterion

The first version succeeds if, after using it for a few weeks, the user can open a Journey and immediately understand:

> “This is how this part of my life has developed.”
