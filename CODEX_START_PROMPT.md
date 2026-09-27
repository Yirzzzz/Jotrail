# Initial prompt for Codex

You are the primary implementation agent for this repository.

First, read `AGENTS.md` completely. Then read all required files listed in its “Required reading” section and inspect `docs/design/reference/journey-timeline-primary.png`.

Your job is to turn this product specification into a working local-first desktop application. Do not reinterpret it as a job-search CRM, Notion clone, generic dashboard, or task manager. The central model is generic **Journey + Timeline**, with Notes as the primary writing experience.

## Start with one vertical slice

Implement, in this order:

1. Scaffold/verify a Tauri 2 + React + TypeScript desktop application.
2. Build the visual shell for the primary Journey screen using the supplied reference image and design spec.
3. Implement local SQLite migrations/repositories for `journeys`, `notes`, `tasks`, `journey_links`, and `timeline_events`.
4. Seed demo data from `fixtures/demo-seed.json` in development mode if the database is empty.
5. Implement Journey list/create/open.
6. Implement a simple reliable Markdown note editor with autosave.
7. Allow linking a note to a Journey.
8. Automatically create or expose a timeline event so that the note appears on the Journey Timeline at `occurred_at`.
9. Implement lightweight tasks linked to a Journey; completing a task must create a historical timeline event.
10. Persist and reload correctly across app restart.

## UI requirements

- Treat `docs/design/reference/journey-timeline-primary.png` as the primary visual reference.
- Match hierarchy, whitespace, proportions, and calm visual language rather than copying generated artifacts literally.
- Keep the main Journey Timeline as the central visual feature.
- Use the right rail for context, pinned content, upcoming items, and optional views.
- Do not add excessive cards, gradients, charts, or fake completion percentages.
- Keep Career-specific tabs/labels out of the generic default Journey. The demo fixture may show a job-search Journey, but the core components must remain domain-neutral.

## Engineering requirements

- Use strict TypeScript.
- Keep persistence outside presentational components.
- Use migrations.
- Preserve `occurred_at` separately from `created_at`.
- Store history instead of overwriting meaningful state transitions.
- No account system, remote backend, cloud sync, telemetry, or AI network calls.
- Prefer an intentionally small architecture over a premature plugin/block system.

## Completion behavior

Work autonomously through the first vertical slice. Do not stop after generating a plan or mock components. Run the available formatter, typecheck, tests, and build/dev checks; fix issues introduced by your changes.

Update `docs/implementation/STATUS.md` after each coherent milestone with:
- what now works
- commands/tests run
- known limitations
- next recommended task

If a product ambiguity is not blocking, choose the simplest option consistent with `AGENTS.md`, record it in `docs/DECISIONS.md`, and continue.
