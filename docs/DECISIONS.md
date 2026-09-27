# Product & Engineering Decisions

This file records choices already made in product discussion. Coding agents should not reopen them casually.

## D-001 — The product is a note app first

**Status:** decided

Writing and reviewing notes is the primary behavior. Structured data exists to enrich the notebook, not to turn writing into form filling.

## D-002 — Journey is the central organizing concept

**Status:** decided

A Journey is a user-created thematic space whose most important representation is its timeline over time.

Examples are intentionally broad: job search, study, research, fitness, finance goals, travel, and personal projects.

## D-003 — Job search is only an example Journey

**Status:** decided

The job-search screenshots are a rich example because they make state transitions easy to visualize. Career-specific concepts must not become mandatory top-level product modules.

## D-004 — Timeline is the default Journey view

**Status:** decided

When opening a Journey, default to Timeline, not Dashboard/Overview.

## D-005 — Two timeline scopes

**Status:** decided

There is a global Timeline across the user's system and a per-Journey Timeline filtered from the same underlying event/history model.

## D-006 — Local-first MVP

**Status:** decided

No login, cloud backend, collaboration, automatic telemetry, or network AI dependency in MVP.

## D-007 — Avoid fake life progress percentages

**Status:** decided

Prefer qualitative status, milestones, evidence, timeline transitions, and explicit goals. Percentages are permitted only when the underlying metric is genuinely measurable.

## D-008 — Data entry must remain optional/lightweight

**Status:** decided

A user should always be able to create a simple note first and classify/link it later.

## D-009 — Current visual direction

**Status:** decided for MVP

Primary visual reference is `design/reference/journey-timeline-primary.png`: light, quiet, editorial desktop UI with left sidebar, central timeline, contextual right rail, warm restrained accents.

## D-010 — Technical default

**Status:** default, reversible before implementation begins

Tauri 2 + React + TypeScript + SQLite. This favors a lighter desktop footprint and local ownership.

## D-011 — Markdown editor perfection is not a blocker

**Status:** decided; **satisfied and superseded by D-026**

MVP may use a reliable Markdown editor + preview rather than spending the first milestone building a perfect Typora-style WYSIWYG editor. The editor must be encapsulated so it can be upgraded later.

The encapsulation paid off: the textarea was replaced with a live-preview
CodeMirror editor without touching note domain logic. See D-026.

---

# Decisions made during the first implementation slice

Recorded by the implementation agent. These resolve ambiguities that were not
blocking; each takes the simplest option consistent with `AGENTS.md`.

## D-012 — A Rust repository layer, not the Tauri SQL plugin

**Status:** decided

`ARCHITECTURE.md` §2 allowed either. A thin Rust layer using `rusqlite` was
chosen because §5 requires that mutating an object and appending its history
happen in **one transaction**. The SQL plugin executes statements over a
connection pool, so `BEGIN`/`COMMIT` issued as separate calls are not reliably
the same connection — exactly the guarantee we cannot give up.

It also puts domain rules where they can be unit-tested without a webview, which
is why the restart test can exist at all.

## D-013 — Navigation is a state machine, not a router

**Status:** decided

Six destinations, no URLs to honour, no deep links, no back/forward
expectations in a desktop app. A discriminated-union `Route` in the Zustand store
is fully typed, trivially testable, and avoids a dependency. Last route is
persisted to `localStorage`, satisfying USER_FLOWS.md Flow H.

Note ids are deliberately *not* restored on launch: reopening on a blank editor
is friendlier than reopening on a note that has since been deleted.

## D-014 — Note titles derive from the first line

**Status:** decided

Resolves open question 4's cousin: whether the editor needs a separate title
field. It does not. The title tracks the note's first line (with `#` stripped)
until the user types a title of their own, after which it sticks; clearing the
title hands naming back to the body.

This keeps "writing must feel easier than data entry" (AGENTS.md §2.1) literally
true — a new note is one text surface with nothing to fill in first.

The rule is implemented in both TypeScript (so the title updates live while
typing) and Rust (so a title can never be empty in the database). Both are
tested against the same cases.

## D-015 — Timelines default to newest-first, both offer the other direction

**Status:** revised by the user — *"最新的应该在上面"*

Originally: journey timelines read oldest-first, the global timeline
newest-first. The reasoning was that the primary reference shows a journey
timeline ascending (25 Aug at the top, 12 Sep at the bottom) — a journey is a
*story*, and stories are read forwards.

That is true of reading a journey end to end, and false of what the screen is
actually opened for. A journey in use is returned to, not read from the start,
and the entries being returned to are the newest ones. Ascending order put them
below everything that had already happened, so the screen grew a worse first
impression the longer a journey ran — the opposite of what the reference was
trying to show.

Both timelines now open newest-first and carry the same toggle, so the story
reading survives as a choice rather than as the only option. Both still read the
same records through the same query; only `ORDER BY` direction differs.

Not changed by this:

- **Latest progress** (D-031) runs left-to-right chronologically. It is a path,
  and a path has a direction regardless of how the feed below it is sorted.
- **Recent development** (D-028) stays oldest-first within its window: it is a
  short derived run of turning points, read as a sequence.
- The journey **rail** still queries oldest-first, which `JourneyRail` depends on
  when it takes the last entry as the latest one.

## D-016 — Removing a link removes its derived `note_logged` event

**Status:** decided

`DATA_MODEL.md` §6 says events should *generally* remain immutable. A
`note_logged` event is not an independent occurrence, though — it is a record of
an association. Unlinking is therefore treated as correcting a mis-filing rather
than erasing history, and the derived event goes with the link.

Where an event is linked to several journeys, only that journey's link is
detached; the event survives while any journey still references it. Task
completion events are *not* removed this way — completing a task genuinely
happened, independent of any journey.

## D-017 — An in-memory repository exists alongside SQLite

**Status:** decided, with a known cost

`Repository` has two implementations: Tauri/SQLite (real) and in-memory (tests,
and `npm run dev:web` for working on the UI in a browser).

This is duplication, and duplication drifts. It was accepted because the
alternative is worse: without it, no test can drive the real components through
a real user flow, and the loop the whole product rests on would be verified only
by hand.

It is bounded deliberately:

- SQLite is the source of truth for persistence behaviour; the in-memory version
  reproduces only what the UI needs to behave correctly (link → log,
  complete → record, order by `occurred_at`).
- Its module header says so explicitly.
- The Rust tests, not the frontend tests, are what verify persistence.

If the two ever disagree, the Rust implementation is correct by definition.

## D-018 — Seeded tasks get derived completion events

**Status:** decided

`fixtures/demo-seed.json` lists two finished tasks but no completion events for
them. Loading it verbatim would produce a database contradicting a rule the app
itself enforces. The seeder therefore derives a `task_completed` event for any
seeded task with a `completed_at`, using that timestamp as `occurred_at`.

## D-019 — Chrome is English; content is whatever the user writes

**Status:** decided

The reference image has English navigation (Today, Notes, ABOUT, PINNED) with
Chinese content, and Chinese type badges. Badges are chrome derived from
`event_type`, not user text, so they follow the chrome and read as English and
domain-neutral ("Note", "Task done", "State change", "Milestone"). Unknown event
types are humanised rather than dropped, so a future event kind renders without
a code change.

## D-026 — The editor is live-preview Markdown, not edit/preview modes

**Status:** decided, replaces the textarea from the first slice

The textarea + preview toggle satisfied D-011 but made writing unpleasant: notes
looked like raw source while being written, and seeing them formatted meant
leaving writing mode. For a product whose first principle is that writing must
feel easier than data entry, that was the wrong place to economise.

The editor is now CodeMirror 6 with Typora-style live preview: Markdown renders as
you type — headings large, bold bold, code monospace — and the syntax characters
are hidden **except on the line the cursor is on**, where they reappear so they
can be edited. The preview toggle is gone; there is only one mode.

**The document stays plain Markdown.** Everything is `Decoration.mark` and
`Decoration.replace` — presentation only, never a document change. This is the
property that matters: autosave, timeline summaries and any future `.md` export
all keep seeing exactly what was typed. A test walks the cursor over every line of
a document containing every supported construct and asserts the source is
byte-identical, and that no change events were emitted.

Cost: about 350 kB of JavaScript (784 kB total, 262 kB gzipped). Acceptable for a
local desktop app with no network on the critical path, and it is the core writing
experience rather than an ornament.

Verification needed two layers, because jsdom applies no CSS and computes no
layout: `livePreview.test.tsx` covers the decoration logic and the
never-rewrite guarantee, and `npm run check:editor` drives the built app in real
Chrome, types Markdown with actual key events, and asserts computed font sizes and
weights (h1 24px vs 17px body, weight 600; bold 700; italic italic; code
monospace) with markup hidden. Confirmed to fail when live preview is removed.

Not implemented: images, tables rendered as grids, or drag-to-reorder. Those are
worth having but none of them block writing.

## D-023 — Adding a task to a Journey is recorded; an unscoped task is not

**Status:** decided — deliberately widens `ARCHITECTURE.md` §10

§10 listed only "task completion/reopen" as worth an event, so the first slice
recorded nothing when a task joined a journey. In use that turned out to lose the
more interesting half: a journey showed *that* something was finished but not
that it had been **started**, so the gap between deciding and doing — which is
the development this product exists to preserve — was invisible.

`PRODUCT_SPEC.md` §5's own example timeline includes "new tasks created", so §10
was the narrower of two specs that disagreed.

The rule now:

| | event |
| --- | --- |
| task created **in** a journey | `task_added` |
| existing task filed into a journey | `task_added`, dated when the task was *created* |
| completed | `task_completed` |
| reopened | `task_reopened` |
| task with **no** journey | nothing at all |
| `todo` ↔ `doing` | nothing |

Two details that matter:

- **Filing a task later dates the event when the task was created**, not when it
  was filed, so the decision lands where it actually belongs on the timeline.
  Same reasoning as `occurred_at` generally.
- **Filing an already-finished task records both halves.** Showing only "Added"
  for something already done would misrepresent it.

An unscoped task stays silent, which is what keeps the noise concern in §10
honoured — a passing errand is not part of any story.

## D-024 — The day's task events render as one group

**Status:** decided

With D-023 doubling the number of task events, a journey with daily tasks (健身
being the obvious case) would become a wall of one-line rows, burying the notes,
state changes and milestones that carry more meaning.

