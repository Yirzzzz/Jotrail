# Handoff Manifest

This starter pack was intentionally **specification-first**: the product model,
visual references, architecture constraints, persistence model, seed data, and
first implementation prompt all existed before any application code.

> **The first vertical slice has since been implemented.** See
> `docs/implementation/STATUS.md` for what works and which checks were run, and
> `DEVELOPING.md` to build and run it.

## Primary files

- `AGENTS.md` — agent rules and product guardrails
- `CODEX_START_PROMPT.md` — first instruction to give Codex
- `README.md` — package orientation
- `docs/design/reference/journey-timeline-primary.png` — primary product image
- `docs/implementation/MVP_PLAN.md` — implementation order
- `docs/implementation/ACCEPTANCE.md` — done criteria
- `docs/architecture/schema.sql` — starter SQLite schema
- `fixtures/demo-seed.json` — development demo content

## Added by implementation

- `DEVELOPING.md` — setup, commands, and the rules to know before changing things
- `src/` — React + TypeScript frontend
- `src-tauri/` — Rust backend, migrations, repositories
- `docs/implementation/STATUS.md` — what works, checks run, known limitations
- `docs/DECISIONS.md` — extended with D-012…D-021, the choices made while building

`docs/architecture/schema.sql` remains the design reference. The schema that
actually runs is `src-tauri/migrations/`, which starts from that file and adds
`0002_event_sequence.sql`.

## Validation performed before packaging

- demo seed JSON parsed successfully
- starter SQLite schema executed successfully against an empty SQLite database
- primary and exploratory PNG references were copied into the package
