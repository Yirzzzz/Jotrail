# Acceptance Criteria

## A. Product identity

- [ ] The application reads visually as a notebook/timeline product, not a CRM or admin dashboard.
- [ ] Journey is generic; a user can create one named “健身” without career-specific fields appearing by default.
- [ ] Timeline is the default view after opening a Journey.
- [ ] A user can start writing a Note without first completing metadata forms.

## B. Journey

- [ ] Create a Journey with title and optional description.
- [ ] Open Journey from sidebar.
- [ ] Edit Journey status.
- [ ] Journey persists across restart.
- [ ] Journey supports optional icon/cover without making either required.

## C. Notes

- [ ] Create Note.
- [ ] Edit Markdown content.
- [ ] Autosave works without destructive race conditions in normal use.
- [ ] Note can exist with no Journey.
- [ ] Note can be linked to at least one Journey.
- [ ] Architecture/schema does not prevent future multi-Journey linking.
- [ ] Note persists across restart.

## D. Timeline

- [ ] Timeline event has both `occurred_at` and `created_at` semantics.
- [ ] Linked/logged Note can create a Timeline event.
- [ ] Timeline sorts by `occurred_at`.
- [ ] A historical event entered today can appear in an earlier date position.
- [ ] Clicking a Note timeline entry can open the source Note.
- [ ] Timeline supports at least compact, normal, and milestone-ish visual densities.
- [ ] Reflection text can be displayed distinctly.
- [ ] Global Timeline uses the same underlying events rather than a separate incompatible model.

## E. Tasks

- [ ] Create Task.
- [ ] Link Task to Journey.
- [ ] Complete Task.
- [ ] Completion records `completed_at`.
- [ ] Completion can create a persisted Timeline event.
- [ ] Task state survives restart.

## F. Persistence and reliability

- [ ] Database migrations run on a clean install.
- [ ] Database is local to the user/app data directory.
- [ ] No login is required.
- [ ] No network request is required for core usage.
- [ ] No analytics/telemetry is sent by default.
- [ ] A failed Note save is surfaced to the user instead of silently losing text.

## G. Visual quality

- [ ] Primary Journey screen follows `journey-timeline-primary.png` in hierarchy and proportions.
- [ ] Left sidebar, main timeline, and right context rail are clearly differentiated.
- [ ] Main content remains readable on a typical laptop-width window.
- [ ] Right rail can collapse or adapt when width is constrained.
- [ ] UI uses restrained color and does not assign a bright color to every content type.
- [ ] Blank space is preserved; UI is not filled with unnecessary metrics.
- [ ] Notes editor has a comfortable reading width.

## H. Engineering

- [ ] TypeScript strict mode passes.
- [ ] Formatting/linting commands pass.
- [ ] Relevant unit tests pass.
- [ ] Production frontend build passes.
- [ ] Tauri dev/build check reaches the furthest point supported by the local environment.
- [ ] `docs/implementation/STATUS.md` is updated with commands actually run.

# MVP Definition of Done

The MVP is not “done” because the screenshot looks right. It is done when the screenshot's core experience is backed by durable local data and the following story works end-to-end:

> I create a Journey, write a Note, associate it with that Journey, see the Note become part of the Journey's chronology, complete a related Task, see that change recorded, close the app, and later reopen the exact same evolving story.