Consecutive task events on a day now collapse into a single block — the "task
group" density `PRODUCT_SPEC.md` §9 and `AGENTS.md` §7 both list and which the
first slice had not implemented. It shows a heading, a count ("2 done · 1
added"), and one line per task.

Only *consecutive* events merge: a note logged between two tasks keeps them
apart, because the order things happened in is the whole point of a timeline. A
run of one stays a plain row, since a group of one needs no heading.

## D-025 — A logged note's summary skips a repeated title

**Status:** decided (small correctness fix)

A note written as `# ROS2 Action` + body produced a timeline entry titled "ROS2
Action" with the summary "ROS2 Action · body" — the title printed twice. The
excerpt now drops a first line that merely repeats the title, and a note that is
*only* a heading gets no summary rather than an echo of itself.

## D-022 — Deleting a Journey keeps its notes and tasks

**Status:** decided

The first slice shipped with archive but no delete, which made a mistyped journey
permanent. Deletion now exists, and the question it had to answer was what
happens to the content.

Notes and tasks are **kept**, and become unfiled. A journey is a way of
organising things; destroying someone's writing because they tidied their sidebar
would be indefensible, and notes are explicitly designed to live without a
journey (D-008).

What goes:

- the journey and its links
- events that only ever described this journey — its status changes, and the
  `note_logged` records of associations that no longer exist (same reasoning as
  D-016)

What stays:

- events shared with another journey, minus this association
- free-standing recorded events, as unscoped history — they describe a real
  moment, not a filing decision

The dialog shows real counts of both halves rather than a generic warning, and
offers Archive alongside, because "get this out of my sidebar" is the more common
intent and it loses nothing. Deletion is **not** soft — the confirmation is the
only safeguard, noted as a limitation in STATUS.md.

## D-021 — Timeline ties break on insertion order, not on id

**Status:** decided (fixes a real bug found by a flaky test)

`occurred_at` has millisecond resolution, so two events can genuinely tie — a
task completed the same instant a note is logged, or a seed inserting several
rows at once. Ordering originally fell through to `id`, which is a random UUID,
so a tied timeline could come back in a different order on each read. A test
caught it intermittently (~30% of runs).

Migration `0002_event_sequence.sql` adds a `seq` column recording insertion
order, and ordering is now `occurred_at` then `seq`. `occurred_at` still
outranks it — `seq` is only ever a tie-break, so backdating keeps working.

Both are covered by tests: one asserts repeated reads of five same-millisecond
events are stable and reverse correctly, another that an event inserted later but
dated earlier still sorts first.

## D-020 — A date without a time is stored at local noon

**Status:** decided

When only a date is given (the common case when backdating), the timestamp is
placed at 12:00 local rather than 00:00. Midnight sits one small timezone shift
away from landing on the previous day; noon does not. Timeline grouping uses
local date parts throughout for the same reason.

## D-027 — Dark theme ships as a second token block, not a second design

**Status:** decided; resolves open question 7

The dark reference screenshots
(`8c3de494…`, `aacf1b0f…`, `c4aeaf53…`, `2f793538…`) were requested alongside the
light primary reference, so both themes are now supported.

**It is a re-tokenisation, not a redesign.** Layout, spacing, type scale and
information hierarchy are identical in both themes; only the colour tokens
change. This was possible because the first slice already routed every colour
through `styles/tokens.css` and left `[data-theme='dark']` named as the intended
hook. Delivering it needed one new token block, one small store, one button — and
six hard-coded colour values removed (five `#fff`, one `rgba()` modal backdrop),
which were the only places bypassing the tokens.

Three tokens were added because a dark theme exposes assumptions a light-only
palette can leave implicit:

- `--accent-contrast` — text/icon colour *on* a filled accent surface. White on
  light, near-black on dark. Previously `#fff`, hard-coded in four places, which
  would have been illegible on the lightened dark accent.
- `--accent-hover` — was the literal `#48684f` in the primary button's hover rule.
- `--backdrop` and `--selection` — the modal scrim and text selection, both of
  which need different alpha and hue per theme.

`prefers-color-scheme` is honoured through a third preference, `system`, which is
stored as *itself* rather than resolved once and saved as light/dark; otherwise
the app would silently stop following the OS after first launch. The theme is
applied in `main.tsx` before React renders, so the window never flashes light and
corrects itself.

**Colour choices worth defending** (values in `tokens.css`, rules in
`STYLE_TOKENS.md`):

- `--bg-app` stays darker than `--bg-surface`, preserving the light theme's
  relationship rather than inverting it, so the reading column still lifts off
  the chrome.
- The accent lightens from `#54785e` to `#7fae89`. The light green is a
  foreground colour designed against white; on charcoal it fails contrast.
- "Soft" fills become low-alpha tints rather than pale solids, because a pastel
  that reads as a quiet wash on white glows on a dark surface.

Verified: every one of the 23 colour tokens has a dark value with no dark-only
strays; a WCAG contrast pass over the text/surface, accent and pill-tint
pairings has **no failures in dark** (the light theme has nine pre-existing
shortfalls, all inherited from `STYLE_TOKENS.md`, all in metadata-weight text —
recorded here as known, not introduced by this change). 8 new frontend tests
cover the attribute, persistence, OS-following, and both controls.

Not done: `npm run check:layout` and `check:editor` could not run in the
environment this was implemented in (headless Chrome cannot start), so **neither
theme has had a real-browser visual pass since this change**. The CSS is
token-only and the built stylesheet contains the dark block, but a human should
look at both themes before this is called finished.

## D-028 — Development is derived from history, never from an invented number

**Status:** decided

Three panels were requested from the dark reference screenshots: the day
timeline and "up next" from the Today dashboard, "recent development", and the
journey overview composition generally.

All three are built. Each one is **derived from timeline events that already
exist**, which is what made them possible without new tables:

| Panel | Source |
| --- | --- |
| Today · timeline | events whose `occurred_at` is today, ascending |
| Up next | task `due_at` and future-dated events, with a real day count |
| Recent development | milestones + `state_changed`, oldest-first |
| Tracked states | `state_changed` payloads grouped by `field` + `subject` |
| Current focus | the most recent milestone or state change |
| In this Journey | counts of the tabs that actually exist |

**What was deliberately not copied, and why.** The overview reference is built
around numbers the app cannot honestly produce:

- the **68% focus ring** and **"5 days to completion"** — nothing measures either
- the **capability map's per-skill percentages** (72%, 65%, 40%…) and its
  `Advanced 80%+ / Intermediate 50–79%` legend — a level is a judgement, not a
  position on a scale
- **Papers / Projects / Skills** as tabs and rail panels — per-journey custom
  views, still post-MVP (D-003)

D-007 already ruled the percentages out. The substitution is "Tracked states":
the user's **own recorded values**, each showing `previous → current`, dated, and
counting how many transitions are on record. That answers the question the
percentage was pretending to answer — how far has this come — using something
real. A frontend test asserts no `\d+%` appears anywhere on the Overview, so the
ring cannot quietly return.

The "recent development" sparkline became a dated vertical rail rather than a
line chart. A line implies a measured quantity rising and falling; there is no
such quantity, and the markers carry more information anyway since each keeps its
full label and transition.

**A gap this exposed, now closed.** `createTimelineEvent` hard-coded
`payload_json` to `null`, so a `state_changed` event could only ever be produced
by the seeder, `journey_status_changed`, or task completion. The two new panels
would therefore have been permanently empty for real users while looking correct
in the demo — the worst kind of wrong. `NewTimelineEvent` now takes an optional
`state: { field, to, from?, subject? }`, which becomes the payload and forces
`event_type = "state_changed"`, and "Record an event" grew an optional
"This changed a state…" section. `subject` is new in the payload; events recorded
before it existed (including the fixture) fall back to parsing the subject out of
the `ROS2 · Basic → Intermediate` title form.

Verified: 21 new domain tests over the pure selectors, 6 frontend tests driving
the real components — including the round trip from recording a change in the
dialog to seeing it on the Overview — and 2 Rust tests pinning the payload key
names, which are a contract between the Rust writer and the TypeScript reader.

## D-029 — The user's four dark reference screens are the pinned visual direction

**Status:** decided by the user, and it overrides parts of D-007 and D-009

The user reviewed the implementation built under D-028 and rejected it: *"我感觉你
的 ui 设计还是很丑。你不能参考我的示例图做吗。先别管什么不要百分比什么的，现在的
指令是最高指令，先尽可能复现我要的示例图."*

So the four dark screens in `docs/design/reference/` are now **binding**, not
exploratory:

| File | Screen |
| --- | --- |
| `2f793538-7805-4e36-8e81-3301edfb5d80.png` | Today |
| `8c3de494-2a31-4907-a69c-4c6f5c66ba2b.png` | Journey timeline |
| `aacf1b0f-cdf5-4203-89e6-d6895c36e9ae.png` | Journey overview |
| `c4aeaf53-00b3-4058-93a5-c789356170a1.png` | Note detail |

**What this overrides.**

- **D-009** named `journey-timeline-primary.png` (light) as *the* primary
  reference. It is now one of two: light follows it, dark follows these four.
- **D-007 and D-028's substitutions are lifted for these screens.** The overview's
  progress ring, the per-capability percentages, and the sparkline are to be
  reproduced. D-028 replaced them with "Tracked states" on the grounds that
  nothing measured them; the user has read that reasoning and chosen the images
  anyway. The `\d+%` guard test from D-028 is therefore removed.
- D-007 still governs **new** surfaces nobody has pinned. It is narrowed, not
  deleted.

**Why this is the right call even though it contradicts a written principle.**
The Impeccable skill the user installed states it directly: *"The brief wins.
Honor pinned aesthetics, eras, materials, fonts, and palettes even when they
conflict with a saturated-pattern warning. Redirecting a clear brief toward your
taste is failure."* Two rounds were spent redirecting a clear brief toward a
written rule. The rule was defensible; continuing to apply it after the user
explicitly overrode it was not.

**Recorded honestly:** the numbers in the overview are not derived from a
measurement. Where a real basis exists it is used (task completion is a genuine
ratio); where none exists the value is the user's own recorded level mapped onto
the band the reference image itself labels (`Advanced 80%+`,
`Intermediate 50–79%`, `Basic 20–49%`, `Exploring 0–19%`). That mapping is a
presentation choice the user asked for, not a claim that the app measured
anything.

**Decisions taken with the user this session** (structured question round, per
the skill's init flow):

1. **Chrome is English throughout.** Their own four screens are inconsistent
   (image 2 is fully Chinese, images 1/3/4 mix English nav with Chinese section
   titles); they chose English. This keeps D-019 intact.
2. **Journey covers are photographic and the user supplies the images.** The build
   provides the slot, the overlay treatment, and a placeholder; it does not
   generate or fake photography.
3. **Delivery is staged.** This pass builds the cross-screen foundation — top
   search bar, cover band, card-shaped context rail, card-shaped timeline
   entries — which is where most of the visual gap actually lives. The remaining
   screens follow once the user has seen it.

`PRODUCT.md` now exists (written this session under the skill's `init` flow) and
records the binding brand commitments.

## D-030 — Today follows the pinned entrance, not a task inbox

**Status:** decided while implementing the first remaining screen after D-029

The pinned Today reference (`2f793538…`) is the composition: a dusk hero with a
time-of-day greeting, a Now card for capture, the day as a timed spine, Journey
tiles with real counts, and a rail of upcoming / due-now / pins.

Skill-side refusals of that mock, kept because they are product-false or chrome
the user already ruled out:

- No fabricated given name in the greeting; chrome stays English (D-019).
- No invented daily quote or progress bars.
- No rainbow Journey colours (STYLE_TOKENS.md: one accent family).
- No sync status, notification bell, or avatar.
- A task due tomorrow is listed once, in Up next, not also in To do.

The dusk hero is a tokenised wash (`--cover-dusk-*`, `--on-media`), not a fake
photograph. Covers remain user-supplied (D-029).

## D-031 — Journey Timeline stays the story; Latest progress is the path

**Status:** decided while combining the two pinned Journey screens

The first pinned Journey screen is the product-defining view: cover, generic
tabs, a vertical chronology, a highlighted latest card, and a context rail.
That remains the Timeline tab (D-004).

The second screen's **Latest progress** path is kept as a derived widget, not as
a second home for the Journey:

- On Timeline, it sits above the feed. A node scrolls to the matching entry.
- On Overview, it replaces the older vertical development list.

Nodes are real turning points only: the Journey's start day, `state_changed`
events, and milestones. The wave's Y is decoration; X is chronological order.
The last node is labelled **Now** because it is the current position on that
path, not a calendar claim.

Skill-side refusals of the second mock, kept because they are product-false or
already ruled out:

- No 68% focus ring, capability percentages, or invented completion (D-007).
- No Papers / Skills / Projects tabs (D-003).
- No second purple palette; the path uses the one accent family.
- No decorative quote.

---

## D-032 — The visual world is a multi-pen strip-chart recorder, light only

**Status:** decided by the user this session, replacing the previous visual world

The user asked for a redesign to Awwwards/FWA/CSS Design Awards standard, pinned
a gradient palette (`uiprompt.site` → visual-gradients), specified Lucide icons
with no emoji anywhere, and said light only for now: *"我们现在不做 dark，先只做
light"*. Offered a direction round with re-roll and a standing exit to the
category standard, they locked **走纸记录仪 / The Strip-Chart Recorder**.

**The world.** The app is one continuous sheet of chart paper. Each Journey
is a pen channel that draws on it. A stylus marks NOW and never leaves the sheet.
Time is the axis rather than a label, which is why this world was chosen over the
alternatives: the product already stores `occurred_at` separately from
`created_at`, and a chart recorder is the one instrument whose entire purpose is
*when a thing happened*.

(This said *ruled* chart paper, and the paper was ruled across the whole viewport.
**D-033 removed that** at the user's direction: the paper is plain, and ruling
survives only inside a chart lane where it measures a real time axis.)

**Two raises**, taken from challengers that lost the weighing:

- From Cyclorama Dawn: the paper is the whole viewport, not a card on a page.
  `.shell`, `.shell__main` and `.shell__rail` are transparent; the ground on
  `body` is the reading surface. (Still true after D-033 — the ground is simply
  no longer ruled.)
- From the drum-machine step row: NOW is a physically present stylus, not
  something inferred from scroll position.

Three disciplines were kept from directions that were declined outright: the
one-bit desktop's rule that **every state carries a non-colour signal** (journey
status is a shape — filled dot, open ring, bar, square, hairline ring — and
`StatusPill` carries a Lucide mark); Saville's rule that **one plot owns the
field** (the sheet head is the trace and nothing else); and the orizuru's rule
that **earlier state stays visible**, which the existing event model already did.

### What this supersedes

**D-027 (dark theme) is withdrawn, not merely paused.** The dark token block was
authored against the previous green world; with pen gradients in place,
`[data-theme='dark']` would have repainted the app in a palette that exists
nowhere else. Rather than ship a switch with one working position, the theme
mechanism is removed: `app/theme.ts`, `components/ThemeToggle.tsx`, the Settings
Appearance section, and `test/theme.test.tsx`. Dark returns as its own pen set
drawn against a dark sheet — an inversion of these four gradients will not work,
because each pen's deep stop was chosen for contrast *on paper*.

The retired dark palette, recorded here because the repository has no git history
to recover it from:

```css
[data-theme='dark'] {
  color-scheme: dark;
  --bg-app: #14171a;      --bg-surface: #1a1e21;   --bg-subtle: #23282c;
  --bg-warm: #262019;     --text-primary: #e8ebe6; --text-secondary: #a2a9a3;
  --text-tertiary: #6f766f; --border: #2b3034;     --border-strong: #3a4045;
  --accent: #7fae89;      --accent-soft: rgba(127, 174, 137, 0.16);
  --accent-warm: #d79a5f; --accent-warm-soft: rgba(215, 154, 95, 0.16);
  --accent-contrast: #10130f; --accent-hover: #93bd9c;
  --success: #6faa78;     --warning: #d0a05e;      --danger: #d98079;
  --danger-soft: rgba(217, 128, 121, 0.16);
  --selection: rgba(127, 174, 137, 0.28); --backdrop: rgba(8, 10, 9, 0.58);
  --on-media: #eef0ea;    --on-media-muted: rgba(238, 240, 234, 0.74);
  --cover-dusk-from: #4a3d34; --cover-dusk-mid: #2e3a36; --cover-dusk-to: #141618;
  --shadow-subtle: 0 1px 2px rgba(0,0,0,0.3), 0 6px 20px rgba(0,0,0,0.22);
  --shadow-overlay: 0 4px 12px rgba(0,0,0,0.4), 0 24px 48px rgba(0,0,0,0.44);
}
```

**D-029 (the four pinned dark reference screens) no longer binds the palette.**
What it settled that still holds: the three-region layout, the top bar, and rail
sections as real panes. What it no longer settles: colour, type, and the
photographic cover treatment. The user's live brief outranks a pinned reference.

**AGENTS.md §7's "avoid saturated gradients" is overridden, narrowly.** The user
asked for gradient cards by name and pinned the palette. The conflict is resolved
by scope rather than by ignoring the principle: **gradients belong to traces,
fills and channel identity; never to text, and never as the only carrier of
meaning.** Every pen has a `-ink` deep stop for type, and a channel is always
named in words and marked with an icon beside its colour. The interface stays
quiet where it counts — the reading column is flat paper and near-solid panes.

### What the palette is

The four gradient pairs are the pinned reference verbatim: `#9333ea → #ec4899`,
`#2563eb → #9333ea`, `#f97316 → #fbbf24`, `#ec4899 → #f43f5e`, on `#f4f4f2`
paper. Pen assignment is `FNV-1a(journey.id) % 4` — pure, stable across restarts,
no migration, no stored field (`lib/pens.ts`).

### Contrast, fixed rather than carried forward

PRODUCT.md logged nine contrast shortfalls in the light palette's metadata text.
All ink and semantic tokens now clear WCAG AA (4.5:1) against the **worst** of the
three grounds — `--sunk`, not white — which is the distinction that mattered: the
first replacements for `#969b94` (2.8:1) passed on white and failed at 4.15:1 on a
sunk well, which is exactly where metadata sits. `--ink-tertiary` is `#5f6772`
(4.91:1 worst case); `--pen-3-ink`, `--success` and `--warning` were darkened for
the same reason.

### Honesty of the trace

`domain/trace.ts` is the load-bearing claim and is unit-tested. X is always
`occurred_at`. Y is only the domain's three `importance` values — not engagement,
not productivity, not a score. Nothing is interpolated: a quiet stretch draws a
flat baseline, and the copy says the pen was resting rather than apologising for
an empty state. On a live window the trace stops at NOW, because the recorder
cannot have drawn the rest of today.

---

## D-033 — The paper is plain; only a chart lane is ruled

**Status:** decided while building D-032, correcting it

The first build of the recorder ruled the **entire viewport** — a fine division
every 8px and a labelled one every 48px, fixed to the window — on the reasoning
that chart paper is ruled paper.

That was the world applied literally rather than understood. A division means
something only where it divides something: on the Today sheet the ruling sat
against a real time axis, but behind Notes, Settings and a Journey's reading
column there was no axis for it to measure, so it became graph-paper stationery.
Texture pretending to be structure, on every screen at once, under body text.

The rule now:

- **The paper carries no grid.** `body` has only a very wide two-stop radial
  wash, which is the pinned reference's "background carries the large gradient"
  and keeps the ground off flat grey.
- **Ruling belongs to a chart lane**, drawn against that lane's own hour axis and
  aligned with the labelled ticks beneath it (`--axis-rule`). Today's sheet is
  currently the only such surface.
- **`--rule-faint`** separates rows of the same kind — one channel band from the
  next — where a full `--rule` would be too loud.

`--grid-fine`, `--grid-coarse`, `--grid-pitch` and `--grid-pitch-coarse` are
deleted rather than left defined-but-unused.

**A misalignment the grid had been masking.** With the viewport ruled, the sheet
head looked plausible; with it plain, the hour axis was visibly wrong. The axis
ran the full width of the sheet region and spread its ticks across it, while the
traces are confined to the lane column — so `00` sat ~144px left of where the pen
starts and every tick named a time it did not mark. The lane geometry is now
three custom properties on `.sheet-head__chart` (`--chart-label-column`,
`--chart-count-column`, `--chart-gap`) consumed by the bands, the axis and the
overflow line, so the three cannot drift apart again; the 900px breakpoint
overrides those properties instead of restating the columns. Measured after the
fix at 1440px: axis and lane both span 408→1063, ticks on even 160px quarter-days.

The instrument reads *more* like an instrument for this, not less: a real
recorder's chart is ruled where the pen writes and blank everywhere else.

---

## D-034 — The visual world is a quiet ledger; Today's day-chart is gone

**Status:** decided from four user-supplied redesign screens, revising D-032

The user redesigned all four screens themselves and asked for them to be
reproduced. Those screens keep the product's structure and reject its finish, so
this supersedes D-032's surface without touching its domain thinking.

What changed, and why each was wrong before:

- **The page is flat and white.** `--paper` is `#ffffff`; the left nav is a
  `--binder` tint and the right rail a `--margin` tint, one step off it each.
  Regions are told apart by a tint step and a 1px rule, never by texture.
- **Serif for the record, sans for the interface.** Source Serif 4 sets dates,
  titles and headings — the words that are the user's own. Inter sets every
  label, control and readout. Archivo is gone, and with it `--stretch-label`:
  the width axis it depended on does not exist on a serif, so seven
  `font-stretch` declarations were inert and have been deleted rather than
  retuned. CJK falls through the serif stack to PingFang deliberately.
- **Violet is the app's own colour.** A selected nav row is a violet wash with a
  3px violet tab; the pens are retuned to violet → blue → indigo → pink, with no
  orange, so four Journeys on one screen read as one palette.
- **Radii soften** (`--radius-sm` 4→6px, `md` 6→8px, plus a 12px `lg`), and
  shadows nearly vanish: `--shadow-subtle` is a 1px hairline lift, and depth is
  reserved for things that genuinely float.
- **The sidebar spans both grid rows**, so the binder edge runs the full window
  height and the top bar's rule stops at it instead of cutting across the nav.
  The brand sits in the sidebar's own 52px strip, which is also where the macOS
  traffic lights land — so the top bar no longer needs its 88px inset.

**Today's multi-pen day chart is removed.** On a single day a trace plots three
or four marks against 24 hours of near-flat baseline, sitting directly above the
same events listed exactly. It was a picture of nothing much, twice. The day is
now a table — time / activity / journey — with a date chip in its head row. A
Journey's trace stays, because there the axis spans months and the shape is the
whole promise of the product.

This removed the last consumer of the full-viewport ruling that D-033 had
already narrowed to one lane; `--axis-rule` now serves the Journey header's
trace, which is the only ruled surface left.

**Timeline gains a rail** (this month's counts, focus Journeys by measured
activity, recent state changes) so three of five screens have one.

Two things in the reference were **not** built, and the gap is deliberate:

- The **pull-quote** at the foot of the Timeline rail. The app has no quote to
  put there; inventing one, or promoting a line of the user's own writing to an
  epigraph they never chose, would be the app putting words in their mouth.
- A **taller filled area** under a Journey's trace. The fill is real and now
  strong enough to read (top stop 0.16 → 0.28), but a Journey that was quiet for
  most of its span encloses almost no area, and the reference's full silhouette
  is a stylisation of that. Faking it would mean drawing activity that did not
  happen.

One sanctioned exception is recorded in `.impeccable/config.json`: the coloured
left edge on rail Journey cards trips the `side-tab` detector, and it is in the
user's reference on exactly those cards.

---

## D-035 — CJK is set in a bundled Microsoft YaHei subset, scoped by unicode-range

**Status:** decided by the user, who supplied the font files

D-034 left CJK falling through the stack to whatever the OS had. The user judged
the result wrong and provided `微软雅黑.ttf` and `微软雅黑粗体.ttf`
(kept in `docs/ttfs/`).

Two things were wrong in my first reading of this, both corrected by measuring
rather than reasoning:

1. I claimed CJK was rendering in Hiragino Sans GB, inferred from
   `/System/Library/Fonts/PingFang.ttc` not existing. Asking Chrome directly
   (`CSS.getPlatformFontsForNode`) showed **PingFang SC Semibold**. The file was
   simply somewhere else.
2. I claimed the fix needed the font bundled. The real reason YaHei never won was
   **stack order**: it sat last, behind `PingFang SC`, which exists and matched
   first. A stack is consulted in order.

The rule now:

- The subset is registered as `YaHei Subset` in `styles/fonts.css`, in three
  `@font-face` blocks: 400, 700, and **500–600 mapped onto the 700 file**. The
  interface uses `--weight-medium` and `--weight-semibold` throughout, and YaHei
  has no face at either; without that mapping the browser synthesises a fake bold
  by smearing the 400 outline, which turns CJK strokes to mud at small sizes.
- **`unicode-range` restricts these faces to CJK.** This is what makes the split
  work: `YaHei Subset` sits *first* in both `--font-display` and `--font-sans`,
  and Latin and digits still fall through to Source Serif / Inter. That is the
  reference's own mix — 「秋招 2026」 sets the Chinese in a sans and the figures
  in the serif. Verified: the Chinese glyphs resolve to `Microsoft YaHei`
  (`isCustomFont: true`), the figures to `Source Serif 4`.
- Subset to the CJK unified block plus CJK punctuation and fullwidth forms:
  **28MB of TTF became 10.3MB of woff2.** Heavy for a web page, unremarkable for
  a desktop app, where the font ships in the bundle and never crosses a network.

**LICENSING, recorded so it is not forgotten:** Microsoft YaHei is a commercial
font licensed for distribution with Windows and Office. Bundling it in a
redistributed application is outside that licence. Fine for the user's own build.
Before publishing, replace with **Noto Sans SC / Source Han Sans** — open licence,
near-identical structure, and a variable version that would cut the weight
further. The same note is in `fonts.css`.

A consequence worth naming: a title now mixes two faces mid-line, so the Chinese
and the Latin have slightly different vertical weight. That is inherent to the
split the reference asks for, not a defect.

---

## D-036 — A fixed rail drawer means every reading column must reserve its width

**Status:** decided after shipping the same bug three times

Below 1180px the context rail becomes a `position: fixed` overlay drawer. Three
screens gained a rail in D-034, and all three then clipped content underneath
that drawer at the app's minimum window:

- **Today** — every Journey tag vanished; the table's fourth column sat under the
  drawer. Fixed by dropping the Journey column and moving tags under the title.
- **Timeline** — entry cards were cut off mid-card: the type badge gone, a
  reflection truncated mid-sentence.
- **Notes** — the tightest case, being the only screen with a column on *both*
  sides. Body text clipped, and the footer bar's controls hidden.

The rule: **a screen with a rail reserves the drawer's width in `padding-right`
below 1180px.** Two corollaries, both learned the hard way:

- **Never set the `padding` shorthand at a narrower breakpoint.** The Timeline fix
  failed the first time because a `@media (max-width: 900px)` block immediately
  below reset `padding` on all four sides, cancelling the reservation. I then
  misdiagnosed that as an architectural limit — that CSS could not express this
  without threading drawer state into the stylesheet — and offered the user three
  options for a problem that was a one-line mistake of my own making. Read the
  rules you just wrote before concluding the language is at fault.
- **When one screen shows this, check the others in the same pass.** Fixing only
  the screen the screenshot happened to expose is what turned one bug into three
  rounds.

The reservation is strictly correct only while the drawer is open, which is its
default. When it is closed the column keeps the gutter: a visible margin is a far
cheaper wrong than truncated content.

---

## D-037 — Recording an event carries both of Today's smallest units

**Status:** decided by the user

Today offers exactly two inputs — **What happened** and **Something to do** — and
the user identified these as the app's smallest units. Recording an event should
carry *both*, because a real event usually produces both at once: an interview
happens, and it leaves work behind.

The model already supported this. `NewTimelineEvent.tasks` existed, tasks carry
`origin_type='event'` / `origin_id`, `tasks::by_origin` reads them back, and the
Rust command created them in the event's own transaction. What was missing:

- **`memoryRepository` silently dropped `input.tasks`.** Its comment claimed to
  mirror the Rust command but mirrored only `state`. Every test and the whole
  browser preview run on that implementation, so the feature was dead everywhere
  it could be observed.
- **No UI ever sent the field**, so the Rust path had never once executed.
- **`entry.tasks` was rendered nowhere.** Even with correct data, nothing showed
  it. This was the piece that made the coupling invisible.

Three of my own errors are worth recording, because each cost a round:

1. I concluded "the Rust side never implemented this" after grepping only
   `db/timeline.rs`; the code was in `commands.rs`. Search the call path, not one
   likely file.
2. I named the field **"What this revealed"** — my own interpretation. The user
   meant the literal Today units, so it is now **"Something to do"**, matching
   Today's wording exactly.
3. The first version took a **title only**, while Today's task composer takes a
   title *and an optional due date*. That made it a lesser relative of the unit
   rather than the same unit — and the due date is precisely what feeds
   "Up next". `tasks` is now `NewEventTask { title, dueAt }` across TypeScript,
   Rust, both repositories and the dialog.

Placement matters as much as existence: the field first sat after Weight, 96px
below the fold, which a probe showed as `visibleWithoutScrolling: false`. A field
a script can reach by `aria-label` is not a field a person can see. It now sits
directly under "What happened", so the two units read as one pair.

Still one-directional: an event can carry to-dos, but Today's composer cannot
attach its to-do to an event, and an existing task cannot be attributed to one
after the fact. Not built, not needed yet.

---

## D-038 — `create` opens a transaction; `create_within` does not

**Status:** decided in response to a bug the user hit

Recording an event with to-dos failed at runtime with **"cannot start a
transaction within a transaction"**. `tasks::create` opens its own transaction,
and `timeline_create_event` calls it while already holding one so the event and
its to-dos commit atomically. SQLite has no nested transactions.

The split now follows the convention already in that file — `link_within` takes
`&Connection` for exactly this reason:

- `create` — opens a transaction, delegates, commits. Unchanged for callers.
- `create_within` — the body, no transaction, for callers that hold one. Returns
  the new id rather than the task, since reading it back inside the caller's
  transaction is wasteful when the caller re-reads the aggregate anyway.
- `link_within_tx` — links an existing task to one more journey inside a
  caller's transaction. An event can span several journeys and work it revealed
  belongs to all of them, but `NewTask` carries only one.

**Why this shipped broken:** the five frontend tests written for the feature all
run against `memoryRepository`, which has no transactions at all. They passed
while the real path was incapable of executing. The fix is verified the other way
round: reintroducing the nested transaction turns five Rust tests red, removing it
returns 83 green. **A behaviour that only exists in the real repository needs a
test in the real repository.**

---

## D-039 — The sidebar lists only real destinations

**Status:** decided by the user

The nav had a **Tasks** row that was not a destination:

- `store.ts` defines no `tasks` route and never did.
- Its handler was `navigate({ name: 'today' })` — the same target as the Today
  row directly above it.
- `isCurrent={false}` was hardcoded, so it could never show as selected. It could
  not even express "you are here", because there was no here.

Its one real function was an outstanding-task count, which moved onto Today —
where that work is actually handled. Navigation is now Today / Notes / Timeline
plus the user's own Journeys: every row a real route that can highlight correctly.

## D-040 — Only recorded events of normal weight can be edited

**Status:** decided by the user

Nothing on the timeline could be corrected. A typo in an event title, or an event
filed on the wrong day, was permanent — and twice in one session the only way to
fix bad rows was to open the database by hand: two `Untitled` entries a deleted
note left behind, and seven `journey_status_changed` events from a few stray
clicks.

Editing is now offered, deliberately narrowly. An entry qualifies when it is
`event_recorded` **and** its weight is `normal` — exactly the cards badged
"Event". Two exclusions, for different reasons:

- **Derived entries** — `note_logged`, the task events, `journey_status_changed` —
  restate another object. Editing the entry would let it disagree with the note
  or task it reports, so those are corrected at their source. This is the same
  reasoning as D-016.
- **Milestones and minor entries** are read-only at the user's own direction.
  A milestone is structural besides: it feeds the development spine (D-028), so
  re-dating one moves a turning point on the Latest progress path.

Only the wording and the date change. Weight, journeys, the tracked transition
and the to-dos the event revealed are all left out — those are how an event sits
in the story, and changing them is re-recording it rather than correcting it.
`created_at` and `seq` are untouched, so an edit cannot disturb insertion order
or claim the event was written down at a different time.

The rule lives in both implementations — TypeScript to decide whether to offer
the pencil, Rust so the database cannot be edited around it — checked against the
same table on both sides, as `derive_title` already is (D-014).

**Edge case, kept deliberate:** `densityFor` promotes a minor entry carrying a
reflection to a full card, so it draws the same "Event" badge as an editable one
while its stored weight is still `compact`. It stays read-only. Editability
follows the weight that was chosen, not the card it happens to draw.

**Still missing:** there is no way to *delete* a timeline event. That gap is what
required the two hand-written SQL cleanups above, and it is not closed here.

## D-041 — A timeline entry can be a commitment, not only a record

**Status:** decided by the user

The user put a 2027 ICLR deadline on a paper Journey: *"他是未来的事，就是相当于给自己
的 deadline"*. The timeline could only express things that had happened, so the
entry claimed a submission that had not occurred, dated in the future — and every
derived reading believed it. That deadline became the Journey's newest
development, its current focus, and a milestone it had supposedly reached.

An entry now carries `event_state`: `recorded` (it happened, at `occurred_at`) or
`planned` (a commitment; nothing has happened yet). Migration
`0005_planned_events.sql`.

**Why a column rather than a date comparison.** Deriving "planned" from
`occurred_at > now` needs no schema change and is wrong in the case that matters
most: on the day an unmet deadline passes, it would become indistinguishable from
something that happened. The timeline would report a paper as submitted because
its due date arrived. Whether an entry is a plan is a fact about the entry, not
about what time it is now — and a plan never confirmed has to stay legible as a
plan forever. "Overdue" *is* derived from the clock, correctly: it is a fact about
now, and it stops being true the moment the entry is confirmed.

**Why `occurred_at` keeps its meaning.** While an entry is planned, its position
on the timeline *is* the date it is aimed at, so ordering, month/day grouping and
every existing query work untouched. `planned_for` is what makes confirming
lossless: it holds the original target while `occurred_at` moves to when the thing
really happened, so an entry can say "the deadline was the 12th, I submitted on
the 10th". Same reasoning as separating `occurred_at` from `created_at` (0001) —
two dates that mean different things get two columns.

**Three acts, all on the card:** *It happened* (`timeline_confirm_event` — state
flip and real date in one write, title editable in the same step), *Edit* (the
existing dialog, where a plan's date field is a deadline and moving it moves
`planned_for` with it), and a delete command that refuses anything recorded and
currently has no UI.

**This widens D-040.** A plan is editable at *any* weight. D-040's restraint
protects history from being quietly rewritten; a plan is not history but a
statement about the future, and revising one — the deadline moved, the wording was
rough — is how plans normally behave. Freezing a mistyped deadline until its date
arrived would be the rule protecting nothing. Once confirmed, D-040 applies again,
except that an entry which was ever planned stays editable, because it is the
user's own commitment rather than a derived record.

**A plan is excluded from every derived reading**, through one shared
`onlyHappened` helper rather than six inline predicates: development spine,
current focus, tracked states, the pen trace, the Timeline rail's counts and
recent changes, the Journey rail's "last activity", and the Overview's Milestones.
It *is* surfaced as something owed — the Journey rail's "Up next" lists plans
above open tasks, and `upcomingItems` admits planned events for today and overdue.
That last part is a deliberate exception to the no-double-counting rule in D-028:
an overdue *task* already appears as due work, but a plan appears nowhere else on
Today, so excluding it would hide a deadline on the day it matters most.

**Refused:** a planned event cannot carry a state change. A transition asserts
something *is* now a different value; a plan asserts nothing yet, and allowing it
would make the Journey's tracked states report a level the user has not reached.
Both repositories refuse it rather than dropping it silently.

**Marked by shape and by words, not only colour:** dashed border, hollow pip on
the channel line, calendar chip, and a badge reading "Planned" or "Overdue".

**Existing deadlines are reinterpreted, not left behind.** Before this column the
only way to put a future date on the timeline was to record an event dated ahead,
and the notebook this shipped into had exactly one such row — `2027 ICLR 截稿`,
dated 2026-09-25, checked in the real database. Migration 5 converts
`event_recorded` rows still dated in the future into plans. Leaving them as
records would have meant the user could not fix them either, because a recorded
event cannot be deleted. Derived rows are excluded: a `note_logged` entry reports
an object, not an intention, and cannot meaningfully be a commitment.

**Still open:** nothing calls the delete command, so an abandoned plan can be
re-dated but not removed; and there is no un-confirm, so confirming by mistake
leaves an entry that can be corrected but not returned to being a plan.

## D-042 — A Journey can keep a register of things, and an event can be about one

**Status:** decided by the user

The gap was visible in the user's own data. Nine events, five submissions:

```text
2025-08-01  2026 AAAI 投稿
2025-09-15  2026 AAAI 一轮拒稿
2026-05-04  TMM 投稿
2026-08-14  TMM 一轮大修返稿
```

They were already encoding "these belong to the same paper" as a **title prefix**,
by hand, because the model gave them no other way. The timeline records moments; it
had no concept of the *thing* a run of moments is about, so it could not answer
"how many submissions are open" or show one paper's history on its own.

A **subject** is that prefix made real, and a **register** is the subjects of one
kind in one Journey (migration `0006_subjects.sql`). `timeline_events` gained
`subject_id` and `stage`.

**Generic, not a job-hunt tracker.** `kind` is free-form TEXT for the same reason
`event_type` and `note_type` are: `论文` today, `岗位` next, `电影` with no new
code. `RegisterView` does not know what a paper is. That is what keeps this on the
right side of AGENTS.md §12 — Positions and Skills are not top-level modules, they
are two names a user might type.

**A thing with a name, and nothing else.** No custom fields, no field-definition
table. That is DATA_MODEL.md §9's EAV proposal, which §4 of the same document
argues against and AGENTS.md §12 forbids outright.

**Everything but the name is derived from events.** Current stage is the `stage`
of the most recent event; the counts are counts. There is deliberately no
`current_state` column: a cached value that can disagree with its own history is
worse than a join. It is the inverse of the reasoning that makes the timeline
persisted rather than computed (DATA_MODEL.md §5), applied in the other direction.

**A register is a list, not a board.** Grouped by stage, and AGENTS.md §12 rules
out a kanban as the product metaphor. The stage vocabulary also has no defined
order, so columns would imply a progression the data does not have — and D-043
confirms that stays true even once the vocabulary is named, because a stage is a
label rather than a position.

**Filing is optional and must stay so.** An event never needs a subject to be
written — AGENTS.md §1 requires that recording stays easier than filing. The
picker is absent entirely for a Journey with no register.

**`subject_id` is a new column, not a reuse of `source_type`/`source_id`.** The
source is what *produced* an event (a note being logged, a task completed); a
hand-recorded interview has no source but is very much about a position. One event
could have both.

**Existing events are not auto-split.** Migration 6 leaves all 19 rows alone.
Splitting `2026 AAAI 投稿` into a subject and a stage looks safe but is guessing at
intent on real data, and the two Journeys use different separators (`——` in 秋招, a
bare space in 科研论文), so a wrong guess would corrupt the record it was trying to
organise. Instead the app *offers* what it thinks it found: `proposeSubjects`
groups titles by shared prefix, the register shows the proposal, and the user
adopts it. The grouper is silent on anything recorded once — `上海仙工一面` could be
a position at 一面 or one whole event, and only the user knows which. It is
language-neutral by construction: **repetition reveals the boundary**, so no
vocabulary of stage words is needed.

**A thing's history is the timeline, filtered.** `SubjectHistoryDialog` hands the
same `TimelineView` a narrower slice — no second renderer, no second query, and a
thing's history can never drift from the Journey's, because it is literally the
same rows. Ascending, unlike the feed it came from: one submission reads as a story
(投稿 → 拒稿 → 投稿 → 大修), which is D-015's original argument, true of one paper
even where it was false of the whole Journey.

**A register tab is `{ register: kind }`, not a string.** A `kind` the user typed
can never collide with a built-in tab name, so someone whose register is literally
called `notes` still gets both tabs. A restored tab is validated for shape only —
a register since emptied degrades to an empty register rather than crashing, the
same guarantee D-013 gives a stale journey id.

**Untracking never erases history.** `ON DELETE SET NULL`: the interview took place
whether or not the position is still tracked.

## D-043 — Stages are a named, reusable set of labels, each with a tone

**Status:** decided by the user

The user's framing: *"其实秋招和论文都是可以共用一个父模版的，无非就是状态不同，一个是
一面、二面…，一个是投稿返修中稿"* — and then: stages defined when the register is
set up, named by the user, each with its own card colour, and the stage names
usable as the statistic.

D-042 already made the two cases one mechanism, but the vocabulary was a
*by-product of events* (`SELECT DISTINCT stage`). Three things follow from that, all
of them felt on real data:

1. **It cannot be reused.** Next year's 秋招 starts from an empty suggestion list,
   because 一面 exists only inside this year's rows.
2. **It has no order.** Grouping fell back to "which stage moved most recently",
   which is not how anyone reads a set of stages.
3. **It cannot report a zero.** "Is anything at 大修" needs to know 大修 is a stage
   of this register at all, including when the answer is none — and a zero has no
   row to be derived from.

`stage_sets`, `stage_options` and `register_stage_sets` (migration
`0007_stage_sets.sql`) make the vocabulary a thing the user names.

**A layer on top, not a replacement.** `timeline_events.stage` stays free TEXT, a
register with no set behaves exactly as it did, and attaching a set rewrites
nothing. The notebook this ships into already has stages typed by hand; they keep
working while the user decides whether to formalise them.

**Not a workflow, and not an order.** The user said this twice, and the second
time removed something I had built:

> *"当然能，状态是独立显示而已，不可能是以流程图的形式"* — anything may follow anything.
>
> *"标签也不是显示的次序，只作为展示当前的状态。不需要标终态、标成败"* — a stage is not
> a position in a sequence either; it says what something **is now**.

So a stage set is a **vocabulary of labels and their colours**, and nothing else.
What that removed, in order of how wrong each was:

- **The set as a display order.** The register grouped by the set and the Overview
  drew its bar in the set's order. Both now order by what is actually in the data:
  recency of movement for the register, count for the cross-section. The reorder
  arrows went with it — moving a row would have changed nothing visible.
- **`terminal` / `outcome` flags** for marking 成了 / 没了. My own addition rather
  than the request; "the stage names are the statistic" is sufficient, and
  unrequested columns are the overengineering AGENTS.md §12 warns about.
- **A funnel visualisation.** Asserts a progression the data does not have.

`position` survives in the schema as **insertion order only** — where a stage sits
in the editor's list, so a set re-reads stably instead of reshuffling its own rows
between saves. Nothing displays in it. It is kept rather than dropped because
removing it would mean the editor's list order came from the label collation, which
would reorder a user's stages under them as they typed.

This is also what keeps the register clear of the kanban D-042 refused, now by a
wider margin: there is no order to lay out as columns in the first place.

**What a set still contributes**, and the reason it exists as rows rather than
`SELECT DISTINCT`: *which stages exist* — so a stage with **zero** things at it can
be reported — and *what colour each carries*.

**No colour picker: six named tones.** The user asked for a colour per stage; they
get a *meaning* per stage, which `tokens.css` resolves to a hue. A free hex field
would put a hard-coded colour in the database — AGENTS.md §7's "never hard-code a
colour in a component" with extra steps — with no guarantee of clearing 4.5:1 on
paper-white and no way to survive a retheme. Six is enough to separate the stages
of a real register and few enough to stay clear of the rainbow of category colours
UX_SPEC.md §7 rules out. Rust validates the tone name, so the database is the last
place a literal could get in; a tone an older build does not know renders neutral
rather than as an invisible border.

**Colour is never the only signal.** `StageChip` always contains the stage's own
name, so a register reads in greyscale — the rule `StatusPill` and `pens.ts`
already follow. On a timeline entry the tone is a 2px *left edge*, not the whole
border: the card's frame is structure, the stage is one fact about the entry, and
a plan's dashed border still wins because "has not happened yet" is the stronger
claim.

**No built-in sets.** Shipping 「面试流程」as a preset would bake a job-hunting
tracker into the product (AGENTS.md §12). The user chose self-built; the first set
they define becomes reusable by every other register, which is where the reuse
actually happens.

**Keyed by `(journey_id, kind)`, with no `registers` table.** A kind exists only as
a property of the subjects carrying it (D-042), so a table whose only column was a
name would earn nothing and would put the same fact in two places.

**A rename cascades onto events, in one transaction.** `StageOptionPatch` carries
the id of the row it replaces, and that is load-bearing: an entry *with* an id
whose label changed is a rename, and a rename has to reach every event that stored
the old label — otherwise everything recorded at 一面 silently falls out of a set
that now says 第一轮. Without ids a rename and a different stage are
indistinguishable, which is the same value-as-key problem `Subject` exists to solve
for names. The cascade is scoped to registers using *this* set, because two
registers can legitimately use the word 投稿 under different sets.

**The statistic goes on the Overview**, at the user's choice — I had argued for the
register page. It is counts in the user's own stage names, biggest first, and it
stays inside D-007: no percentage, and the only denominator is the register's own
total. Stages nothing is at, and things nothing has been recorded about, are
reported *in words* rather than drawn as zero-width segments. A stage recorded
outside the set is shown as off-set rather than dropped — otherwise the parts would
add up to less than the register and things the user wrote would vanish. A test
asserts no `\d+%` renders in the panel.

**Deleting a set keeps the history it described.** Events retain their `stage` text
and the registers fall back to free-text behaviour. Deleting history because a
description of it was deleted would be the destructive move `subjects::delete`
also refuses.

**`stageTone` is derived on read, never stored on the event.** The colour belongs
to the set, so a cached copy would go stale the moment the set was recoloured. It
is resolved in Rust because the join runs event → subject → register → set, which
is three tables the UI has no business knowing about.

## D-044 — States can be set up while the Journey is created

**Status:** decided by the user, fixing a placement mistake of mine

The user asked for this in the original framing — states chosen "创建 journey 的时
候" — and I argued it out of the New Journey dialog on two grounds: USER_FLOWS Flow
A wants a title to be the only requirement, and one Journey may hold several
registers. Both are still true, and neither was an argument for what I actually
built.

What I built put the entrance in `RegisterView`, behind a register — and a register
exists only as a property of the subjects carrying it (D-042), so it does not exist
until something is in it. The path was:

```text
create Journey → open it → Overview → “Track a kind of thing”
→ name a kind + add the first item → open that tab → “Set up stages”
```

So a brand-new Journey had **nowhere at all** to set states up. Not hard to find:
absent. Reported as *"怎么我打开还是没有：创建 journey 可以自主的选择 event 的状态呢"*,
and confirmed in the real database — migrations 6 and 7 applied, and zero subjects,
zero sets, zero attachments. The user had run the feature and found no way in.

**The fix is a collapsed section at the foot of the New Journey dialog**, asking
"Does this Journey track a set of things?". Skipping it leaves Flow A exactly as it
was: a title is still the only requirement, and a Journey that tracks nothing
creates no register and no set. Opening it gives kind, an optional first item, and
the state list — or a picker for a set already defined, which is where the reuse
actually pays off.

**Collapsed by default**, at the user's choice. A checkbox was the alternative and
is worse: it still spends a line asserting that tracking things is a normal part of
making a Journey, and most Journeys — 健身, 旅行 — simply get written in.

**One register at most here.** Two stage lists in one dialog is a setup wizard, and
the Overview already adds further registers. My call, taken on the user's "第二个有
你把握".

**Written outside the Journey's own transaction, deliberately.** If the stage set
fails, the Journey the user actually came to make still exists and the error is
surfaced; the Overview can finish the job. Losing the Journey because its optional
decoration failed would be the wrong half to roll back.

**The register page keeps its own entrance.** This is about a missing first
entrance, not a replacement — editing states later still belongs where the register
is.

**Two implementation notes worth keeping:**

- The stage rows are now one component (`StageListEditor`) used by both the
  standalone dialog and this section. The immediate reason: the previous round's
  layout probe *copied* that markup and kept reporting a pass after the real row
  changed. Duplicating a layout is how a check goes quietly stale.
- `check:layout` now measures the New Journey dialog **expanded, with four
  stages** — the tallest state any dialog reaches, and therefore the one that can
  push its footer out of a height-capped panel, which is the exact bug that check
  exists for. Measuring it collapsed proved nothing.

## D-045 — The user's own paper history was organised into a register

**Status:** done, at the user's request, against their real database

The first real use of D-042 and D-043 on data that already existed. The user asked
for their 科研论文 Journey to be reorganised: *"每个题目你就可以统一一下了,例如 2026
AAAI 投稿和拒稿,名字就可以统一为 2026 AAAI 的两个状态"*.

**Nine entries became five papers.** Each paper is a `Subject`; each entry keeps
its own words and gains a state:

| Paper | Entries | States |
| --- | --- | --- |
| 2026 AAAI | 2 | 投稿 → 拒稿 |
| 2026 IJCAI | 2 | 投稿 → 拒稿 |
| 2026 ICML | 2 | 投稿 → 拒稿 |
| TMM | 2 | 投稿 → 返修 |
| 2027 ICLR | 1 | none — a planned deadline |

**A fourth state was needed and the user added it.** They specified three — 投稿 /
返修 / 录用 — but **three of the nine entries are 拒稿**, the most common outcome in
their own record and not among the three. Folding those into 返修 would have made
the Overview report three papers as "in revision" when they had in fact ended, so
the conflict was raised rather than resolved by guessing. The user's answer: add it.
`录用` is now a state with **zero** papers at it, which is exactly the reading only a
named set can produce (D-043).

**Titles were not rewritten.** `2026 AAAI 一轮拒稿` is still byte-for-byte what the
user typed; only `subject_id` and `stage` were set. Unifying the *name* is what a
subject is for — grouping entries so the program can count them — and it is not a
licence to edit someone's own account of what happened. Verified after the fact:
all nine titles unchanged.

**Two readings I made rather than asked, both flagged first and neither answered:**

- `2026 ICML 443 拒稿` — `443` reads as a submission number, so the paper is
  `2026 ICML` and `443` stays in that entry's title. If it is a second paper, the
  subject is wrong and one `updateSubject` fixes it.
- `2027 ICLR 截稿` is filed under a paper **with no state**. It is a planned entry
  (migration 5), so nothing has been submitted; giving it 投稿 would claim a
  submission that has not happened. It shows in the register as "not started".

**Written through the repository, not by hand.** `src-tauri/examples/organise_papers.rs`
calls the same functions the UI does, so every rule came with it — the tone
validation, `timeline::update`'s refusal of a subject from another Journey, and its
refusal of a stage with no subject. Hand-written SQL would have bypassed all three
and could have left rows the app itself does not consider valid. It is a dry run by
default; `--apply` writes; re-running is idempotent (a set and a subject are reused
by name rather than duplicated).

**Backed up first**, on the user's instruction: `sqlite3 .backup` (WAL-safe) plus a
raw copy, under `backups/<timestamp>/`, `integrity_check ok` before proceeding.

**Verified after:** `integrity_check ok`, `foreign_key_check` empty, row totals
unchanged (3 journeys / 3 notes / 19 events / 6 tasks — nothing created or
destroyed), and the register reading back as intended.

**A bug this exposed, not yet fixed.** `subjects::list` computes `current_stage`
from the latest event carrying one, *without* excluding planned entries — so a
planned event with a stage would set a paper's current state to something that has
not happened. D-041 established that rule and gave it a shared `onlyHappened`
helper; this query predates the plan model and never got it. Harmless in this data
(the only planned entry deliberately has no stage) and recorded in STATUS.md rather
than fixed inside a data migration.

## D-046 — A filed entry's title is reduced to the thing it is about

**Status:** done, at the user's instruction, against their real database

D-045 left titles untouched, and said so as a principle: a subject exists to let
the program group entries, not as a licence to edit someone's account of what
happened. The user then asked for exactly that edit — *"标题你可以统一了,就是不用再显
示返修、拒稿,443 这些内容了"* — which is their call to make about their own notebook,
and reverses that half of D-045.

The reason it is reasonable: after D-045 the state is **data**, rendered as a chip
on the entry and as a colour on its edge. `2026 AAAI 拒稿` said 拒稿 twice, once as
text and once as a chip. Eight entries were reduced to their paper's name.

```text
2026 AAAI 投稿        → 2026 AAAI     + 投稿 chip
2026 AAAI 一轮拒稿     → 2026 AAAI     + 拒稿 chip
2026 ICML 443 拒稿    → 2026 ICML     + 拒稿 chip
TMM 一轮大修返稿        → TMM           + 返修 chip
```

**Three words are destroyed, and were reported before the write** rather than
discovered afterwards:

- `443` — named by the user, read as a submission number.
- `一轮` (twice) — *first round*. **Not named by the user.** A first-round rejection
  is a different fact from a later one, and the register cannot express which round
  a state was reached in. Flagged before applying; the instruction was a category
  ("这些内容"), so it was applied.
- `大修` — the chip says 返修. Close, not identical: 大修 is a *major* revision.

That list is the part of this worth keeping. A migration that silently drops words
from a user's own writing is the kind of thing that is noticed months later, so the
script prints what will exist nowhere afterwards and requires `--apply` to proceed.

**`2027 ICLR 截稿` was deliberately left alone.** It is a planned entry with no
state, so it has no chip; reducing it would leave a row naming a venue and
asserting nothing. The rule generalises: **a title may only be reduced when
something else on the card carries what is removed.**

**How it was written.** `src-tauri/examples/unify_paper_titles.rs`, through
`timeline::update` like D-045, so the editability rule (D-040) applied — all eight
are recorded events of normal weight, which is exactly the class that rule permits
correcting. Dry run by default, idempotent, backed up first
(`backups/<timestamp>-before-titles/`, `integrity_check ok`).

**Verified after:** integrity and foreign keys clean, row totals unchanged
(3/3/19/6 — nothing created or destroyed), no state word left in any filed title,
and the register still reading 拒稿 3 / 返修 1 / 录用 0 / 投稿 0 / not started 1.

**A consequence worth stating plainly:** the timeline now has three rows reading
`2026 AAAI`, `2026 ICML`, `2026 IJCAI` twice each, distinguished only by date and
chip. That is the intended shape — the paper is the subject, the chip is the state —
but it does mean the *title alone* no longer identifies an entry, which matters for
search: searching 拒稿 will no longer find these. The stage is not in the `LIKE`
search path.

**Correction, from D-047:** the last sentence understated it. Searching 拒稿 never
found these, because `Cmd+K` never searched timeline events at all — not before
D-046 and not after. D-046 made the gap visible rather than causing it.

## D-047 — Search covers entries, stages and tracked things

**Status:** done, reported by the user

*"搜索 tmm 应该得可以搜的到投稿和返修两条吧,为什么会搜不到"* — and the expectation was
right. Verified against the real notebook: `TMM` appears twice in `timeline_events`
and once in `subjects`, and **nowhere** in `notes` or `journeys` — which were the
only two tables `Cmd+K` queried.

So this was never about `stage`. The palette searched Journeys (by title,
client-side) and notes (title and body, in SQL) and nothing else. Three kinds of
thing were unfindable:

| | before | now |
| --- | --- | --- |
| timeline entries | never searched | title, summary, reflection, **stage**, and the name of the thing they are about |
| a stage | not a search field | matched — so 拒稿 finds three papers whose titles do not contain the word |
| tracked things | never searched | matched by name, ranked above their own entries |

**Why the subject's title is in the event query.** Searching `TMM` should find every
entry about that paper, and after D-046 the entries are titled only `TMM` — but the
principle holds regardless: the register groups those entries, so search should
agree with the register rather than with the text.

**A tracked thing ranks above its own entries**, because it opens the whole history
of that paper rather than one moment in it — which is almost always what someone
typing a paper's name wants.

**`search` is a separate function from `list`**, in Rust and in the repository
interface. `timeline::list` has dozens of callers whose contract is "the complete
timeline", and a search term reaching one of those would silently turn a history
into a filtered view. Blank input means *no filter* rather than *no results*, which
a test pins.

**Still `LIKE`, not FTS5.** At tens of events the scan is free, and FTS5 would be
solving a problem this notebook does not have. The cost stays as documented: ASCII
only case-insensitivity.

**A duplicate this exposed.** Adding entries to the palette made `note_logged`
entries appear beside the notes they restate — two rows, same destination. Caught by
an existing test (`opens search with Cmd+K`) rather than by inspection, which is the
second time this session an old test has caught a new mistake. Note-backed entries
are filtered out of the palette; the *query* still returns them, because a
Journey-scoped search legitimately wants its whole history. Task and status entries
are kept — tasks are not searchable on their own, so those entries are the only way
to find a completed task by name, which is a gap this change does not close.

**Verified against the real notebook**, read-only, via
`src-tauri/examples/try_search.rs`:

```text
TMM   → the paper (返修, 2 entries) + 投稿 + 返修
返修   → TMM's revision, whose title contains no such word
拒稿   → all three rejected papers at once
```

## D-048 — The same shape, second time: 秋招 becomes a register of positions

**Status:** done, at the user's request, against their real database

*"秋招也一样"* — and it was. Titles became `公司——岗位`, the round became a state, and
the state vocabulary is the user's own. Nothing in the code changed: this is the
generic register (D-042) and stage set (D-043) applied to a second domain, which is
the claim those decisions made and this is the test of it.

**The vocabulary.** The user asked for more professional words and gave seven. Five
were kept verbatim, two changed, both reported before applying:

| asked for | used | why |
| --- | --- | --- |
| 投递, 一面, 二面, 三面, 录用 | unchanged | standard terms in Chinese recruiting; "初试/复试" would be less precise, not more professional |
| `hr 面` | `HR 面` | capitalisation |
| `不录取` | `未通过` | 不录取 reads as a formal rejection letter; 未通过 also covers being dropped after a round, which is what happened |

I proposed `已发 offer` instead of `录用` — on the grounds that the user's own
summaries say "发 offer" — and they kept `录用`. Their word, their notebook.

**一面/二面/三面 share one tone.** They are the same kind of state — in progress —
and giving each its own colour would spend the palette on a distinction that carries
no meaning. `HR 面` is warm (notable), `录用` positive, `未通过` negative.

**The interesting difference from the papers: the outcome was inside the summary.**

```text
08-20  上海赛索德——VLA 算法面试   summary: 26.8.22 ✅ 发 offer —— 300/天
08-28  上海仙工一面              summary: 26.8.29 ❌
```

One row, two moments, two dates. Neither obvious option works:

- Put `录用` on the 08-20 row → the offer is dated two days before it happened.
- Leave the row at `一面` → the register reports the position as still interviewing
  when it has an offer.

So **each outcome became its own entry, on the date the user wrote in that summary**
— three new rows. That is what makes `上海赛索德: 一面 → 录用` readable as a sequence,
and it is the register model doing what it exists for rather than a workaround.

**This is the first data migration that created rows** rather than only relabelling
them. Worth stating plainly: 19 events became 22. The three are derived from what
the user already wrote, not invented, but they are new records in someone's history
and that deserves to be visible rather than buried in a count.

**Summaries left exactly as written**, at the user's instruction — so the offer is
currently stated twice, once in the interview's summary and once as the outcome
entry's. Accepted rather than resolved, and recorded here so it is a known state
rather than a surprise later.

**One title gained words** instead of losing them: `上海仙工一面` had no position in
it, and the user supplied `VLA算法`. Only `面试` was destroyed, from
`上海赛索德——VLA 算法面试` — the entry *is* an interview and the chip says which round.

**`方奇科技——具身智能算法` is filed with no state.** It is a planned entry: applied
for, nothing has happened. Same treatment as `2027 ICLR 截稿` (D-045).

**Verified after:** integrity and foreign keys clean, both registers intact
(秋招/岗位 4, 科研论文/论文 5), two stage sets attached to one register each, and the
papers untouched. Search — the D-047 work — reaches all of it: `仙工` finds the
position and both its entries, `一面` finds three interviews across three companies,
`录用` finds both offers.

---

## D-049 — A thing can start being tracked from the record dialog

**Status:** done, reported by the user

The picker could only offer things that **already existed**. Recording a first
submission to a venue not yet in the register meant: cancel the dialog, go to the
register tab, add the row, come back, retype everything. Four steps to write down
one moment, in a product whose first principle is that writing must be easier than
data entry (`AGENTS.md` §1).

The user found it on their own data: 科研论文 has five papers, so **「About which」
was showing** — the list simply had no `2027 ICLR` in it and no way to add one.
That distinction matters, and I had it wrong first: the field was not missing, its
*answers* were incomplete.

**The create entry is an option inside the same `<select>`**, last in the list,
rather than a button beside it. It is the same question — *which* thing — and "a
new one" is an answer to that question, not a different mode. A separate control
would have implied a separate decision.

**No stage is preselected.** The chips already work this way and the user was
explicit: *"状态不预选，你自己挑"*. A first event is very often 投稿 or 投递, and
guessing would be the app deciding what happened. The stage field is offered,
empty, and optional — exactly as it is for a thing that already exists.

**One write, not two.** `newSubject` travels on `NewTimelineEventInput`, and
`subjects::create` runs *inside* the transaction that writes the event. The
alternative — create the subject, then create the event — leaves a register row
that no event explains whenever the second call fails. Two Rust tests cover this:
one that `create` composes inside a caller's transaction (the D-038 shape, since
SQLite cannot nest them), and one that a rolled-back event takes its new thing
with it.

**`subjectId` and `newSubject` together are refused**, not resolved by precedence.
They say different things about what the event is about, and picking one silently
is how a row lands in the wrong register.

**The register is only asked for when there is a real choice.** One register means
the answer is already known, so the field is absent — the common case gets two
inputs, name and optional stage. With several, the kind is asked with the existing
ones offered as suggestions; a new kind is still typeable, which is what brings a
register into being (the rule `NewRegisterDialog` already follows).

**Filing stays optional.** "Nothing in particular" remains the default and a test
asserts an event still records with no subject and leaves no stray register row.
The register is a place things accumulate, not a gate in front of the pen.

**Corrections, from D-050.** Two things here were wrong in use:

- The option was worded `+ Track something new…`. Wrong verb — the register does
  the tracking; the user is naming what the entry is about.
- The name had to be typed a second time, having already been written in the entry
  title. That is the redundancy D-046 removed from titles, reintroduced at input.

---

## D-050 — The name is read out of the entry, not asked for again

**Status:** done, reported by the user against their own data

They added `2026 CVPR` to 科研论文 through D-049's new option and hit two things:

> *"trace something new 不应该是 track"* … *"2026 cvpr 就是个有多个状态的名字，你这样子
> 我得写两次"*

Both are right, and the second is the substantial one.

**The redundancy is the same one D-046 already removed, one field earlier.** D-046
reduced `2026 AAAI 拒稿` to `2026 AAAI` because the title *"said 拒稿 twice, once as
text and once as a chip"*. D-049 then reintroduced exactly that shape at input time:
the user writes `2026 CVPR 投稿` in the entry, and the dialog asks for the name and
the stage again — the same words, a second time.

So the name and the stage are now **read out of the entry title**:

```text
What happened   [ 2026 CVPR 投稿 ]
About which     [ + A new one…   ▾ ]
Name in register[ 2026 CVPR ]        Stage [ 投稿 ]
                Adds 2026 CVPR to 论文 at 投稿, with this entry as its first.
                Name and stage read from what you wrote above.
```

**Why this is not the guessing the grouper refuses to do.** `splitKnownStageFromTitle`
only splits on a word the register **already knows** — a label from its stage set, or
a stage typed on an earlier entry. Nothing is inferred from the shape of the string,
which is the opposite of `group_by_shared_prefix`, whose whole difficulty is deciding
where a name ends with no vocabulary to consult. That function still declines a title
seen once; this one has evidence that function does not.

**And it does not contradict "状态不预选".** The earlier instruction was that the app
must not *choose* a state — it must not decide that a first submission is 投稿. It
still does not. What it does is read a word the user just typed, into a visible,
editable field. `2027 ICLR` with no stage word in it produces an empty stage, and a
test asserts that.

**Derived until touched**, the rule D-014 already uses for note titles: both fields
follow the entry until either is edited, then stop. So a name that is *not* in the
title — entry `投出去了`, paper `2027 ICLR` — is still typeable, and continuing to edit
the entry afterwards cannot overwrite it.

**The wording.** `+ Track something new…` → `+ A new one…`, and *"Its name"* →
*"Name in the register"*. The user is not starting an activity called tracking; they
are naming what this entry is about. The register is the thing that tracks. The hint
says *adds … to 论文* for the same reason.

**Longest match wins**, so a vocabulary holding both `一面` and `HR 一面` splits on the
more specific one. The word boundary is deliberately unchecked, because CJK titles run
words together — `上海仙工一面` is the case a whitespace requirement would miss.

**A title that *is* a stage is left whole.** `投稿` alone names nothing, and splitting
it would create a register row with an empty name.

**Still true, and still a little redundant:** the entry keeps reading `2026 CVPR 投稿`
while its chip also says 投稿. D-046 fixed that for existing rows by rewriting titles;
doing it automatically here would mean editing the user's account of what happened as
they typed it, which is D-045's line and not worth crossing for one repeated word.

---

## D-051 — Confirming a plan asks the same question recording does

**Status:** done, reported by the user

> *"点击 it happened 的时候也得和 add event 一样，需要有状态什么的"*

**The gap, in their own data.** Two planned entries, and the confirm dialog could
express neither:

| entry | filed onto | stage |
| --- | --- | --- |
| `2027 ICLR 截稿` | `2027 ICLR` | — |
| `2027 ICRA` | **nothing** | — |

Pressing "It happened" moved both onto the record and told the register nothing. A
submission that genuinely occurred left the paper reading *"Nothing recorded yet"*,
because `confirm` only ever wrote `event_state`, `occurred_at`, `planned_for` and
`title`.

**Why it belongs here rather than in a second dialog.** Confirming *is* the moment
something happens, and a stage is a claim about what has happened. D-041 already
argued the other half of this: a plan cannot carry a state transition, "because
nothing has changed yet". The same reasoning says the stage arrives at
confirmation — `2027 ICRA` is not at 投稿 until the submission really occurs. The
record dialog and this one are the two moments a thing reaches a stage, so they ask
the same question.

**The picker is now one component, `SubjectField`, used by both.** Extracted rather
than duplicated: ~215 lines of select, name field, kind field, chips and hints would
otherwise exist twice and drift. The extraction was made first and proved
behaviour-neutral against the existing 35 register/stage tests before the new
behaviour was added.

**`ConfirmPlannedEvent` gained three fields**, mirroring the create path:

- `subject_id: Option<Option<String>>` — `Some(None)` unfiles, `None` leaves what
  the plan carried. Double option because "leave it" and "clear it" are different
  answers, the same reason `TimelineEventPatch` uses it.
- `new_subject` — the `2027 ICRA` case, created **inside** the confirm transaction
  (D-049's rule), so a failure cannot leave a register row no entry explains. A Rust
  test forces that failure and asserts the register stays empty.
- `stage` — dropped when nothing is filed, because a stage with nothing to be the
  stage *of* is meaningless.

**A refused confirmation stays a plan.** `confirm` now holds a transaction, so the
cross-Journey guard failing leaves the entry planned rather than half-confirmed.
Tested.

**Filing stays optional here too.** Confirming `2027 ICRA` with the picker untouched
records it, files nothing, and adds no register row. Same as recording.

---

## D-052 — Live preview forces the parse; a lazy tree only covered a quarter of a long note

**Status:** done, reported by the user

> *"我新加了这个笔记，md 格式没有很好的编译"* — a 12,716-character note on PyTorch vs JAX.

**The note was fine.** Its Markdown is well-formed: every table has its blank line,
every fence is balanced, and `Markdown.tsx` already registers `remark-gfm`. The bug
was in `livePreview`.

**CodeMirror parses lazily.** `syntaxTree(state)` returns *only what is already
parsed*, and on a long document that is a fraction of it. Measured on the real note:

| | in the note | in the lazy tree |
| --- | --- | --- |
| characters | 12,716 | **3,419 (26.9%)** |
| headings | 22 | 6 |
| tables | 5 | 2 |
| code fences | 5 | 2 |
| list items | 35 | 6 |

Past 3,419 characters there were no nodes, so no decorations, so the rest of the
note rendered as raw Markdown. `buildDecorations` now calls `ensureSyntaxTree`, which
parses on demand, and the plugin also rebuilds when more of the document becomes
available.

**Parsing to the viewport is not enough**, which is the subtlety worth recording. My
first attempt asked for a tree up to `visibleRanges`'s end — and that is roughly
where the lazy parse already stops, so it changed almost nothing. The whole document
is parsed instead, bounded by a 50ms budget and a 200k-character limit; past those it
degrades to the old partial behaviour rather than stalling. A note is nowhere near
that: 12.7k parses in single-digit milliseconds.

**Why every existing test missed it.** All eleven used documents of a few lines,
where the parse always completes before the first decoration pass — so the lazy tree
and the full tree are the same object and the bug is invisible. The new test's whole
job is to be **long**.

**What that test can assert, and what it cannot.** jsdom reports every element as
zero-height, so CodeMirror's viewport collapses to ~280 characters and the tail of a
long note is never in the DOM at all — a class assertion on a late heading returns
`[]` regardless of the parser. I probed this directly rather than assuming it, after
writing a first version of the test that failed for that reason and would have been
misread as the fix not working. So the test asserts **parse coverage**, which is what
actually broke and is observable.

**The rendering itself is still unverified, and I tried.** I wrote a headless-Chrome
check (`check:long-note`), and it reported success — on both the fixed *and* the
broken version, which means it proved nothing. The cause: `Input.insertText` silently
truncated the paste, so CodeMirror received **26 lines instead of 411** and the check
was measuring a short note. I deleted it rather than leave a green light that cannot
fail. Driving a genuinely long document into the editor needs a different approach —
seeding the database before load, most likely — and until that exists, the
end-to-end rendering of a long note is verified only by the user opening one.

`scripts/probe-parse-coverage.mjs` is kept — it takes any `.md` file and reports lazy
versus forced coverage, which is how this was diagnosed and how the next report of
the same shape should be checked.

---

## D-053 — Maths renders in the editor, with `\(…\)` and `\[…\]` but not `$…$`

**Status:** done, reported by the user

> *"现在 md 文件的公式和文档其实都没有渲染出来"*

**Two separate things, and one of them was my error.**

*The 公式 half.* Maths had **never been implemented** — no `remark-math`, no KaTeX,
nothing. The user's `ACT 面经` note contains 85 formulas (54 display, 31 inline) that
had nothing to render them.

*The 文档 half, and my mistake.* In D-052 I wrote that tables "already work in the
rendered view" because `Markdown.tsx` registers `remark-gfm`. **`Markdown.tsx` is dead
code — nothing imports it.** The CodeMirror editor is the only surface a note is ever
shown on, so anything not implemented there is not implemented at all. I should have
checked the import graph before making that claim.

**The delimiters are the user's own.** Their notes use `\(…\)` and `\[…\]`, not
`$…$` — so `remark-math` alone would have rendered nothing even if it had been wired
in, since it only understands `$`. Supported: `\(…\)` inline, `\[…\]` and `$$…$$`
display.

**Single `$…$` is deliberately excluded.** `AGENTS.md` §1 lists `存钱买车` as an example
Journey, so prose about money is expected, and `花了 $300 和 $500` would silently become
a formula. Failing to render is recoverable; destroying the reading of a sentence the
user wrote is not.

**Maths overrides Markdown, which was the subtle half of the bug.** The parser has no
LaTeX extension, so `\mathcal L_{\text{ACT}}` reads as *emphasis* and
`A_t = [a_t, …]` as a *link* — and `livePreview` was dutifully hiding those "markers"
inside the formula, corrupting it. Maths ranges are now found first and every Markdown
decoration inside one is skipped.

**Found by text scan, not by the parser**, in `mathRanges.ts`, with four refusals that
each exist for a reason: an unclosed delimiter is not maths; a display run may not
cross a blank line (that would swallow paragraphs); inline maths may not contain a
newline; and `\\[` is an escaped backslash, not an opener. Code is asked of the syntax
tree rather than guessed, because a `\(` in a Python fence is Python — that note has
five fenced blocks.

**A bug I introduced and caught.** The reveal rule was line-based at first, copied from
headings. But the cursor rests at offset 0 when a note opens, so a note whose first
line contained inline maths showed raw LaTeX and never rendered — the exact complaint,
reintroduced. It is now selection-touch based. A heading owns its line; inline maths
shares one.

**KaTeX, bundled**, with `throwOnError: false`: a half-typed formula is the normal
state of one being written, so it renders its source in the error colour instead of
taking the editor down. The stylesheet is imported locally, keeping `AGENTS.md` §2.8's
no-network-on-the-critical-path true.

**Verified against the real note:** 85 runs found, 54 display and 31 inline — matching
the delimiter counts exactly — and the longest is 111 characters, so nothing is
swallowing prose. 13 new tests, 260 total.

**Still to confirm:** how it *looks*. jsdom computes no layout, so KaTeX's own layout is
unverified here, and the same is true of the D-052 rendering. The user should open the
note.

---

## D-054 — Maths decorations are a `StateField`, because a plugin may not replace line breaks

**Status:** done — fixing a regression I shipped in D-053

> *"现在笔记完全打不开了"*

**I broke it.** D-053's maths widget was emitted from the `ViewPlugin`, and CodeMirror
refuses that when the replaced range contains a newline:

```text
RangeError: Decorations that replace line breaks may not be specified via plugins
```

A display formula is exactly that shape — `\[`, the LaTeX, `\]` on three lines — so the
error was thrown while the editor was being constructed. The editor never mounted, and
**no note could be opened at all**, including notes with no maths in them. Strictly
worse than the bug I was fixing.

The fix is the supported mechanism: maths decorations now live in a `StateField`, which
may replace line breaks because the editor can account for the changed line structure
before laying out. Markdown decorations stay in the view plugin, and
`livePreviewExtension` combines the two. `block: true` is applied only when a formula
occupies whole lines, since a block replacement must start at a line start and end at a
line end — mislabelling inline maths is another route to the same `RangeError`.

**Why my tests passed while the app was unopenable**, which is the part worth keeping:

| what the test did | reaches the throwing path? |
| --- | --- |
| inline `\(…\)` on one line | no — no line break in the range |
| display block with the cursor **on** it | no — source is shown, not replaced |
| display block with the cursor **away** | **yes** — and I had no such test |

Thirteen tests, all green, none of them the shape the user's note actually has. The
gap was not thoroughness but *variety*: I tested the feature I was building rather than
the document I had already read and knew contained 54 multi-line formulas.

**Now covered**: a note whose display formula is not under the cursor, and a note with
several display formulas. Both fail with the exact `RangeError` when the change is
reverted — verified by reverting it.

**Also verified**: both of the user's real notes (11,113 and 12,716 characters) mount,
which is the check that should have existed before D-053 shipped.

---

## D-055 — A table is drawn as a table, reversing D-042's "pipes stay visible"

**Status:** done, at the user's insistence

> *"这个还不是表格"*

**They were right, and this reverses a decision I had written down and defended.**
`livePreview.ts` said a table's pipes "are **not hidden**: they are the column
boundaries. Hiding them would leave cells with nothing to separate them and no way to
line the columns up while editing." So a table got faint cell styling and kept its raw
pipes.

That reasoning optimised for *editing* a table and forgot *reading* one. Faint pipes
are still pipes; nine rows of `| … | … |` is still source code. The user pasted their
own 9-row table back to make the point.

**A table is now replaced by a real `<table>`** while the cursor is elsewhere, and
reverts to its full source the moment the selection touches it — the same contract
headings (D-026) and formulas (D-053) already follow. The editing concern the old note
raised is answered by that reversion, not by never rendering.

**What is rendered inside a cell:** bold, italic, strikethrough, inline code, and
maths. Cells carry their own formatting — the user's header row is `| **问题** | …` — so
a table showing literal asterisks would have traded one raw-syntax complaint for
another.

**Alignment is honoured**, read from the `:---:` row, which the parser hands over as a
single multi-character `TableDelimiter`.

**It shares the state field with maths**, not the view plugin, for D-054's reason: a
table spans lines, and replacing line breaks from a `ViewPlugin` throws. Both passes
also had to be reconciled — a formula inside a cell must be rendered *by the table*,
because two overlapping replacements are an error.

**One thing found in the user's data that I am not "fixing".** The `ACT 面经` note has
`| VAE | \(q(z|x)\) | …`, and that unescaped `|` **splits the cell**: GFM reads three
columns — `VAE`, `\(q(z`, `x)\)`. That is correct Markdown, and every other tool reads
it the same way. Special-casing pipes inside `\(…\)` would make this editor disagree
with the rest of the world about what the file says. Reported to the user instead, with
the two real fixes (`\|`, or backticks).

**Verified against the real note:** the 9-row table draws as 9 body rows with no pipe
anywhere in the output. 11 new tests, 273 total.

**Still unverified:** appearance. jsdom computes no layout, so column widths, borders
and spacing are unchecked — as with D-052 and D-053.

---

## D-056 — The block field forces the parse too, and the browser check finally works

**Status:** done — fixing a regression of D-052, and the verification hole that hid it

> *"这个还没有"* — pointing at the second table in the note.

**Two failures, and the second is the one that matters.**

**1. The bug.** `buildBlockDecorations` — the field that draws tables and maths — used
`syntaxTree(state)` rather than `ensureSyntaxTree`. That is exactly the lazy-parse trap
D-052 fixed for headings, reintroduced for tables. Measured on the user's note: the
ready tree covered 3,419 of 12,716 characters and saw **2 of its 5 tables**. The other
three were never drawn. A comment I had written in that spot claimed forcing the parse
"would undo D-052's budget" — wrong, since the parse is incremental and cached, which is
why D-052's fix is affordable at all.

**2. Why I said "verified" three times while this was broken.** My checks counted DOM
nodes in jsdom, which reports every element as zero-height. CodeMirror therefore renders
**26 of 321 lines**, and the user's five tables start at offsets 585, 2561, 4805, 6337
and 7864 — only the first is inside that window. My probe printed *"1 tables drawn"* and
I read it as success. It was the harness's ceiling, not the app's behaviour.

`check:long-note` now drives the built app in real Chrome, seeds a real note through the
app's own fixture, and **scrolls the note end to end**, accumulating what is drawn. It
took four wrong turns worth recording, because each produced a confident false result:

| attempt | what it reported | why it was wrong |
| --- | --- | --- |
| scroll `.cm-scroller` | 1 of 5 tables | that element has `overflow: visible` so the *page* scrolls; its `clientHeight === scrollHeight` and `scrollTop` does nothing. Measured: 8894 === 8894 |
| count raw `#` lines | 39 failures | counted `# X.shape = …` inside Python fences, and the cursor's own line, both correct behaviour |
| key headings by text | 40 of 41 | the note has `## KL` twice; a `Set` collapses them |
| key headings by pixel top | 64 of 41 | widgets mounting reflow the layout, so one heading counts several times |

**Now:** 5 of 5 tables and 22 of 22 headings on `PyTorch 与 JAX`; 2 of 2 and 40 of 40 on
`ACT 面经`; zero raw pipes and zero raw `#` on both. **And it fails when reverted** —
2 of 5 tables, 24 lines of raw pipes — which is the property the earlier attempts lacked.

**The browser-side census lives in `scripts/browser/sample-note-render.js`**, not in a
template literal. Embedding it meant hand-escaping every backtick, and I broke the script
that way three times.

**Seeding is dev-only.** The check sets `window.__seedNote`, read by `demoFixture`, which
`main.tsx` only reaches when Tauri is absent. The real notebook cannot be touched.

**The lesson, stated plainly:** a verification that cannot fail is worse than none,
because it converts "I did not check" into "I checked and it passed". Three of my claims
in this session were of that kind.

---

## D-057 — Notes read as a typeset ledger, without becoming a read-only mode

**Status:** done, requested by the user

> *"notes 里的笔记的显示……不符合我的审美"*

The Notes screen had all of the required content, but the hierarchy still read as a
styled editor: the index was a flat list, every blank Markdown line consumed full body
leading, headings inherited the interface sans, and fenced code split into separate
grey strips wherever the source contained a blank line.

The visual rule remains D-034's: **serif for the record, sans for the interface**.
H1–H3 now use the display face and scale by size, weight and section spacing; H2 also
gets a faint ledger rule. Paragraph breaks are compact while at rest, lists retain a
hanging indent, quotes use the restrained violet wash, and rendered formulae and tables
sit on bounded reading surfaces rather than floating among prose.

The note index now reads as part of the binder: its selected row carries the same
violet wash and registration edge as the primary navigation, excerpts may use two lines,
and the search field has a real focus state. No new colours were introduced; every value
comes from `tokens.css`.

**A title echo is presentation, not data.** When a note title is derived from a leading
Markdown heading, showing the input title and then the same H1 immediately below printed
the name twice. The duplicate heading is now collapsed only while the editor is
unfocused. Focusing the body reveals the original line again, so it remains editable and
the Markdown is never rewritten. A deliberately different opening heading is not hidden.

**Code blocks needed line decorations.** A character-range mark cannot wrap an empty
line, so CSS alone left holes in fenced code. `livePreview` now adds line decorations
across the complete parsed fence, including empty lines, with start/end classes for one
continuous block. A regression test asserts the blank line belongs to that region and
that the source is byte-identical.

**List markers and type scale received a follow-up pass.** A shared `ListMark` style had
made unordered markers disappear along with Markdown syntax. The preview now inspects
the source marker: `-`, `+`, and `*` render as restrained violet dots while the line is
at rest, ordered markers remain numbers, and the original source marker reappears on the
active line for editing. The editor body moved from 16px to 15px, the title from 32px to
28px, and the heading scale was reduced proportionally.

Verified in real Chrome as well as jsdom: the editor typography check passes, a long note
with a rendered table scrolls end to end with 24/24 headings and 1/1 tables, and the
880×600 layout check still passes. Full frontend result: **276 tests**, typecheck, lint,
format and production web build clean.

---

## D-058 — Daily use gets reliable saves, recovery and complete plan actions

**Status:** implemented, at the user's request to improve daily-use reliability

**Saving is a queue with an awaitable end.** `flush` previously returned immediately
if another write was in flight, swallowed failures, and could release its boolean lock
while a follow-up write was still running. Each note now owns one serial save queue.
All callers await the same drain through the latest draft; failures remain visible and
propagate to actions that require saved content. Failed drafts survive navigation and
reopening within the process. Linking or deleting a note waits for its text first.
Normal Tauri window-close requests also wait for pending saves; failure keeps the window
open. This does not claim protection against forced termination, system crashes, or
every OS Quit path.

**Backups use SQLite's online backup API.** Copying just the live `.sqlite3` file can miss
committed WAL pages. Settings now creates complete snapshots under the app's `backups/`
directory and publishes them only after integrity checks succeed. Restore accepts a
selected local snapshot from the current schema, validates the schema, integrity and
foreign keys, then creates a safety backup before atomically replacing the live contents.
Validation and copying share one source read transaction. No live file is deleted or
swapped underneath an open connection. A failed safety backup prevents restoration.
Settings drains pending note saves and blocks navigation shortcuts/window close during
the operation; folder-opening remains available even when a draft cannot save.

**Export makes the notebook portable.** Each export is a fresh folder containing the
original Markdown, deleted-note Markdown separately, all structured tables and filename
mappings in `manifest.json`, and a complete SQLite snapshot. Filenames are sanitized and
numbered so duplicate or path-like titles cannot overwrite files. The snapshot supplies
both text and metadata, keeping one consistent point in time. Files remain local; the
screen explains that copying them to another disk protects against device loss.

**Deleted notes are reachable again.** Settings lists soft-deleted notes and restores
their original text, timestamps and surviving Journey links. Deletion previously removed
their derived timeline entries; restoration deliberately does not fabricate lost
logging dates or snapshots. This limitation is stated beside the recovery controls.

**Plans affect intentions, recorded events affect current state.** Subject listings,
search results, prior-stage lookup and register tallies now exclude planned stages from
current-state calculations. Cancelling a plan requires confirmation, keeps tasks and
existing recorded history, and clears the tasks' dangling origin references transactionally.
Cancellation is not undoable. A confirmed plan can be returned to its target date only
when it is a source-free `event_recorded` entry with `planned_for`; ordinary and derived
history cannot be converted to plans. Milestone/compact plans expose management without
gaining permission to rewrite their recorded wording.

**Search reaches the actual task.** `Cmd/Ctrl+K` now matches unfinished task titles and
details. Even an unfiled task without a due date opens a concrete task detail dialog,
where it can be completed, reopened or linked to a Journey. Returning preserves the
query, and task/history matches are deduplicated.

---

## D-059 — Timeline is one reading surface, not stacked summaries and cards

**Status:** implemented, at the user's explicit request for frontend display changes

The user described the Timeline as visually fragmented and clarified that this was a
presentation problem, not a request for new product behaviour. This pass keeps D-034's
existing palette and editorial hierarchy without changing event data or actions.

**Make the chronology reachable.** The Journey heading, trace and tabs now take less
vertical space and share the timeline's reading width. The Latest Progress summary
remains on Overview; it no longer repeats the same history above Timeline. This refines
D-031's placement, not its evidence-based approach to development.

**One axis, several levels of emphasis.** Date-column width, rail spacing and marker
position come from shared CSS variables. Date groups connect within each month, and
markers stay on the rail at narrow widths. Ordinary records, reflections and task
groups rely on spacing and subtle rules instead of nested boxes. Milestones retain a
restrained accent; planned and overdue entries retain their distinct appearance.

**Titles have room to read.** Timestamp, stage and type labels sit below the title so
long text does not compete with edit controls. Journey links and state transitions can
wrap. The same entry components serve global, Journey and subject-history timelines;
context-rail visibility no longer leaves empty reserved space or covers the reading
column at smaller desktop widths.

No event sorting, timestamps, plan lifecycle, navigation, repository or schema changes
belong to this decision. Visual checks use a separate memory-only notebook; they do not
alter the user's records.

**Follow-up: markers belong to the drawn curve.** A user screenshot revealed that the
trace skipped crowded deflections to avoid backtracking but still drew every event's
dot. Its line, fill and visible peaks now come from the same geometry calculation.
Skipped peaks leave neither dots nor rings; the actual records remain in the timeline.
The stroke-only entrance animation is also removed because it detached markers from
the partially revealed line on mount and resize. The separate NOW indicator stays.

---

## D-060 — Interface language is a local preference; content is never translated

**Status:** implemented, explicitly requested by the user

This supersedes D-019's English-only chrome and the same constraint in D-029/D-030.
Settings offers Simplified Chinese and English, applies the choice immediately and
remembers it locally. The first launch follows the system language (Chinese for `zh`,
English otherwise). Navigation, controls, help, empty states, accessibility labels and
human-readable dates follow this preference; stored timestamps and local-day grouping
do not change.

Notes, Journey names/descriptions, event/task text, custom register names and user-defined
stages remain byte-for-byte user content. Language switching is not a data migration,
does not recreate editors, and never calls a translation service. The implementation
uses a small typed bilingual helper and the existing UI store technology, with no new
runtime dependency, account or network requirement.

---

# Open questions (do not block MVP)

## Numeric series, and importing weight / spending (open)

The user wants a smart scale's weight and WeChat spending in the app. Not yet
designed; researching what the sources can actually export first. What is already
established, so it does not have to be rediscovered:

**The blocking gap is that nothing here is numeric.**

- `StateChange.from` / `to` are `string | null`. The model records
  `basic → intermediate` fine, but `73.2 → 72.8` is two strings: no unit, no
  difference, no ordering, no trend.
- The trace's Y axis is **importance**, not value — three fixed steps
  (0.28 / 0.62 / 1), and `trace.ts` says interpolating between them "would be
  inventing a scale". So the existing chart cannot draw a weight curve; it draws
  how much each event mattered.

Any of this work needs a numeric state shape first — something like
`{ field: 'weight', value: 72.8, unit: 'kg' }` alongside the string form. That
would also fix a separate problem already observed: on realistically sparse data
the trace encloses almost no area, whereas a weight series has genuine shape.

**The two sources are not the same kind of data, and must not share a design.**

- **Weight** is a sparse state change — one reading a day, ~365 points a year.
  It genuinely belongs on the timeline: "lost 2kg in August" is something that
  happened.
- **Spending** is a high-frequency transaction stream — hundreds of rows a month.
  Putting each row on the timeline would bury the few entries that carry meaning,
  destroying the one thing this product is for. Ledger rows belong in their own
  table; only **aggregates** ("August spend 4,230, down 800") belong on the
  timeline.

**Constraint from PRODUCT.md:** no network on the critical path, no cloud
dependency. That rules out background sync. A manually triggered, one-shot import
satisfies both this and privacy.

**Preferred shape, if it survives the research:** one generic CSV importer —
drop a file, map columns (date / value / note), **preview what it will create**,
then confirm. The scale's export, the bank statement and a hand-kept spreadsheet
then all use one path, with no dependency on any vendor's API staying stable.

**Unverified, and why the user is checking:** whether the scale exports a file at
all, or writes to Apple Health (which has a real read API and would be the better
path), and whether WeChat's statement export is usable. I have no web access this
session, so I did not confirm any vendor capability — and guessing at an API is
how the "written but never executed" class of bug gets in.

**Two answers that decide the architecture:** can the scale export a file or
reach Apple Health; and for money, is the goal a monthly trend or progress toward
one target (an aggregate series versus a single running total against a line).


1. Final public product name; “Journey Notes” is a working codename.
2. Whether notes become plain `.md` files as primary storage or remain SQLite-backed Markdown with robust export. MVP may use SQLite-backed Markdown if that reduces risk.
3. Exact custom-view system after MVP.
4. ~~Whether a Note can link to multiple Journeys in the UI immediately; schema should not prevent it.~~
   **Resolved during implementation:** yes, immediately. `journey_links` made it
   free, and the demo fixture already relies on it — one note reaches both
   `秋招 2026` and `VLA 学习` from a single event record. The editor's journey
   chips add and remove links individually.
5. Global capture parser / natural-language commands.
6. Optional local AI summarization/review features.
7. ~~Dark theme.~~ **Resolved: implemented, see D-027.** Light, dark, and follow-the-OS.
8. Sync/export strategy.
