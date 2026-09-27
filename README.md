# Journey Notes — Codex Starter Pack

A product/engineering handoff for building a desktop note-taking application centered on **Journeys and timelines**.

## One sentence

Journey Notes is a local-first Markdown-oriented desktop notebook where users can create thematic **Journeys** and naturally accumulate a chronological record of notes, tasks, events, reflections, and state changes.

## Why this exists

Traditional note apps organize around files, folders, pages, or blocks. This product adds a second organizing axis:

> `Everything -> Journey -> Time`

A Journey may be “秋招 2026”, “VLA 学习”, “论文修改”, “健身”, “旅行计划”, or anything else. The product must remain generic.

## Status

The first vertical slice is implemented and runs as a desktop app.

```bash
npm install
npm run dev
```

`DEVELOPING.md` covers setup and commands. `docs/implementation/STATUS.md`
records what works, which checks were run, and what is deliberately not built
yet.

The published source includes the application, build configuration, migrations and
runtime demo data. Tests and internal diagnostic scripts stay local and are not
included. `npm run check` validates formatting, lint, TypeScript and the web build;
it does not run a regression suite in this source-only distribution.

## Start here

To understand the product before changing it:

1. Read `AGENTS.md`.
2. Read the specs in `docs/`.
3. Inspect `docs/design/reference/journey-timeline-primary.png`.
4. Read `docs/implementation/STATUS.md` for the current state and next task.
5. Read `docs/DECISIONS.md` — D-012 onwards record the choices made while
   building, and why.

## Package map

```text
AGENTS.md                         Agent operating contract
CODEX_START_PROMPT.md             Paste/start instruction for Codex
README.md                         This file

docs/
  DECISIONS.md                    Decisions already made + open questions
  product/
    PRODUCT_SPEC.md               Product model and scope
    USER_FLOWS.md                 Core user flows
  design/
    UX_SPEC.md                    Screen and interaction spec
    STYLE_TOKENS.md               Visual system guidance
    reference/
      journey-timeline-primary.png
      journey-timeline-exploration.png
      home-dashboard-exploration.png
  architecture/
    ARCHITECTURE.md               Technical architecture
    DATA_MODEL.md                 Domain and persistence model
    schema.sql                    Starting SQLite schema
  implementation/
    MVP_PLAN.md                   Build order
    ACCEPTANCE.md                 Definition of done
    STATUS.md                     Agent-maintained progress log

fixtures/
  demo-seed.json                  Demo data for visual implementation

DEVELOPING.md                     Setup, commands, conventions
src/                              React + TypeScript frontend
src-tauri/                        Rust backend, migrations, repositories
```

## Primary visual reference

`docs/design/reference/journey-timeline-primary.png`

It demonstrates the target feeling: personal, calm, editorial, timeline-first, information-rich without looking like enterprise software.

## Important scope note

The reference Journey happens to be a job-search Journey. That does **not** mean the product is a recruitment app. Job positions, skills, interviews, and similar objects must be implemented as optional/custom domain views on top of the generic Journey system.

## MVP outcome

A successful first MVP lets a user:

- create a Journey
- write a Markdown note
- link it to the Journey
- see it appear chronologically in the Journey Timeline
- create and complete a Journey-linked task
- see completion/history reflected on the Timeline
- close and reopen the desktop app without losing data

Everything else is secondary until this loop feels excellent.
