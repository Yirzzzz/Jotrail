# Jotrail

A local-first desktop notebook that connects your notes into journeys, helping you
see how far you've come.

Write Markdown notes, connect them to a personal theme, and follow how it develops
through a timeline of notes, tasks, milestones and meaningful changes.

## Features

- Markdown notes with live preview, tables, code blocks and math.
- Flexible Journeys for any long-running theme, with chronological timelines.
- Lightweight tasks, milestones and state-change history.
- Local SQLite storage, backups and export, with no account required.
- Chinese and English interface, with light and dark themes.

## Run locally

Requirements: Node.js 20.19+ or 22.12+, Rust stable, and the native build dependencies
for Tauri 2. On macOS, install Xcode Command Line Tools. Windows needs MSVC build tools
and WebView2; Linux needs the WebKitGTK and related native development libraries.

```bash
npm ci
npm run dev
```

The desktop application currently appears as **Journey Notes**. Development mode adds
example data only when the notebook is empty; release builds do not seed examples.
On macOS/Linux, `npm run dev:clean` starts development mode without seeding.

For a browser-only UI preview:

```bash
npm run dev:web
```

The browser preview uses in-memory example data. Changes there do not persist and
do not touch the desktop notebook.

## Build and check

```bash
npm run check
npm run build
```

`check` runs formatting, lint, TypeScript and the web build. `build` packages the
desktop application with Tauri; the current bundle configuration produces a macOS
`.app` under `src-tauri/target/release/bundle/macos/`.

Tests and internal development materials are kept locally, not in this source
distribution. Leave Rust's optional `local-tests` feature disabled in a fresh clone.

## Data and fonts

The desktop notebook lives in the operating system's application-data directory,
not in the repository. Settings shows the location and provides backup/export tools.

Optional proprietary CJK font files are not included. A fresh build may report
unresolved YaHei font paths; the interface falls back to system fonts. Review any
locally added font assets before distributing a packaged application.

Built with Tauri 2, React, TypeScript, Vite and SQLite.
