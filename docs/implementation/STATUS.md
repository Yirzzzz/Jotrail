# Implementation Status

> Coding agents: update this file after each coherent milestone. Record only work that actually exists and checks that were actually run.

## Current state

**The first vertical slice is implemented and passing its checks.** The core loop
from `ACCEPTANCE.md` works end to end against a real local SQLite database:

> create a Journey → write a Note → link it to that Journey → see it in the
> Journey's chronology → complete a related Task → see that change recorded →
> quit and reopen the app with the same evolving story intact.

Restart persistence is covered by an automated test that writes through a real
database file, drops the connection, reopens it, and asserts the journey, note,
task state and both timeline events are still there
(`src-tauri/src/lib.rs::the_journey_loop_survives_a_restart`).

## Publishable main history rebuilt (2026-09-27)

With the user's explicit approval, `main` was rebuilt as a single parentless
`Initial source release` commit containing the current source-only application.
All existing feature changes, including the previously untracked language module,
were included. This is a local history rewrite, not a GitHub upload.

Before changing the branch, an external, owner-only backup directory was created
beside the project. It contains a verified `history.bundle`, the previous `.git`
metadata, staged/unstaged patches, a working-source archive and a local-test archive.
The old two-commit history is recoverable there. No source, local test, notebook,
reflog or app-managed snapshot was deleted.

Verification: all **166** candidate source files matched their pre-cleanup SHA-256
hashes before the rewrite; the new source tree contains no excluded test/tool paths
or inline Rust test bodies. `main` has one commit and no parent, and the working tree
was clean after the ref update. `npm run check` passed again (format, lint, TypeScript
and web build). Documentation was then updated in the same initial commit.

Boundaries: local reflogs/app-managed refs and the external backup may still retain
old objects; this cleanup applies to the publishable `main` history. Push only `main`,
not a mirror of all local refs, and keep the backup private. Existing personal
references in current documentation/comments have not been comprehensively sanitized;
font redistribution also remains a separate review. No remote is configured and no
push was performed. Next: review current-source privacy and obtain the destination
repository before publishing.

## Source-only publication, local-only tests (2026-09-27)

At the user's request, the source distribution now excludes tests and internal
development tooling, while preserving them in this local workspace.

- Untracked **47** frontend test/helper/browser-fixture and development-script files;
  SHA-256 checks confirmed that index removal did not change or delete local files.
  New local tests/configs are ignored too. The four personal scripts excluded in the
  previous milestone remain local-only.
- Extracted **147** Rust tests from 13 production files into ignored
  `src-tauri/local-tests/` modules. Production code before each test module is
  byte-identical to its previous version. Local testing is explicitly enabled with
  the `local-tests` feature; normal builds do not require these files.
- Removed test-only npm dependencies/commands and separated local Vitest/TypeScript
  configuration. `npm run check` now runs format, lint, production typecheck and web
  build only. `LOCAL_TESTING.md` preserves local-only test instructions.
- Moved the browser long-note injection into an ignored harness; the normal browser
  demo no longer reads test globals. Kept runtime demo data, migrations, icons and
  lockfiles so the published application remains buildable.

Verification: `npm run check`, local test typecheck, **332 frontend tests**, and
**147 opt-in Rust tests** passed. A temporary source-only snapshot (no ignored files)
passed `npm ci --offline --ignore-scripts`, `npm run check`, `npm ls --depth=0`, Rust
`cargo check --offline`, and default `cargo test` (intentionally zero tests). The
long-note harness also passed syntax/typechecking and a no-write browser-entry build;
its browser interaction was not rerun. No tracked paths match the ignore rules, no
Rust test bodies remain in the production working source, and diff whitespace checks
pass. Existing React `act`, bundle-size and missing proprietary-font fallback warnings
remain non-failing. Pre-existing Rust formatting differences in four production files
were not expanded into unrelated changes.

Limitations: a fresh clone intentionally has no regression suite. Rust
`cargo test --all-features` needs the private local test files, so leave `local-tests`
disabled there. Git history still includes previous tests and personal references;
untracking is not history sanitization. No commit or push was made. Next: obtain an
explicit decision about history cleanup before publishing without historical tests.

## Git publication hygiene (2026-09-27)

- Extended `.gitignore` for environment/signing credentials, local assistant state,
  SQLite variants and sidecars, root-level backups/exports, and generated test output.
  Source, lockfiles and sanitized environment templates remain eligible for tracking.
- Removed only the four personal maintenance scripts in `src-tauri/examples/` from
  the Git index with `git rm --cached`; their local SHA-256 hashes are unchanged.
  Existing application changes were preserved. No commit, remote or push was made.
- Added publication guidance to `DEVELOPING.md`. Previous commits still contain the
  scripts, and documentation/comments/fixtures still quote personal notebook details.
  Neither history rewriting nor source sanitization was performed.

Verification: **48 ignore-rule assertions** passed; no tracked paths still match the
ignore rules; the staged changes contain only those four removals. `git diff --check`,
`npm run check` (**332 frontend tests**, format/lint/typecheck/web build), and
`npm run test:rust` (**147 tests**) passed. Existing React `act` and bundle-size warnings
remain non-failing.

Next before public release: review personal references and choose a history-cleanup
approach explicitly. Review bundled proprietary fonts before distributing binaries;
ignoring their source files does not remove them from locally built artifacts.

## Chinese and English interface (D-060, 2026-09-22)

This interface milestone's check counts describe its snapshot, as do the older counts
below.

- Settings now offers **简体中文 / English**. The choice takes effect immediately and
  is stored locally across restarts; first use follows the system language (Chinese for
  `zh`, English otherwise). Unavailable storage does not block the current session.
- Navigation, Journeys, notes, timeline, tasks, registers, search, dialogs, settings,
  accessibility labels, help and example placeholders have bilingual interface copy.
  Date/relative-time labels use the selected locale while preserving local timezone,
  UTC storage, chronology and date/time form values.
- Titles, Markdown, event/task text and custom kinds/stages remain unchanged. No data
  migration, automatic translation, service or new dependency was introduced.
- CodeMirror changes only its placeholder/accessibility configuration, keeping the
  same editor, selection, undo history and unsaved document. Language changes do not
  trigger note changes or saves.

Verification: `npm run check` passed with **332 frontend tests**, plus focused follow-up
checks of bilingual example placeholders. Tests cover preference loading/persistence,
unavailable storage, immediate switching, date grouping, unchanged repository content,
and editor identity/history. Real-browser checks exercised both languages, reload
persistence and Chinese Settings/record-event layout at 880×600, using only the memory
fixture. `npm run build` produced the macOS app. Existing React `act` and bundle-size
warnings remain non-failing; native-WebView language interaction was not exercised.

Boundaries: the product name and technical identifiers/paths retain their spelling.
Underlying diagnostic errors remain verbatim for troubleshooting, and OS-owned native
picker controls may follow the OS language. Stored historical text is content, including
older app-generated titles; it is not rewritten when the interface language changes.
Next: collect wording feedback during daily use in both languages.

## A continuous, quieter timeline (D-059, 2026-09-22)

- Journey headers and traces take less vertical space; tabs, toolbar and chronology
  share one reading width. Latest Progress remains on Overview, not duplicated above
  the same records on Timeline.
- Dates, connecting rules and markers use shared geometry at all desktop widths.
  Ordinary events, reflections and task groups use whitespace and separators rather
  than nested cards; milestone and planned-event emphasis remains visible.
- Event metadata sits below the title. Long Chinese/English titles, stage labels and
  Journey links wrap without colliding with controls. Narrow layouts reserve space for
  the visible context rail and reclaim it when hidden.
- Added rendering regressions and an isolated in-memory browser fixture covering
  mixed event types, long text, plans, task groups and empty Journeys.

Verification: `npm run check` passed (format, lint, strict typecheck, **310 frontend
tests**, production web build). Browser inspection at **1440, 1280, 1024 and 880px**
confirmed marker/rail alignment and no timeline content overflow. Also checked rail
visibility, empty state, plan-confirmation dialog and a subject-history modal at
880×600. `npm run build` produced the macOS `.app`. Existing React `act` warnings and
Vite's large-bundle warning remain non-failing.

