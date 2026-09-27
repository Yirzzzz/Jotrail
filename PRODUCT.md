# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single person keeping their own notebook on their own machine. No teams, no
sharing, no accounts.

The primary situation is a student or early-career engineer running several
long-lived personal threads at once — a job search, a research topic, a paper, a
fitness habit, saving for something — and wanting to be able to look back later
and understand *how each one developed*, not just what it looks like now.

*(Inferred from the repository's own spec and demo fixture, which are written
around exactly this person: 秋招 2026, VLA 学习, 论文写作, 健身, 理财·买车,
旅行计划. Confirm or correct.)*

## Product Purpose

A local-first desktop notebook where any long-running theme can become its own
timeline.

The user writes notes and lives their life; the application quietly preserves how
things developed. Success is that after a few weeks of use, opening a Journey
immediately answers: *this is how this part of my life has developed.*

## Positioning

Conventional note apps preserve **snapshots**. This one preserves **development**.

The mechanism a neighbouring app could not truthfully copy: an explicit event
model where `occurred_at` (when something happened) is stored separately from
`created_at` (when it was typed), and where meaningful state changes are appended
as history rather than overwriting the previous value. `Not Ready → Ready →
Applied` stays recoverable as a sequence.

## Operating Context

- Desktop app, used at a laptop, in sessions of a few minutes.
- Frequently opened to write one thing and leave; occasionally opened to review a
  Journey deliberately.
- Often used in the evening — the reference screens the user pinned are dark and
  say 晚上好 / "Good evening".
- No network on the critical path. The app must be fully usable offline.
- The user's own content is mixed-language (Chinese notes, English technical
  terms). Chrome is English; content is whatever they typed.

## Capabilities and Constraints

Built and working: Journey CRUD, Markdown notes with autosave and live preview,
tasks, an event/timeline model with `occurred_at` separate from `created_at`,
per-Journey and global timelines, recorded state changes, light/dark/system
theming, `Cmd+K` search, `Cmd+N` capture.

Constraints that later work must respect:

- Tauri 2 + React + TypeScript + SQLite. No server, no sync, no telemetry, no
  network AI calls.
- Minimum window 880×600.
- SQL lives only in `src-tauri/src/db`; UI depends on the `Repository` interface.
- Mutating state and appending its history happen in one transaction.
- Timestamps stored UTC, rendered and grouped in local time.
- Schema changes are new forward-only migrations.

Undecided: attachments, export/backup, FTS search, per-Journey custom views
(Positions/Skills/Papers and similar), undo.

## Brand Commitments

- Product name: **Journey Notes** (working name; the user has not finalised it).
- **Chrome is English.** Confirmed by the user this session. Their own reference
  screens mix English navigation with Chinese section titles; they chose English
  throughout for chrome. User content renders in whatever language it was written.
- **The pinned visual direction is the user's four dark reference screens** in
  `docs/design/reference/`. These are binding, not exploratory:
  `2f793538…` (Today), `8c3de494…` (Journey timeline),
  `aacf1b0f…` (Journey overview), `c4aeaf53…` (Note detail).
- Journey covers are **photographic**, and the **user supplies the images**
  (confirmed this session). The build provides the slot and a non-photographic
  placeholder until they do.

## Evidence on Hand

Real: the four pinned reference screens; a demo fixture
(`fixtures/demo-seed.json`) with six Journeys, notes, tasks and recorded state
changes, seeded only in development builds.

Absent, and must not be fabricated: photographic cover assets, any user
testimonial, install counts, pricing, or performance benchmark. There are no
real users other than the author.

## Product Principles

1. **Writing beats data entry.** A new note is one text surface with nothing to
   fill in first. Structure is always optional and always addable later.
2. **Journey is generic.** The core never becomes specific to recruiting, study,
   fitness or finance. Domain-shaped views are built on top, never baked in.
3. **Chronology is the product.** The Timeline is the default view of a Journey,
   ordered by when things happened, not when they were typed.
4. **History is append-only where it matters.** A meaningful state change is
   recorded, not overwritten.
5. **Local-first and private by default.** The user's data stays on their machine.

## Accessibility & Inclusion

No user-specific requirement established. The working bar: WCAG AA contrast for
body text, visible keyboard focus, full keyboard reachability of primary actions,
and `prefers-reduced-motion` honoured.

Known open issue: the light palette inherited from `docs/design/STYLE_TOKENS.md`
has nine contrast shortfalls in metadata-weight text. The dark palette passes.
