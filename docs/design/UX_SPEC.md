# UX Spec

## 1. Visual intent

The interface should feel like a **quiet personal notebook with the structure of a high-quality desktop productivity tool**.

Keywords:
- calm
- editorial
- spacious
- personal
- precise
- warm
- high-information but low-noise

Avoid:
- enterprise admin dashboard
- Jira/CRM feeling
- Notion clone visuals
- excessive cards
- rainbow tagging
- loud gradients
- fake gamification

## 2. Primary reference

Use:

`reference/journey-timeline-primary.png`

as the strongest visual reference.

Secondary references:
- `reference/journey-timeline-exploration.png`
- `reference/home-dashboard-exploration.png`

These are exploratory and may conflict with the final product model. Written specs win.

Dark-theme references (also exploratory, same rule):
- `reference/8c3de494-2a31-4907-a69c-4c6f5c66ba2b.png` — journey timeline, dark
- `reference/aacf1b0f-cdf5-4203-89e6-d6895c36e9ae.png` — journey overview, dark
- `reference/c4aeaf53-00b3-4058-93a5-c789356170a1.png` — note detail, dark
- `reference/2f793538-7805-4e36-8e81-3301edfb5d80.png` — Today dashboard, dark
- `reference/home-dashboard-exploration.png` — a Today dashboard in a *different*
  visual language (serif, gold accent, product name "Aster"). Kept for reference
  only; it is **not** the direction being built, though its day timeline and
  "next" panel are the same idea as the one above.

The dark theme is a re-tokenisation of the primary reference, not a second
design: same layout, spacing, type scale and hierarchy, different colours only.
See `STYLE_TOKENS.md` §1 and `DECISIONS.md` D-027.

Note that the dark references show progress rings and percentage bars
(68%, capability meters). Those are **not** implemented and should not be added —
D-007 rules out putting invented percentages on a life theme, and §7 below lists
them as bad rail content. Take the composition from these images, not the
metrics. What replaces them is in §13.

## 3. Desktop layout

Target common desktop/laptop widths first.

Conceptual layout:

```text
┌───────────────┬──────────────────────────────────┬────────────────┐
│ Sidebar       │ Main Journey / editor            │ Context rail   │
│ ~200-220 px   │ flexible, readable max width     │ ~280-320 px    │
└───────────────┴──────────────────────────────────┴────────────────┘
```

At narrower widths:
- context rail may become a drawer/collapsible panel
- sidebar may compact
- main reading width should remain comfortable

## 4. App sidebar

Default navigation concept:

```text
Today
Notes
Timeline

Journeys
  秋招 2026
  VLA 学习
  论文写作
  健身
  ...

+ New Journey

Tasks (optional global shortcut)

Settings
```

The Journeys section should feel user-owned, not preconfigured by domain.

## 5. Journey header

Recommended hierarchy:

1. optional cover/visual band
2. Journey icon + name
3. date range
4. short intent/description
5. status
6. tabs

Default tabs:
- Timeline
- Notes
- Tasks
- Overview

Optional custom tabs can be added later.

Do not show generic Positions/Skills tabs for every Journey.

## 6. Timeline typography and rhythm

Timeline should visually group by month/date.

Suggested rhythm:
- month heading
- date marker in narrow column
- vertical line/point
- content block

Content blocks should have multiple density levels.

### A. Compact event

```text
14:30   ✓ Finished ROS2 Action study
```

### B. Note excerpt

```text
ROS2 Action
Learning note · 1h 42m

Today I finally understood ...
```

### C. State transition

```text
ROS2
Basic -> Intermediate

Evidence:
✓ Action client/server demo
```

### D. Reflection

```text
Why?
I decided not to apply yet because ...
```

### E. Milestone

More breathing room and stronger typography, but still restrained.

Not all timeline items should be boxed cards. Use separators/whitespace for smaller items to avoid a card wall.

## 7. Context rail

Journey right rail may contain:

### About
- started date
- status
- current focus

### Pinned
- selected notes/resources

### Upcoming
- due tasks/events

### Custom views
- only if configured for this Journey

Do not lead with arbitrary metrics.

## 8. Notes editor

The writing surface should borrow from Typora's calm reading experience:
- centered readable column
- roughly 680–760 px text measure where possible
- strong heading hierarchy
- minimal chrome while writing
- metadata hidden/collapsed or placed in context panel
- autosave

A user must be able to write without thinking about databases.

## 9. Today screen

Today should be simple and personal:
- date/greeting
- current focus
- today tasks/events
- recent notes/logs
- optional daily journal

Avoid a grid of KPI cards.

## 10. Global Timeline

Same visual grammar as Journey Timeline, but each item includes Journey context.

Useful filters later:
- Journey
- type
- date range

## 11. Interaction details

Desired shortcuts:
- `Cmd/Ctrl+N`: capture/new note
- `Cmd/Ctrl+K`: command/search
- Escape: close transient overlays

Desired microinteractions:
- subtle selected row background
- gentle hover transitions
- keyboard focus visible but not loud
- timeline entry expansion should preserve reading context

## 12. Empty states

Good Journey empty state:

> Start with a note, task, or event. This timeline will grow as the Journey develops.

Bad empty state:

> Configure 8 properties to begin.

## 13. Showing development without inventing numbers

The dark references lead with progress rings and percentage bars. The panels that
replaced them all answer the same question from real records. Implemented in
`src/domain/development.ts` and `src/domain/upcoming.ts`; see `DECISIONS.md`
D-028.

| Instead of | Show |
| --- | --- |
| a 68% focus ring | **Current focus** — the most recent milestone or state change, dated |
| a sparkline of progress | **Recent development** — milestones and state changes as a dated rail, oldest first |
| `ROS2 68% · Intermediate` | **Tracked states** — `Basic → Intermediate`, when it changed, how many transitions are on record |
| "5 days to completion" | nothing. The app does not know |
| Papers / Projects / Skills tabs | entry points to the tabs that exist, with real counts |

Rules for anything added here later:

- **A number must be counted, not estimated.** `14 notes` is fine. `68% ready` is
  not.
- **A level is a judgement, not a position on a scale.** Render the user's own
  word for it. Do not map it onto a percentage or a bar.
- **Prefer the transition to the current value.** `Basic → Intermediate` says more
  than `Intermediate`, and it is what the product exists to preserve.
- **Derive from events, never from a snapshot column.** That is what keeps the
  history recoverable.

### Day timeline and Up next

The Today screen's two additions:

- **Today · timeline** — today's events, ascending, time in the left column.
  Tighter than the Timeline screen: one day needs no month heading or date rail.
- **Up next** — task due dates and future-dated events, soonest first, with a day
  count (`Tomorrow`, `3 days left`).

Up next deliberately excludes today and overdue items. Those are shown as due
work above it, and listing the same task in both places makes one obligation look
like two.
