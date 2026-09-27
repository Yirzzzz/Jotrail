# Developing

## Requirements

- **Node** 20+ (developed against 24)
- **Rust** stable (developed against 1.98) — `curl https://sh.rustup.rs -sSf | sh`
- **macOS**: Xcode Command Line Tools. **Linux**: `webkit2gtk`, `libayatana-appindicator`. **Windows**: MSVC build tools + WebView2.

```bash
npm install
npm run dev          # desktop app with hot reload
```

### The CJK font is not in the repository

`src/styles/fonts.css` loads Microsoft YaHei (微软雅黑) from
`src/assets/fonts/yahei-{400,700}.woff2`, and those files are **deliberately not
committed**: YaHei is licensed for distribution with Windows and Office, so
shipping it in a repository is outside that licence (D-035 says the same).

So a fresh clone builds and runs, with two consequences:

- `vite build` prints `../assets/fonts/yahei-400.woff2 ... didn't resolve at
  build time`. **This is expected**, not a broken checkout — verified by building
  with the directory removed.
- Chinese text falls through to the next face in the stack (PingFang SC on
  macOS). Latin and digits are unaffected, because `unicode-range` restricts the
  YaHei faces to CJK codepoints anyway.

To restore the intended typography locally, drop the two `.woff2` files into
`src/assets/fonts/`. The proper fix before publishing is to swap in **Noto Sans
SC** or **Source Han Sans** — open licence, near-identical structure, and a
variable version that would cut the 9.8 MB down further.

## Before publishing the repository

`.gitignore` excludes dependencies, build/test output, local tooling, environment
files, signing credentials, SQLite files, root-level `backups/` and `exports/`,
tests, development-only scripts, and personal notebook maintenance examples.
Keep application source, migrations, `package-lock.json` and `src-tauri/Cargo.lock`.
`fixtures/demo-seed.json` is a runtime dependency for the browser preview and Rust
development seed, not an optional test file.
Environment templates are allowed only after replacing real values with placeholders.

`git add` stages files locally; it does not upload them. Check which tracked files
would now be ignored with `git ls-files -ci --exclude-standard`. For each unwanted
path, `git rm --cached -- path/to/file` stops tracking it without deleting the local
file. Review `git diff --cached --name-status` before committing.

**Ignoring or untracking a file does not erase earlier commits.** For this first
source release, `main` was explicitly rebuilt as one parentless commit after backing
up the previous history outside the project. Old commits and local tests remain in
that private backup, not in the publishable branch. Push only `main`; do not mirror
all local refs or upload the backup.

Some current documentation and comments still quote personal notebook details.
Review and sanitize those before making the repository public: this history cleanup
is not a comprehensive privacy audit. Do not publish local release bundles until
their bundled font assets have also been reviewed. A source-only ignore rule does
not remove assets from a binary.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Tauri desktop app, frontend hot-reloaded. Seeds the demo fixture if the notebook is empty |
| `npm run dev:clean` | Same, but **never** seeds — for keeping a real notebook in a dev build |
| `npm run dev:web` | Frontend only in a browser, backed by the demo fixture in memory |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm run lint` | ESLint |
| `npm run format` | Prettier, writes |
| `npm run check` | format + lint + typecheck + web build |
| `npm run build` | Production `.app` / executable |

Run `npm run check` and `cargo check --manifest-path src-tauri/Cargo.toml` before
calling a source change done.

Tests and browser-check scripts are retained only in the original local workspace,
not in the published repository. Local maintainers can use the ignored
`LOCAL_TESTING.md`; a fresh clone intentionally has no regression suite. The Rust
`local-tests` feature is opt-in and requires those local files. Leave it disabled in
a fresh clone; `cargo test --all-features` is not supported without them. Historical
test commands and counts in the implementation logs refer to earlier snapshots.

`npm run dev:web` is for working on the UI quickly — it has no SQLite behind it,
so nothing persists and Settings says so. Anything touching persistence needs
`npm run dev`.

### Building a DMG

`npm run build` produces the `.app` only. DMG packaging shells out to
`bundle_dmg.sh`, which mounts a disk image and needs a GUI login session, so it
fails headless. On a desktop session:

```bash
npx tauri build --bundles dmg
```

## Where things live

```text
src/
  app/          shell, sidebar, route store
  components/   shared primitives
  data/         Repository interface, Tauri + in-memory implementations
  domain/       types mirroring Rust, pure presentation logic
  features/     journeys, notes, tasks, timeline, today, settings, capture
  lib/          timezone-safe date helpers
src-tauri/
  migrations/   forward-only SQL
  src/db/       repositories — the only place SQL is written
  src/commands.rs  IPC surface
  src/domain.rs    serde types shared with the frontend