Scope: frontend presentation only. No schema, persistence, chronology, navigation or
plan-action changes; no real user database was opened or modified for visual checks.
The browser fixture is not a native-WebView verification. Next: assess the revised
reading rhythm with the user's everyday notebook before adding further UI features.

### Follow-up — stray trace markers (2026-09-22)

The user's screenshot exposed a separate chart bug: crowded events omitted from the
curve still received peak dots. Line, fill and markers now share one geometry result;
only drawn peaks get dots or milestone rings. Original events and chronology are intact.
Removed the stroke-only reveal animation, which also left dots temporarily detached
when mounting or resizing. The existing NOW indicator is unchanged.

Added 13 geometry/component regressions for clustered and duplicate timestamps, window
boundaries, empty/unmeasured charts, resize and sample callbacks. `npm run check` passed
with **323 frontend tests**; 1280px and 880px browser checks found no orphan markers,
including immediately after resize. `npm run build` rebuilt the macOS app. Validation
still uses the isolated memory notebook, not the user's database.

## Daily-use reliability and recovery (D-058, 2026-09-12)

- Notes now share one serial save queue per note. Flush waits for all current text;
  failures block linking, deletion, backup and restore while preserving the draft across
  navigation. Normal Tauri window-close requests wait for saves or show a retryable error.
- Settings provides local SQLite backups, confirmed restoration with an automatic
  pre-restore safety copy, and Markdown + structured JSON + SQLite exports. The backup
  API includes committed WAL data; validation precedes any live replacement.
- Recently deleted notes can be restored and opened with text and Journey links intact.
  Previously removed note-log events are not recreated.
- Planned stages no longer set a subject's current state in registers, search or tallies.
  Plans can be cancelled with confirmation; mistaken confirmations can return to plans.
- Command search finds unfinished tasks by title/details and opens that specific task,
  including tasks with no Journey or due date.

Boundaries: backups and exports require the desktop app and stay on the same computer
until copied elsewhere. Restore accepts snapshots made with the current schema; importing
arbitrary files/older schemas is not yet a UI feature. Draft recovery is process-local,
not crash recovery. The close guard covers Tauri window-close events; OS menu Quit/Cmd+Q
and forced termination are not verified. No real user database was modified by validation.

Verification: `npm run check` passed (format, lint, strict typecheck, **304 frontend
tests**, production web build). `cargo test --manifest-path src-tauri/Cargo.toml`
passed **147 Rust tests**, including WAL backup/restore, safety-copy recovery, corrupt
snapshot rejection and export fidelity. `npm run build` produced the macOS `.app`.
`check:layout` passed nine 880×600 dialog/interaction scenarios, including plan actions
and task-detail Journey filing. `check:data-management` passed real Chrome checks of
the actual Settings components at 880×600, with a 1440×900 screenshot; its filesystem
actions are explicit stubs, while Rust tests exercise real temporary SQLite files.
Changed Rust files pass rustfmt; repository-wide `cargo fmt --check` still reports
pre-existing formatting differences in untouched Rust files/examples. Existing React
`act` warnings and Vite's large-bundle warning remain non-failing.

## Completed

- [x] Product thesis defined
- [x] Primary Journey/Timeline visual reference selected
- [x] Generic core domain documented
- [x] Initial SQLite schema drafted
- [x] MVP acceptance criteria drafted
- [x] Tauri 2 + React + TypeScript + Vite scaffold
- [x] Journey UI (header, tabs, timeline, context rail)
- [x] SQLite migrations wired (forward-only runner, applied at startup)
- [x] Notes editor with debounced autosave and visible save state
- [x] Journey linking (note ↔ journey, task ↔ journey, many-to-many capable)
- [x] Timeline persistence (`occurred_at` distinct from `created_at`)
- [x] Tasks and history (completion/reopen write timeline events)
- [x] Global timeline over the same event records
- [x] Demo fixture seeded on first run, development builds only, opt-out via
      `JOURNEY_NOTES_NO_SEED=1` (`npm run dev:clean`)
- [x] `Cmd/Ctrl+K` search palette, `Cmd/Ctrl+N` new note
- [x] Light and dark themes, plus follow-the-OS (D-027)
- [x] Day timeline and "Up next" on Today; Journey Overview rebuilt around
      recorded development (D-028)
- [x] State changes are recordable, not only seedable (D-028)
- [x] Planned events: a timeline entry can be a commitment rather than a record,
      and is confirmed onto the record when it happens (D-041)
- [x] Registers: a Journey keeps track of things, and an event can be about one
      (D-042)
- [x] Stage sets: a named, reusable vocabulary with a tone per stage, and a
      per-register cross-section on the Overview (D-043)
- [x] States can be set up while the Journey is created, in a collapsed optional
      section (D-044)
- [x] The user's own 科研论文 history organised into a register of 5 papers, against
      their real database, backed up first (D-045)
- [x] Those entries' titles reduced to the paper they are about, the state left to
      the chip (D-046)
- [x] Search covers timeline entries, stages and tracked things, not just Journeys
      and notes (D-047)
- [x] 秋招 organised the same way — 4 positions, 7 states, outcomes given their own
      dated entries (D-048)

## Architecture as built

```text
src/                      React + TypeScript frontend
  app/                    shell, sidebar, route store (small state machine)
  components/             shared primitives (Modal, Markdown, StatusPill…)
  data/                   Repository interface + Tauri and in-memory impls
  domain/                 types mirroring Rust, plus pure presentation logic
  features/               journeys, notes, tasks, timeline, today, settings
  lib/                    timezone-safe date helpers
  test/                   integration tests driving the real UI
src-tauri/
  migrations/0001_init.sql
  src/db/                 repositories — the only place SQL is written
  src/commands.rs         IPC surface, thin adapters over repositories
  src/domain.rs           serde types shared with the frontend
```

Layering rule that held throughout: **no SQL above `src-tauri/src/db`, and no
Tauri below it.** UI components depend on the `Repository` interface, never on
`invoke`, which is what lets the integration tests drive the real components.

State mutations that must not diverge from history are written in a single
SQLite transaction — completing a task updates the task row and inserts the
`task_completed` event together, or neither happens.

## Checks run

All commands below were run in this environment and passed.

| Command | Result |
| --- | --- |
| `cargo test --manifest-path src-tauri/Cargo.toml` | **74 passed**, 0 failed |
| `npm run test` (`vitest run`) | **97 passed**, 0 failed |
| `npm run check:layout` | pass (real Chrome, 880×600) |
| `npm run typecheck` (`tsc --noEmit`, strict) | clean |
| `npm run lint` (`eslint .`) | clean |
| `npm run format:check` (`prettier`) | clean |
| `npm run build:web` (`vite build`) | built, 432 kB JS / 33 kB CSS |
| `npm run build` (`tauri build`) | see "Desktop build" below |

The desktop build was additionally verified by hand: the built binary was
launched, confirmed to create `journey.sqlite3` with all 8 tables in WAL mode,
confirmed **not** to seed demo data in a release build, then stopped, given data,
and relaunched — data intact and migrations not re-run.

Test coverage is concentrated where the risk is:

- **Rust (60)** — migration idempotency, foreign-key enforcement, timestamp
  normalisation to UTC, ordering by `occurred_at` rather than `created_at`,
  deterministic ordering of same-millisecond events, transactional task
  completion, event fan-out to multiple journeys, seed behaviour, and the full
  restart story.
- **Frontend (67)** — timezone-sensitive grouping and formatting (tests run
  under `TZ=Asia/Shanghai` so a UTC-only assumption fails), timeline grouping and
  labelling, malformed-payload tolerance, seven autosave tests covering
  debouncing, overlapping writes, flush-on-close and failure surfacing, and
  thirteen tests over the primary Journey screen — including guards that
  career-specific tabs and percentage metrics stay out of the generic journey.

### Three bugs found in use

Worth recording, because both were invisible by inspection:

1. **Timeline ordering was non-deterministic** for events sharing a millisecond —
   ties fell through to a random UUID. Fixed by migration
   `0002_event_sequence.sql`; see DECISIONS.md D-021. It failed ~30% of runs,
   which is exactly the kind of bug that ships.
2. **Note titles stopped tracking the body.** The editor always sent the current
   title, so a note created before anything was typed stayed `Untitled` forever.
   Titles now follow the first line until the user types one of their own; see
   D-014.
3. **Dialog submit buttons were unclickable at small window heights.** A dialog's
   `<form>` sat between the height-capped, `overflow: hidden` panel and the
   scrolling body without being a shrinkable flex column, so it kept its full
   content height and pushed the footer outside the clipped panel. The buttons
   rendered but were not reachable. Reported from real use ("Record event can be
   filled in but not submitted").

   jsdom applies no CSS, so no unit test could have caught it. `npm run
   check:layout` now drives the built app in headless Chrome at the app's
   minimum window size (880×600) and asserts every dialog footer and button sits
   inside the panel and the viewport. Verified to fail when the fix is reverted.

## Known limitations

- Task search and planned/current-state separation are implemented in D-058.

- **Editor is CodeMirror 6 with Typora-style live preview** (D-026). Markdown
  renders as you type; syntax hides itself unless the cursor is on that line.
  Not supported yet: inline images, tables rendered as grids, drag-to-reorder.
- **Both themes are implemented, but neither has had a real-browser visual pass
  since the dark theme landed.** `check:layout` and `check:editor` need headless
  Chrome, which could not start in the environment the theme was built in. The
  change is token-only and the dark block is present in the built CSS, but a
  human should look at both themes. See D-027.
- **Search is SQL `LIKE`**, so it is case-insensitive for ASCII only. Fine at
  personal scale; FTS5 is the documented upgrade path.
- Attachments are not implemented. Local backup, restore and Markdown/JSON export
  are available in Settings (D-058); cross-device sync and arbitrary imports are not.
- **In-memory repository duplicates a few event rules** so the UI can run in a
  browser and in tests. SQLite is the real implementation; see DECISIONS.md
  D-017 for why this trade was accepted and how it is bounded.
- **The context rail has no custom views.** Deliberate: Positions/Skills/
  Capabilities panels in the reference image are domain-specific and belong to
  the post-MVP custom-view system, not to every journey (D-003).
- **Journey cover images are not implemented.** The header renders a quiet
  gradient band; `cover_path` exists in the schema but nothing writes it.
- Note deletion is soft and recoverable from Settings (D-058). **Journey deletion is hard** — the
  confirmation dialog is the only safeguard, which is why it offers Archive.

## Deliberate deviations from the reference image

The primary reference was followed for composition, hierarchy and rhythm. Three
things in it were intentionally *not* built, because written specs win over the
generated image (AGENTS.md §3):

1. **Positions / Skills tabs and the Positions / Capabilities rail panels** —
   career-specific, and mandated against by AGENTS.md §12 and D-003.
2. **The bar-chart "Positions" panel** — a metrics widget of exactly the kind
   UX_SPEC.md §7 lists as bad default rail content.
3. **Chinese type badges** (职位发现, 学习笔记…) — the reference's chrome is
   English while its *content* is Chinese. Badges are chrome derived from
   `event_type`, so they are English and domain-neutral; user content renders in
   whatever language it was written in.

## Added after the first slice

### Today shows the day; the Journey Overview shows the development

Three panels from the dark reference screenshots, all derived from events that
already existed (D-028):

- **Today · timeline** — the day read forwards, each row stamped with the time it
  happened.
- **Up next** — task due dates and future-dated events with a real day count.
  Today and overdue work is excluded, because it already appears above as due
  work and listing it twice would make one task look like two.
- **Journey Overview, rebuilt** — current focus, recent development as a dated
  rail, tracked states, entry points into the tabs that exist, milestones, pinned
  reading. The old version led with a "Recorded / Notes / Open tasks" stat row,
  which is exactly what `AGENTS.md` §7 says not to lead with.

**The percentages in those references are not implemented and will not be:** the
68% focus ring, the per-capability percentages, the "5 days to completion"
estimate. Nothing in the data measures any of them (D-007). The substitution is
**Tracked states** — the user's own recorded values, each showing
`previous → current`, dated, with a count of how many transitions are on record.
A test asserts no `\d+%` renders anywhere on the Overview, so the ring cannot
quietly come back.

**One gap this closed.** `createTimelineEvent` hard-coded `payload_json` to
`null`, so `state_changed` events could only come from the seeder or from
task/journey status changes. The two new panels would have been permanently empty
for real users while looking right in the demo. `NewTimelineEvent` now accepts an
optional `state: { field, to, from?, subject? }` and "Record an event" has an
optional "This changed a state…" section.

Verified: 21 domain tests over the pure selectors, 6 frontend tests driving the
real components (including recording a change in the dialog and finding it on the
Overview), 2 Rust tests pinning the payload key names — which are a contract
between the Rust writer and the TypeScript reader. Totals now **142 frontend, 76
Rust**. Not verified: no real-browser pass, same headless-Chrome limitation as
D-027.

### Dark theme

Both themes now ship: light (unchanged, still the primary reference), dark, and
`system` which follows the OS setting and keeps following it while it is
selected. Toggle in the sidebar footer, full three-way choice in Settings.

It is a **re-tokenisation, not a redesign** — layout, spacing, type scale and
hierarchy are identical, and only the colour tokens change. That was cheap
because the first slice already routed every colour through
`src/styles/tokens.css` and named `[data-theme='dark']` as the future hook. The
work was one token block, a small store (`src/app/theme.ts`), one button, and the
removal of the six hard-coded colours that were bypassing the tokens (five
`#fff`, one `rgba()` modal backdrop). Three tokens were added that a light-only
palette could leave implicit: `--accent-contrast`, `--accent-hover`,
`--backdrop`/`--selection`. See D-027 for the colour reasoning.

Verified: 8 new frontend tests (attribute applied, preference persisted, `system`
tracks the OS, an explicit choice stops tracking it, both controls work);
a script confirming all 23 colour tokens have a dark value with no dark-only
strays; and a WCAG contrast pass with **no failures in dark**. The light theme has
9 pre-existing contrast shortfalls inherited from `STYLE_TOKENS.md`, all in
metadata-weight text — noted, not introduced here, and not fixed in this change
because the light palette is the approved reference.

**Not verified:** no real-browser look at either theme, because headless Chrome
could not start in this environment, so `check:layout` and `check:editor` did not
run. They should be run, and both themes eyeballed, before this is called done.

### The editor is now live-preview Markdown

The textarea + preview toggle was replaceable by design (D-011) and has been
replaced: CodeMirror 6 with Typora-style live preview. Markdown renders while you
write and the syntax characters hide themselves unless the cursor is on that
line. There is no longer a preview mode to toggle into.

The document remains plain Markdown — everything is a decoration, never a
document rewrite — so autosave, timeline summaries and future export are
unaffected. See D-026.

Verified in two layers, because jsdom applies no CSS: 10 unit tests for the
decoration logic and the never-rewrite guarantee, plus `npm run check:editor`,
which types Markdown into the built app in real Chrome and asserts computed font
sizes and weights. Both confirmed to fail when live preview is removed.

### Tasks are now properly part of a Journey

The first slice left tasks as a silo: a task added to a journey produced nothing
on its timeline (only completion did), and a task started from Today could never
be filed into a journey at all — `task_link_journey` existed in Rust with no UI
reaching it. So a journey could show *that* something got done but not that it
had been started, and the gap between deciding and doing was invisible.

Three changes:

1. **`task_added` events.** Adding a task to a journey is recorded, so the arc
   "8/25 decided to learn ROS2 → 8/28 learned it" reads on the timeline. An
   unscoped task still records nothing. Widens `ARCHITECTURE.md` §10; see D-023.
2. **Filing an existing task.** A `⊞` action on each task row outside a journey
   attaches it to one, dated when the task was created so the decision lands in
   the right place. A task that is already finished records both halves.
3. **Task group density.** A day's consecutive task events collapse into one
   block with a count, rather than a row each — the "task group" form
   `PRODUCT_SPEC.md` §9 asks for and the first slice had skipped. See D-024.

Also fixed: a note titled by its own first heading printed that text twice on the
timeline, as both title and summary (D-025).

Covered by 8 new Rust tests and 13 new frontend tests.

## Earlier additions

**Journey deletion** (`journey_delete`). The original slice could only archive,
so a journey created by mistake was permanent — noticed immediately in real use.

The rule it follows: a journey is a way of *organising* things, so deleting one
must not destroy the things themselves. Notes and tasks survive and become
unfiled; the journey's own history (its status changes, its `note_logged` links)
goes with it; events shared with another journey keep that association; a
free-standing recorded event survives as unscoped history.

Reachable from the sidebar via a hover-revealed `⋯` menu, which also offers
Archive/Unarchive. The confirmation dialog states the real counts of what will be
kept and what will be lost, and offers Archive as the non-destructive
alternative. Covered by 6 Rust tests and 8 frontend tests.

### Today is an entrance, not a task inbox

The pinned Today reference is now the composition of that screen (D-030): dusk
hero with a time-of-day greeting, a Now card holding both capture inputs, the
day as a timed spine of cards, Journey cover tiles with real note/task counts,
and a rail that splits *upcoming* from *due now* so one task is not listed
twice. Skill-side refusals of the mock (fake name, quote, rainbow tags, progress
bars, sync/bell/avatar) are recorded in D-030.

Verified in this pass: frontend unit tests for greeting hours, `tasksDueNow`,
capture still landing on the day timeline, the rail split, and Journey cards
showing real counts. A real-browser look should follow (same headless-Chrome
caveat as D-027 if Chrome cannot start).

### Journey Timeline plus Latest progress

The Journey screen now follows the first pinned screenshot as the Timeline, and
borrows **Latest progress** from the second (D-031): a horizontal path of real
turning points (start, state changes, milestones) above the chronology, reused
on Overview. Clicking a node on Timeline scrolls to that entry. The current
turning point keeps the green-edged card and a star on the vertical rail.

What was not copied from the second mock: percentage rings, Papers/Skills tabs,
a second purple palette, or a quote.

Verified: 170 frontend tests passing (Latest progress on Timeline and Overview,
click-to-scroll, hidden until there are two points, no `\d+%` on Overview).
Typecheck and lint clean. Dark-theme screenshots of 秋招 2026 Timeline (path
above the feed, highlighted latest card) and Overview (path under Current
focus). Light theme was not re-shot this pass; tokens are shared.

## Redesign onto the quiet-ledger world (D-034)

The user supplied four redesigned screens and asked for them to be reproduced.
Implemented against those screens, at the 1440×810 viewport they were drawn at.

**Design system**

- `tokens.css` rewritten: flat white `--paper`, tinted `--binder` (nav) and
  `--margin` (rail), violet accent family, pens retuned to violet → blue →
  indigo → pink (no orange), softer radii, near-flat shadows.
- Display face is now **Source Serif 4** (`@fontsource-variable/source-serif-4`,
  pinned 5.3.0) for dates, titles and headings; Inter for all labels and
  controls. Archivo removed.
- `--stretch-label` and seven `font-stretch` declarations deleted: they drove
  Archivo's width axis, which a serif does not have, so they were inert.
- Restored `--axis-rule` and `--rule-faint`, which an earlier rewrite in this
  session dropped from a stale copy of the token file. Removed the `--grid-*`
  tokens D-033 had already deleted.

**Shell**

- The sidebar now spans both grid rows, so its edge runs the full window height
  and the top bar's rule stops at it. The brand moved into the sidebar's own
  52px strip, which also absorbs the macOS traffic lights — the top bar's 88px
  inset is gone.

**Today**

- The multi-pen day chart is **removed** (D-034). The day is a table with a
  head row (date chip + TIME / ACTIVITY / JOURNEY), hairline-separated rows, and
  an "Add entry" row that focuses the composer rather than duplicating it.
- The composer is one card with a violet icon gutter marking which input is which.
- The rail gains "About today" (entries / notes / tasks) and renames "In motion"
  to "Active journeys"; its cards carry a real trace thumbnail.
- The weekday chip is pinned to `en-US`, because a Chinese OS rendered `周五`
  into a 34px slot built for three capitals.

**Journey**

- Tabs sit in a bordered card; the selected tab is a violet chip rather than a
  gradient underline, which would have collided with the card's own edge.
- Axis ticks are numeric and locale-pinned (`8/12`, `Now`) — a tick is a
  coordinate, and the OS locale rendered `8月12日`.
- The rail's "Record an event" is a filled violet block. This needed a new
  `--violet-fill` token: `--violet-wash` (#f3f0fe) is a tint for text to sit on
  and vanished against the rail's #fafafa.

**Timeline**

- New `TimelineRail`: this month's counts, focus Journeys ranked by measured
  activity, and recent state changes. All arithmetic on existing records.
- Serif page title, gradient primary action, larger serif date column, and the
  task group is now a sunk sub-card.

**Checks run**

- `npm run lint` — clean
- `npm run typecheck` — clean (pre-existing errors in `demoFixture.ts` and test
  fixtures only)
- `npm test` — 179/180. The one failure is pre-existing and unrelated: see
  Known limitations.
- `npm run build:web` — clean
- `node scripts/shoot.mjs` — six review rounds at 1440×810 and 880×600

`scripts/shoot.mjs` now shoots at 1440×810 (the reference viewport) and visits a
Journey. `scripts/probe-trace.mjs` reports fill geometry, which is what
identified that a quiet Journey's trace encloses almost no fillable area.

## Notes screen, CJK face, and narrow-window fixes (D-035, D-036)

Completes the fourth reference screen and the two issues that surfaced from it.

**Notes screen**

- `NoteRail` mounted by the shell (`NotesScreenRail`), so Notes is the fourth
  screen with a context rail. Four panels, all on existing records: About
  (created / updated / type / Journey status / word count), Linked journeys,
  Related notes, Activity.
- **Related notes** means *notes sharing a Journey with this one*
  (`relatedNotes`), and the panel says so in a hint line. There is no similarity
  model; a shared Journey is a connection the user made themselves.
- Breadcrumb, serif title at 2rem, and the note's Journeys as clickable tags
  under the title.
- Not built, with reasons in `NoteRail.tsx`: **Tags** (no field in schema or
  domain), **Backlinks** (nothing writes note-to-note links), **Tasks** (tasks
  link to Journeys, not notes — listing them would imply they belong to the note).
  Also no **Share** button (no network, no sync — it would be a dead control) and
  no **Edit** mode toggle (the app is always-editing with autosave; read-first is
  a product decision, not a visual one).

**CJK typography**

- Bundled `Microsoft YaHei` subset at `src/assets/fonts/yahei-{400,700}.woff2`,
  registered in `styles/fonts.css` and scoped by `unicode-range` to CJK, so Latin
  and digits keep falling through to Source Serif / Inter.
- Verified by probe, not by inspection: Chinese resolves to `Microsoft YaHei`
  (`isCustomFont: true`), figures to `Source Serif 4`.
- Frontend bundle is now ~11MB, from a few hundred KB. Acceptable for a desktop
  app; see D-035 for the licensing constraint before any public release.

**Narrow-window clipping (D-036)**

The rail drawer was covering content on all three screens that gained a rail.
Fixed on each, and verified at 880×600: Today drops its Journey column and moves
tags under the title; Timeline and Notes reserve the drawer's width in
`padding-right`; Notes also drops its index pane, and its footer bar clears the
drawer.

**Checks run**

- `npm run lint` — clean
- `npm run typecheck` — clean (pre-existing errors in `demoFixture.ts` and test
  fixtures only)
- `npm test` — 179/180, same pre-existing `startPoint` failure
- `npm run build:web` — clean
- `node scripts/shoot.mjs` — all five routes at 1440×810 and 880×600

`scripts/probe-trace.mjs` gained fill geometry reporting and a `--nav` flag; a
one-off font probe using `CSS.getPlatformFontsForNode` is what settled which face
actually renders CJK.

**Open, needs the user's call**

- A note's Journeys appear twice: as tags under the title (navigate) and in the
  footer bar (add/remove). The reference shows only the first. Either move removal
  onto a hover affordance on the tags, or reduce the footer to an add button.

## Event ↔ to-do coupling, and a nav that lists only real routes (D-037…D-039)

**Recording an event now carries both of Today's units** (D-037)

- `RecordEventDialog` gained a **Something to do** field — same wording and same
  unit as Today's composer, title plus optional due date — sitting directly under
  **What happened**.
- To-dos are created in the event's own transaction, linked back via
  `origin_type='event'`, inherit *all* the event's Journeys, and render inside the
  event on the timeline under a "This revealed" block.
- `tasks` changed from `string[]` to `NewEventTask { title, dueAt }` across
  `domain/types.ts`, `domain.rs`, both repositories and the dialog.
- Three gaps closed: `memoryRepository` was dropping the field, no UI sent it, and
  `entry.tasks` was rendered nowhere.

**Nested-transaction bug** (D-038)

`tasks::create` opened its own transaction inside a caller that already held one —
"cannot start a transaction within a transaction". Split into `create` /
`create_within`, plus `link_within_tx` for the multi-Journey case. Three Rust
tests added; the fix is verified by reintroducing the bug and watching five tests
go red.

**Sidebar** (D-039)

Removed the **Tasks** row: no `tasks` route existed, its handler navigated to
Today, and `isCurrent` was hardcoded `false` so it could never highlight. Its
outstanding count moved onto Today.

**Checks run**

- `cargo test` — 83 passed
- `npm run lint`, `npm run typecheck` — clean
- `npm test` — 184/185, same pre-existing `startPoint` failure
- `npm run build:web` — clean
- Dialog field order and fold position verified by DOM probe, not by eye

**Open, needs the user's call**

- A note's Journeys still appear twice on the Notes screen: as tags under the
  title, and in the footer bar.
- The event↔to-do link is one-directional: Today's composer cannot attach its
  to-do to an event, and an existing task cannot be attributed to one afterwards.
- The due-date input renders in the OS locale (`年/月/日`). It is a native control;
  matching the English chrome would mean a custom date picker.

## Planned events: a timeline entry that has not happened yet (D-041)

**The gap.** The user put "ICLR 2027 截稿" on a paper Journey — a deadline they set
for themselves. The timeline had no way to express that, so it recorded a *fact*
dated 2027: the app claimed the submission had happened, in the future.

**The model.** `timeline_events` gained `event_state` (`planned` | `recorded`) and
`planned_for` (migration `0005_planned_events.sql`).

Deriving "planned" from a future `occurred_at` would have needed no column and was
rejected: on the day an unmet deadline passes, it would become indistinguishable
from something that happened. The distinction is a fact about the entry, not about
what time it is now.

`occurred_at` keeps its meaning as the entry's *position* on the timeline, so
ordering, month/day grouping and every existing query work untouched — while an
entry is planned, its position is the date it is aimed at. Confirming moves
`occurred_at` to when the thing actually happened and leaves `planned_for` holding
the original target, which is what lets a card say "due the 12th, done on the
10th".

**What it looks like.** A plan is drawn as an *unfinished* entry: dashed border,
hollow pip on the channel line, calendar chip, and a badge reading **Planned** —
or **Overdue**, in the warning ink, once its date has gone by unconfirmed. Every
state is named in words as well as coloured. It carries its own date line and a
countdown ("In 12 days"), because a commitment's whole content is *when*.

**Three acts, all reachable from the card:**

| Act | What it does |
| --- | --- |
| **It happened** | `timeline_confirm_event` — state → `recorded`, `occurred_at` → when it really happened (defaults to now, editable), title editable in the same step |
| **Edit** | The existing dialog, relabelled: the date field is a *deadline*, and moving it moves `planned_for` with it |
| — | `timeline_delete_planned_event` exists and refuses anything recorded; no UI calls it yet |

A plan is **editable at any weight**, unlike recorded history (D-040). A planned
milestone is a normal thing to revise; freezing a mistyped deadline until its date
arrived would be the rule protecting nothing.

**A plan is not history**, so it is excluded from every derived reading via one
shared `onlyHappened` helper: development spine, current focus, tracked states,
the pen trace, the Timeline rail's month counts and recent changes, the Journey
rail's "last activity", and the Overview's Milestones. Without this a deadline
dated next March became the Journey's newest development and its current focus.

It *is* surfaced as something owed: the Journey rail's "Up next" now lists plans
above open tasks, and `upcomingItems` includes planned events for today and
overdue — unlike a task, a plan appears nowhere else on Today, so excluding those
would have hidden a deadline on the day it mattered most.

**Refused deliberately:** a planned event cannot carry a state change. A
transition asserts something *is* now a different value; a plan asserts nothing
yet, and allowing it would make the Journey report a level the user has not
reached. Both repositories refuse it and the dialog hides the section.

**Checks run**

| Command | Result |
| --- | --- |
| `cargo test --manifest-path src-tauri/Cargo.toml` | **99 passed** (8 new) |
| `npx vitest run` | **202 passed** (5 new), 0 failed |
| `npx tsc --noEmit` | clean |
| `npx eslint .` | clean |
| `npx vite build` | clean |

The Rust tests cover confirm (keeps the target, defaults to now, refuses
non-plans), the widened editability rule, re-dating a plan moving `planned_for`,
a confirmed entry's target staying put, and deletion taking its journey links.
The frontend tests drive the real UI through the whole story: type a 2027 date and
watch the dialog become a plan, confirm it early, and check both dates survive.

**Not verified:** no real-browser visual pass — `check:layout` needs headless
Chrome, unavailable here. The dashed border, the hollow pip and the overdue
warning ink are token-only CSS and present in the built stylesheet, but a human
should look at a planned card in both themes. The `startPoint` bug below also
means the dark theme's tokens are still unverified from earlier work.

## Registers: a Journey can keep track of things (D-042)

**The gap, visible in the user's own data.** Nine events, five submissions —
`2026 AAAI 投稿`, `2026 AAAI 一轮拒稿`, `TMM 投稿`, `TMM 一轮大修返稿`. The user was
encoding "these are the same paper" as a **title prefix**, by hand, because the
model had no concept of the *thing* a run of events is about.

A **subject** is that prefix made real; a **register** is the subjects of one kind
in one Journey (migration `0006_subjects.sql`, plus `subject_id` and `stage` on
`timeline_events`).

- `kind` is free-form, so 论文 / 岗位 / 电影 all cost no code. `RegisterView` does
  not know what a paper is.
- Everything but the name is **derived from events** — current stage is the most
  recent event's, the counts are counts. No `current_state` column.
- Filing stays optional: the subject picker is absent entirely for a Journey with
  no register.
- A register tab is `{ register: kind }`, so a kind the user typed can never
  collide with a built-in tab name.
- A thing's own history is the same `TimelineView`, filtered — no second renderer
  and no second query.
- Existing events are **not** auto-split. `proposeSubjects` groups titles by shared
  prefix and the register *offers* the result; the user adopts it. Silent on
  anything recorded once, because there is no evidence of where the name ends.

## Stage sets: the vocabulary a register uses (D-043)

The user's framing: 秋招 and 论文 share one parent shape and differ only in their
states — 一面/二面 versus 投稿/返修/中稿 — so the states should be definable, named,
coloured, and reusable, with the state names serving as the statistic.

D-042 had already made both cases one mechanism, but the vocabulary was a
by-product of events (`SELECT DISTINCT stage`), which cannot be reused across
Journeys and cannot report a stage with **zero** things at it. `stage_sets` /
`stage_options` / `register_stage_sets` (migration `0007_stage_sets.sql`) make it
a thing the user names.

| Decision | Why |
| --- | --- |
| A layer on top | `stage` stays free TEXT; a register with no set behaves exactly as before, and attaching one rewrites nothing |
| No transitions, and no order | The user's instruction, given twice: anything may follow anything, and a stage is not a position — it only says what something is now. `position` survives as insertion order so a set re-reads stably, and nothing displays in it |
| Six named tones, no colour picker | The user picks a meaning, `tokens.css` owns the hue — a hex field would be a hard-coded colour in the database with no contrast guarantee |
| No built-in sets | Shipping 「面试流程」would bake a job-hunt tracker into the product |
| Keyed by `(journey_id, kind)` | A kind exists only as a property of its subjects, so a `registers` table would earn nothing |

**Where it shows up:** the register groups by recency of movement and shows the
set's empty stages too; `RecordEventDialog` offers the stages as one-click chips
(the text field stays, so a stage outside the set is always writable); a filed
timeline entry carries a stage chip and a 2px left edge in that tone; the Journey
Overview gains **Where things stand** — counts per stage, biggest first, per
register.

**Three things I proposed and dropped** on the user's instruction that stages are
not a flow and not a sequence: a funnel visualisation, `terminal`/`outcome` flags
for marking 成了/没了, and using the set as a display order (with the reorder arrows
that went with it). The middle one was my own addition rather than the request.

**The rename cascade is the risky part.** `StageOptionPatch` carries the id of the
row it replaces, so an id whose label changed is a *rename* and reaches every
event that stored the old label, in one transaction — otherwise everything
recorded at 一面 falls out of a set that now says 第一轮. Scoped to registers using
that set, because two registers can use 投稿 under different sets.

**Checks run**

| Command | Result |
| --- | --- |
| `cargo test --manifest-path src-tauri/Cargo.toml` | **129 passed** (14 new) |
| `npx vitest run` | **224 passed** (11 new), 0 failed |
| `npx tsc --noEmit` | clean |
| `npx eslint .` | clean |
| `npx prettier --check .` | clean |
| `npx vite build` | clean |
| `node scripts/layout-check.mjs` | **pass** — real Chrome at 880×600 |
| `node scripts/stage-editor-probe.mjs` | **pass** — see below |

Headless Chrome **did** start in this environment, unlike the sessions behind
D-027 and D-041, so this is the first change with a real-browser measurement.
`scripts/stage-editor-probe.mjs` was written for the specific risk: a stage row is
an input plus six swatches plus a remove button inside a 460px dialog. Measured at
880×600 — 412px row, 230px input, 18px swatches, no overflow, controls inside the
panel.

That probe also caught its own weakness: it *copies* the row's markup rather than
driving the real dialog, so when the reorder arrows were removed it kept measuring
a three-button row and passed on a layout that no longer existed. Corrected, and
the file now says so — the arrows going away is what widened the input from 162px.

The Rust tests cover a set's labels and tones surviving a round trip, reuse across
two Journeys, attach replacing rather than duplicating, the rename cascade *and*
its scoping to one set, a tally reporting empty stages, stages recorded outside
the set still counting, deletion keeping history, and a hex literal being refused
as a tone. The frontend tests drive the real screens: define a set from the
register, reuse it from a second Journey, pick a stage while recording, and a
guard that no `\d+%` renders in the Overview panel.

**Not verified:** no human has *looked* at the tones. The probe measures geometry,
not whether six tones read as one restrained family on a real page — worth a
glance at a register with all six in use. The desktop build was not re-run, so
migration 7 has only been applied to in-memory databases and temp files, never to
the user's real `journey.sqlite3`.

## States are reachable when the Journey is made (D-044)

**The bug, reported from real use.** *"怎么我打开还是没有：创建 journey 可以自主的选择
event 的状态呢"* — and the real database confirmed it: migrations 6 and 7 applied,
**zero** subjects, sets and attachments. The feature had been run and offered no
way in.

The cause was placement, not a missing implementation. The only entrance lived in
`RegisterView`, and a register does not exist until something is in it (D-042), so
a brand-new Journey had nowhere at all to set states up. I had argued the New
Journey dialog out of scope on Flow A grounds — a title should be the only
requirement — which was a reason not to *force* it, and I turned it into a reason
to hide it.

**Now:** a collapsed section at the foot of New Journey — "Does this Journey track a
set of things?" — giving kind, an optional first item, and the state list, or a
picker for a set already defined. Skipped, it changes nothing: a Journey with a
title still creates no register and no set, which a test asserts.

Two things this round also fixed about the checks themselves:

- The stage rows became one component (`StageListEditor`), used by the standalone
  dialog and this section. The immediate cause was the previous round's probe,
  which *copied* that markup and kept passing after the real row changed.
- `check:layout` now measures New Journey **expanded with four stages** — the
  tallest state any dialog reaches, and the one that can actually push a footer
  out of a height-capped panel. Measuring it collapsed proved nothing.

**Checks run**

| Command | Result |
| --- | --- |
| `cargo test` | **129 passed** |
| `npx vitest run` | **227 passed** (3 new), 0 failed |
| `npx tsc --noEmit` / `eslint .` / `prettier --check .` | clean |
| `npx vite build` | clean |
| `node scripts/layout-check.mjs` | pass, including the expanded dialog |

**Not verified:** the section has not been used against the real database — the
state above was read, not written to. No human has looked at the expanded dialog
either; the check measures geometry, not whether it reads well.

## Search reaches entries, stages and tracked things (D-047)

**Reported:** *"搜索 tmm 应该得可以搜的到投稿和返修两条吧,为什么会搜不到"*.

**The cause was not `stage`.** `Cmd+K` queried Journeys and notes — and nothing
else. Timeline events were never searchable, so those two TMM entries were
unfindable before D-046 as well as after. Confirmed against the real database:
`TMM` occurs twice in `timeline_events`, once in `subjects`, and **zero** times in
`notes` or `journeys`.

I also had this wrong in the previous entry, where I wrote that D-046 was what made
拒稿 unsearchable. It was never searchable; D-046 only made the gap visible.

**Now searched:** timeline entries (title, summary, reflection, **stage**, and the
name of the thing they are about) and tracked things (by name, ranked above their
own entries because a paper opens its whole history).

`timeline::search` is a separate function from `list` — that one has dozens of
callers whose contract is "the complete timeline", and a stray search term reaching
one would silently narrow a history. Blank input means no filter, not no results.

**A duplicate this exposed, caught by an old test.** Adding entries to the palette
made every `note_logged` entry appear beside the note it restates — two rows, one
destination. `journeyScreen.test.tsx > opens search with Cmd+K` failed on it. The
palette now drops note-backed entries; the query still returns them, because a
Journey-scoped search legitimately wants its whole history.

**Checks run**

| Command | Result |
| --- | --- |
| `cargo test` | **131 passed** (2 new) |
| `npx vitest run` | **231 passed** (4 new), 0 failed |
| `npx tsc --noEmit` / `eslint .` / `prettier --check .` | clean |
| `node scripts/layout-check.mjs` | pass |
| `cargo run --example try_search` | against the real notebook, read-only |

That last one is the one that matters:

```text
TMM   → the paper (返修, 2 entries) + 投稿 + 返修
返修   → TMM's revision, whose title contains no such word
拒稿   → all three rejected papers at once
```

## 秋招 organised the same way (D-048)

*"秋招也一样"* — and it was, with **no code change**. Same register, same stage sets,
different words: 4 positions, titles as `公司——岗位`, and the user's own seven states
(`投递 / 一面 / 二面 / 三面 / HR 面 / 录用 / 未通过`).

Two of the seven were changed and both were reported first: `hr 面` → `HR 面`
(capitalisation), `不录取` → `未通过` (不录取 reads as a formal rejection letter; 未通过
also covers being dropped after a round, which is what happened). I proposed
`已发 offer` for `录用` and the user kept their own word.

**The outcome was inside the summary, dated later than the entry:**

```text
08-20  上海赛索德——VLA 算法面试   26.8.22 ✅ 发 offer —— 300/天
```

Putting `录用` on the 08-20 row would date the offer two days early; leaving it at
`一面` would report the position as still interviewing. So **each outcome became its
own entry on its own date** — three new rows, which makes this the first data
migration that *created* records rather than only relabelling them. 19 events → 22.
Derived from what the user wrote, but new rows in someone's history, so it is stated
rather than buried in a count.

The register now reads:

```text
上海赛索德——VLA 算法   录用     2 entries
卫澜深海——VLA         录用     2 entries
上海仙工——VLA算法      未通过    2 entries
方奇科技——具身智能算法   —       1 entry   (planned: applied for, nothing yet)
```

**Checks run:** integrity and foreign keys clean; both registers intact (秋招/岗位 4,
科研论文/论文 5); two stage sets, one register each; the papers untouched. `try_search`
against the real notebook confirms the D-047 work reaches all of it — `仙工` finds the
position and both its entries, `一面` finds three interviews across three companies,
`录用` finds both offers.

**Summaries were left exactly as written**, at the user's instruction, so the offer
is currently stated twice — once in the interview's summary, once as the outcome
entry. A known state rather than an oversight.

## Tracking something new from the record dialog (D-049)

**The gap, in the user's words:** *"不一定是投稿这个状态，用户可以自己选状态"* and
*"加的只是「新建题目」"*. The 「About which」 picker only listed things that already
existed, so recording the first event about something new meant cancelling the
dialog, adding the row in the register tab, and starting over.

Worth being precise, because I got this wrong first: the field **was** showing for
科研论文 — five papers, so the picker rendered. What was missing were its *answers*,
not the field.

**What was added:** one option at the end of the same `<select>` —
`+ Track something new…` — and the two fields it reveals. It is the same question
(*which* thing), so the new answer belongs among the answers rather than beside them
as a separate button or mode.

```text
About which  [ 论文 · TMM (大修)          ▾ ]  [ 投稿 · 一面 ]
             [ + Track something new…      ]
  ↓ chosen
Its name     [ 2027 ICLR ]   Stage (optional) [           ]
             Starts tracking 2027 ICLR in 论文, with this event as its first.
```

- **No stage is preselected.** Explicitly asked for: the chips already behave this
  way and the user said *"状态不预选，你自己挑"*. A first event is usually 投稿 or
  投递, and guessing would be the app deciding what happened.
- **The register is asked for only when there is a choice.** One register (the
  common case) means the answer is known and the field is absent; several means the
  kind is asked, with the existing ones as suggestions and a new one still typeable.
- **One write.** `newSubject` rides on `NewTimelineEventInput` and
  `subjects::create` runs *inside* the event's transaction, so a failure cannot
  leave a register row that no event explains.
- **`subjectId` + `newSubject` is refused**, not resolved by precedence — they
  disagree about what the event is about.
- **Filing stays optional.** "Nothing in particular" is still the default.

**Checks run:** `npm run check` green — format, lint, typecheck, **235 frontend
tests** (4 new, driven through the real dialog: the one-pass create, the
two-register case, the blocked-until-named case, and that an event about nothing
still records and adds no stray row), and the web build. `cargo test` **133 passed**
(2 new, in the real repository because that is where transactions exist: `create`
composing inside a caller's transaction — the D-038 shape, since SQLite cannot nest
them — and a rolled-back event taking its new thing with it).

**Not done:** a Journey with *no* register still shows no picker at all, so the
first thing it ever tracks is still created from the register tab. That is the D-044
path and was left alone deliberately — this change was scoped to adding the entry,
per *"加的只是「新建题目」"*.

## The name is read out of the entry (D-050)

The user added `2026 CVPR` through the option above and reported two problems:

> *"trace something new 不应该是 track"* … *"2026 cvpr 就是个有多个状态的名字，你这样子
> 我得写两次"*

**The second one is D-046 repeating itself.** That decision reduced
`2026 AAAI 拒稿` to `2026 AAAI` because the title said 拒稿 twice — once as text, once
as a chip. D-049 then asked for the same words twice again, at input time: the paper's
name in the entry, and the paper's name in the name field.

So both fields are now **read out of the entry title**:

```text
What happened     [ 2026 CVPR 投稿 ]
About which       [ + A new one…  ▾ ]
Name in register  [ 2026 CVPR ]   Stage [ 投稿 ]
                  Adds 2026 CVPR to 论文 at 投稿, with this entry as its first.
                  Name and stage read from what you wrote above.
```

- **The split only uses stages the register already knows** — its set's labels, or a
  stage typed on an earlier entry. Nothing is read off the shape of the string, which
  is what separates it from the grouper, whose whole difficulty is finding a boundary
  with no vocabulary to consult. `2026 CVPR 送审` splits on nothing.
- **"状态不预选" still holds.** The app does not choose a state; it reads the word the
  user just typed into a visible, editable field. `2027 ICLR` yields an empty stage,
  and a test asserts it.
- **Derived until touched**, the D-014 rule: both fields follow the entry until either
  is edited, then stop — so entry `投出去了` with paper `2027 ICLR` still works, and
  further typing cannot overwrite a name of one's own.
- **Wording:** `+ Track something new…` → `+ A new one…`, *"Its name"* → *"Name in the
  register"*, and the hint says *adds … to 论文*. The register does the tracking.
- Longest match wins (`HR 一面` over `一面`); no word boundary is required, because CJK
  runs words together; a title that *is* a stage is left whole so no row gets an empty
  name.

**Checks run:** `npm run check` green — **241 frontend tests** (6 new: four unit tests
over `splitKnownStageFromTitle` including the user's own CVPR case, and rewritten
dialog tests covering the prefill, the empty-stage case, and a name that stops
following the title). `cargo test` unchanged at 133 — this slice is presentation only,
the write path is D-049's.

**Left as is:** the entry still reads `2026 CVPR 投稿` while its chip also says 投稿.
D-046 fixed that for existing rows by rewriting titles; doing it live would mean
editing the user's account of what happened as they type it, which is the line D-045
drew and not worth crossing for one repeated word.

## Confirming a plan asks what it turned out to be (D-051)

> *"点击 it happened 的时候也得和 add event 一样，需要有状态什么的"*

**The gap, in the user's own two entries.** `confirm` only ever wrote
`event_state`, `occurred_at`, `planned_for` and `title`, so pressing "It happened"
told the register nothing:

```text
2027 ICLR 截稿   filed onto 2027 ICLR   no stage
2027 ICRA        filed onto nothing     no stage
```

A submission that genuinely happened left the paper reading *"Nothing recorded yet"*.

**Why here.** D-041 already established that a plan cannot carry a state transition,
"because nothing has changed yet". The same reasoning puts the *stage* at
confirmation: that is the moment the thing actually happens, so it is the moment a
stage becomes true. Recording and confirming are the two such moments, and they now
ask one question.

**The picker is one component.** `SubjectField` — select, name field, kind field,
chips, hints — is now shared instead of ~215 lines existing twice. The extraction
went in first and was proved behaviour-neutral against the existing 35 register and
stage-set tests before any new behaviour was added.

`ConfirmPlannedEvent` gained `subject_id` (double option, so "leave it" and "unfile
it" stay different answers), `new_subject` (created *inside* the confirm transaction,
D-049's rule), and `stage` (dropped when nothing is filed). `confirm` now holds a
transaction, so a refused confirmation leaves the entry planned rather than
half-confirmed.

**Checks run:** `npm run check` green — **246 frontend tests** (5 new: the filed-plan
case, the `2027 ICRA` create-on-confirm case, confirming without filing, unfiling
dropping the stage, and the both-at-once refusal). `cargo test --lib` **138 passed**
(5 new, in the real repository because that is where transactions are: the two happy
paths, the unfile, the cross-Journey refusal leaving the plan intact, and a forced
mid-confirm failure leaving no register row).

**Not addressed, and now more reachable:** `subjects::list` still takes
`current_stage` from the latest event carrying one *without* filtering
`event_state`. Nothing in the UI writes a stage onto a plan today — the record dialog
offers one, and this change means the honest place to answer is at confirmation — but
a plan with a stage would still make the register report something that has not
happened. Listed under Known limitations since D-045; unchanged by this work.

## A long note stopped rendering part-way down (D-052)

> *"我新加了这个笔记，md 格式没有很好的编译"* — a 12,716-character note on PyTorch vs JAX.

**The note was fine; `livePreview` was not.** CodeMirror parses lazily, and
`syntaxTree(state)` returns only what is already parsed. Measured on the real note:

| | in the note | in the lazy tree |
| --- | --- | --- |
| characters | 12,716 | **3,419 (26.9%)** |
| headings | 22 | 6 |
| tables | 5 | 2 |
| code fences | 5 | 2 |
| list items | 35 | 6 |

Past 3,419 characters there were no nodes, so no decorations, so the rest rendered as
raw Markdown. `buildDecorations` now calls `ensureSyntaxTree` to force the parse, and
the plugin rebuilds when more of the document becomes available.

**Parsing to the viewport was not enough** — my first attempt did exactly that, and
the viewport is roughly where the lazy parse already stops. The whole document is
parsed instead, bounded by 50ms and 200k characters, past which it degrades to the old
partial behaviour rather than stalling.

**Checks run:** `npm run check` green — **247 frontend tests**, one new. It asserts
parse coverage rather than the DOM, and that limitation is worth recording: jsdom
reports zero-height elements, so CodeMirror's viewport collapses to ~280 characters
and the tail of a long note is never rendered at all. Probed directly rather than
assumed.

**A browser check was attempted and deleted.** It passed on the broken code as well as
the fixed code, because `Input.insertText` truncated the paste — CodeMirror got 26
lines instead of 411, so it was measuring a short note. A check that cannot fail is
worse than none, so it is gone rather than shipped green.

`scripts/probe-parse-coverage.mjs` is kept: point it at any `.md` file and it reports
lazy versus forced coverage. That is how this was found.

**Still unverified end to end:** the rendering of a long note in a real browser.
Getting a 12k-character document into the editor needs database seeding before load,
not a synthetic paste.

## Maths in notes, and a correction to D-052 (D-053)

> *"现在 md 文件的公式和文档其实都没有渲染出来"*

**Maths had never been implemented.** No `remark-math`, no KaTeX. The user's `ACT 面经`
note holds **85 formulas** — 54 display `\[…\]`, 31 inline `\(…\)` — with nothing to
render them.

**A correction to what I wrote in D-052.** I said tables "already work in the rendered
view" because `Markdown.tsx` registers `remark-gfm`. That component is **dead code —
nothing imports it.** The CodeMirror editor is the only place a note is ever displayed,
so anything absent there is absent everywhere. I should have checked the imports.

**What was added**

- `mathRanges.ts` — a pure scanner for `\(…\)`, `\[…\]` and `$$…$$`. Not the Markdown
  parser, which has no LaTeX extension at all.
- A KaTeX widget in `livePreview`, replacing each formula unless the selection touches
  it, exactly as headings reveal their `##`.
- **Maths now overrides Markdown.** This was the subtle half: `\mathcal L_{\text{ACT}}`
  parses as *emphasis*, so the old code hid the underscores and braces *inside* the
  formula. Decorations inside a maths range are now skipped.

**`$…$` is deliberately not supported.** `存钱买车` is an example Journey in `AGENTS.md`
§1, so `花了 $300 和 $500` would silently turn into a formula. Not rendering is
recoverable; mangling a sentence is not.

**A bug I introduced and caught before shipping.** The reveal rule started line-based,
copied from headings — but the cursor sits at offset 0 when a note opens, so a note
beginning with inline maths showed raw LaTeX and never rendered. That is the reported
complaint, reintroduced. Now selection-touch based.

**Checks run:** `npm run check` green — **260 frontend tests**, 13 new. Against the real
note the scanner finds 85 runs, 54/31 display/inline, matching the delimiter counts
exactly, longest run 111 characters (so no prose is being swallowed).

**Unverified:** the *appearance*. jsdom computes no layout, so KaTeX's own rendering is
untested here — as is D-052's. Both need a human to open the note.

## The editor would not open at all (D-054)

> *"现在笔记完全打不开了"*

**A regression I shipped in D-053.** The maths widget was emitted from the `ViewPlugin`,
and CodeMirror forbids a plugin-provided decoration from replacing a line break:

```text
RangeError: Decorations that replace line breaks may not be specified via plugins
```

A display formula spans three lines, so this threw during construction — the editor
never mounted and **no note would open**, maths or not. Worse than the bug it replaced.

**Fixed** by moving maths into a `StateField`, which is permitted to replace line
breaks; Markdown stays in the view plugin, and `livePreviewExtension` composes them.

**Why 13 green tests missed it:** every one used single-line inline maths, or placed the
cursor on the formula so the source was shown rather than replaced. Neither reaches the
replacement path. I tested the feature instead of the document I had already read.

**Checks run:** `npm run check` green — **262 frontend tests**, 2 new that fail with the
exact `RangeError` when the fix is reverted (verified). Both real notes — 11,113 and
12,716 characters — confirmed to mount.

## Tables are drawn as tables (D-055)

> *"这个还不是表格"* — and it wasn't.

**This reverses a decision I had defended in code comments.** The editor styled a
table's parts and left the pipes visible, reasoning that they are the column boundaries
and hiding them would make alignment impossible while editing. That optimised for
editing and forgot reading: nine rows of `| … | … |` is still source.

**Now:** a real `<table>` replaces the source while the cursor is elsewhere, reverting
to full Markdown the moment the selection touches it — the contract headings and
formulas already use. Cell contents render too (bold, italic, code, maths), and column
alignment is read from the `:---:` row.

Emitted from the same `StateField` as maths, per D-054, and reconciled with it: a
formula inside a cell is rendered by the table, because two overlapping replacements
are an error.

**Checks run:** `npm run check` green — **273 frontend tests**, 11 new. Against the real
note the 9-row table draws as 9 body rows with no pipes in the output.

**Found in the user's data, deliberately not "fixed":** `| VAE | \(q(z|x)\) |` splits
into three cells, because an unescaped `|` is a column separator in GFM. Every Markdown
tool reads it that way; special-casing it here would make this editor disagree with the
file. Reported to the user.

**Unverified:** appearance — column widths, borders, spacing. jsdom computes no layout.

## Tables below the fold, and a browser check that actually works (D-056)

> *"这个还没有"* — the second table in the note.

**The bug:** `buildBlockDecorations` read `syntaxTree(state)` instead of forcing the
parse — the lazy-parse trap D-052 fixed for headings, reintroduced for tables. On the
user's note the ready tree covered 3,419 of 12,716 characters and saw **2 of 5 tables**.

**Why three "verified" claims were worthless:** they counted DOM nodes under jsdom,
which reports zero heights, so CodeMirror renders 26 of 321 lines. Four of the five
tables were never in the DOM to count. My probe printed "1 tables drawn" and I read it
as a pass.

**`npm run check:long-note`** now drives the built app in real Chrome, seeds a note
through the app's own fixture, and scrolls it end to end. Four wrong turns are recorded
in D-056 — scrolling a container that does not scroll, counting `#` inside code fences,
and two bad heading keys that under- then over-counted.

**Results:** `PyTorch 与 JAX` 5/5 tables, 22/22 headings; `ACT 面经` 2/2 and 40/40; zero
raw pipes, zero raw `#`. **Fails when reverted** (2/5 tables, 24 raw-pipe lines), which
is what makes it a test.

**Checks run:** `npm run check` green — 273 frontend tests; `cargo test --lib` 138.

## Notes display polish (D-057)

The Notes screen now reads as a quiet editorial page rather than a lightly styled text
area:

- selected notes use the binder's violet wash and registration edge; excerpts can span
  two lines, and search has a visible focus state
- H1–H3 use the display serif, H2 sections carry a faint rule, paragraph breaks are
  tighter, and list/quote/code/table/formula treatments share the same token system
- a leading Markdown heading that exactly repeats the note title is collapsed while
  reading and restored whenever the editor is focused; the source remains untouched
- fenced code is one continuous region even across blank source lines, backed by a new
  live-preview regression test
- unordered `-`, `+`, and `*` markers now render as visible violet bullets while resting,
  ordered lists retain their numbers, and the raw marker returns on the active line
- the reading scale is quieter: 15px body, 28px title, and proportionally smaller headings

**Checks run**

| Command | Result |
| --- | --- |
| `npm run check` | clean — format, lint, strict typecheck, **276 frontend tests**, production web build |
| `npm run check:editor` | pass — real Chrome; heading scale, emphasis, code face and hidden syntax |
| `npm run check:layout` | pass — real Chrome at 880×600 |
| `npm run check:long-note -- docs/design/UX_SPEC.md` | pass — 24/24 headings, 1/1 tables, zero raw heading/table syntax |

The app data model and persisted Markdown were not changed.

## Next task

Plan cancellation and undo-confirmation are now available (D-058). Next reliability
steps are crash-safe draft recovery and validating OS Quit paths, followed by importing
and migrating external backups. Remaining register-specific gaps:

- **A stage set can only be reached from a register.** There is no Settings screen
  listing every set, so a set whose registers were all deleted is unreachable and
  undeletable from the UI. `deleteStageSet` exists and is tested.
- **A Journey with no register cannot start one while recording.** The picker is
  absent until something is tracked, so the very first thing still comes from the
  register tab or the New Journey dialog (D-044). Offering it here would mean asking
  for a kind *and* a name inside a dialog that is mostly about something else.