```

## Rules worth knowing before changing things

**SQL lives only in `src-tauri/src/db`.** Commands and components call
repositories. React components never see SQL, and repositories never see Tauri.

**Mutation plus history is one transaction.** Completing a task updates the task
row and inserts the `task_completed` event together, or neither happens. If you
add a state change that should be remembered, follow `tasks::set_status`.

**`occurred_at` is chronology; `created_at` is bookkeeping.** Never sort a
timeline by `created_at` — that would break recording something that happened
last month.

**Timestamps are UTC in the database, local in the UI.** Use the helpers in
`src/lib/datetime.ts`; grouping by UTC day puts a late-evening entry on the wrong
day for most of the world. When validating date behavior, use a non-UTC timezone
so a UTC-only assumption does not pass quietly.

**Schema changes are new migration files.** Never edit an applied one. Add
`migrations/000N_*.sql` and register it in `db/migrations.rs`.

**The editor decorates; it never rewrites.** Live preview (`livePreview.ts`) hides
Markdown syntax and styles the content, but the document stays plain Markdown —
that is what keeps autosave, the timeline and any future export seeing exactly
what the user typed. If you add a decoration, it must be `Decoration.mark` or
`Decoration.replace`, never a document change. Source text must remain byte-identical
after the cursor visits every line.

**The editor is still replaceable.** It sits behind `MarkdownEditorProps`, so the
implementation can change again without touching note domain logic.

**A `<form>` in a dialog must be a direct child of `.modal__panel`.** The panel is
height-capped and `overflow: hidden`, so anything in between has to be a
shrinkable flex column or the footer — and its submit button — is clipped out of
reach on a short window. The `.modal__panel > form` rule handles it; a wrapper
`<div>` around the form would silently break it. jsdom applies no CSS and cannot
catch this; validate it in a real browser at the minimum window size.

**Notes may belong to many journeys.** Nothing may put a `journey_id` column on
notes or tasks; associations go through `journey_links`.

**Colours come from tokens; components never hard-code one.** Both themes are
just two blocks in `src/styles/tokens.css` — `:root` for light and
`[data-theme='dark']`, which `src/app/theme.ts` toggles on `<html>`. A literal
`#fff` or `rgba()` in a component silently breaks one of the two themes, which is
exactly what had to be undone to add dark mode. If you need a colour that does not
exist yet, add a token to *both* blocks. Text on a filled accent surface is
`--accent-contrast`, not white.

**Adding a Tauri command** means: repository function (with tests) → thin
`#[tauri::command]` wrapper → entry in `generate_handler!` → method on
`Repository` → both implementations. The compiler will find the last one for you.

## Two implementations of `Repository`

SQLite is real. The in-memory one exists so tests and `dev:web` can run the UI
without a backend, and reproduces only the rules the UI needs (link → log,
complete → record, order by `occurred_at`). **If they disagree, Rust is right.**
Persistence behaviour needs validation against SQLite, not just a frontend fixture.
The local-only Rust tests cover this; see DECISIONS.md D-017 for the original checks.

## Where the data is

### Backups, export and deleted notes

Settings now has **Back up now**, **Export notebook**, a saved-backup list with
confirmed restoration, and **Recently deleted notes**. Backups and exports live under
the app data directory, in `backups/` and `exports/`; the buttons open those folders.
Copy them to another disk for an independent backup.

A backup includes committed WAL contents through SQLite's online backup API. Restoration
validates the snapshot and creates a **Before restore** safety copy first. It currently
accepts snapshots from the current schema version only. Export creates Markdown files,
structured metadata/history JSON, and a complete SQLite snapshot in a new folder.
Deleted notes are exported separately; recovering a deleted note preserves text and
surviving Journey links but does not recreate previously removed timeline entries.

All data-changing maintenance operations first drain pending note saves. Normal Tauri
window-close requests wait for saves too; this does not cover forced termination,
crashes, or unverified OS Quit paths. Browser previews cannot create real data files.

`~/Library/Application Support/com.journeynotes.desktop/journey.sqlite3` on
macOS; the equivalent app-data directory elsewhere. Settings shows the exact
path.

**Resetting.** Stop the app first — SQLite is in WAL mode, so a running app can
rewrite `-wal` as you delete:

```bash
rm -rf ~/Library/Application\ Support/com.journeynotes.desktop
```

A development build then re-seeds the demo fixture on next launch. To start a
**real, empty notebook** from a dev build, use `npm run dev:clean`
(`JOURNEY_NOTES_NO_SEED=1`). Seeding never happens in a release build, and never
touches a database that already has content either way.

No account, no sync, no telemetry, no network calls during normal use. Keep it
that way unless a decision in `docs/DECISIONS.md` says otherwise.
