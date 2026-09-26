# Bizi

A calm personal life organizer for Windows. Local-first Life OS: life areas, goals, projects, tasks, today, inbox, calendar, habits and reviews — all views over one shared local data model.

No account, no server, no cloud. Your data lives in a local SQLite database.

## The idea

Life is organized at several levels:

```text
Life Area → Goal → Project → Task → Today
```

…but Bizi does not force this as a rigid tree. Relationships are flexible: goals belong to one life area; projects belong to a life area and can link to several goals; tasks can belong to a project, directly to an area, relate to a goal, or sit unclassified in the Inbox. There is **one task object** displayed in many places — complete it in Today and it is completed everywhere.

The interface follows progressive disclosure: simple lists first, full detail in a side panel or on the entity page. No crowded dashboard.

## Sections

| Section | What it does |
| --- | --- |
| **Today** | Tasks scheduled or due today, plus overdue and completed-today groups |
| **Inbox** | Fast capture with no classification required; process later (convert to task/project/goal) |
| **Areas** | Permanent life domains with Overview / Goals / Projects / Tasks / Notes tabs |
| **Goals** | Desired outcomes with status, priority, dates, manual or automatic progress |
| **Projects** | Initiatives with tasks; list and board views over the same data |
| **To-Do** | All tasks with quick filters, attribute filters, sorting and search |
| **Calendar** | Month view combining scheduled tasks, deadlines, projects and habits; drag to reschedule |
| **Habits** | Repeated behaviors: today check-off, this-week grid, 12-week history |
| **Reviews** | Weekly / monthly / annual reflection with computed stats and writing fields |
| **Archive** | Archived goals, projects, tasks and areas, restorable |
| **Settings** | Theme, data location, shortcuts |

Quick add (**Ctrl+N**) captures a task in seconds: title plus optional date, project and priority. The command palette (**Ctrl+K**) searches everything and jumps anywhere.

## Task model

Tasks support title, description, status (inbox / to do / in progress / waiting / completed / cancelled), life area, project, related goals, priority (P1–P4), **scheduled date** (when you plan to work on it), **due date** (when it must be done), deadline type (hard / soft / none), estimates, subtasks, recurrence rule (stored; scheduling stays manual in v1) and notes.

The scheduled/due distinction is deliberate: dragging a task to another day in the calendar moves the scheduled date and never touches the due date.

## Stack

Tauri 2 / Rust for the native shell and validated SQLite access (rusqlite); React 19 / TypeScript / Vite for the interface. Design follows the Ohana principles from Lotus: cream/ink/warm-accent palette, light and charcoal themes, restrained serif display type, quiet lists instead of dashboards. Windows WebView2 is required.

## Data

The database is created at first launch in the Windows app-data directory (`bizi.db`, WAL mode) with versioned migrations and realistic sample data (business/research/health examples) so every feature is testable immediately. Sample data only appears in an empty database.

## Development

Requires Node.js, Rust with the MSVC toolchain, Visual Studio C++ Build Tools, and Windows WebView2.

```powershell
git clone https://github.com/roma-buddha/Bizi.git bizi
cd bizi
npm ci
npm run dev        # Tauri dev window
```

```sh
npm run lint       # eslint, zero warnings allowed
npm test           # vitest (frontend unit tests)
npm run test:native# cargo test (schema & seed)
npm run build      # type-check + production bundle
npm run package:win# NSIS installer (unsigned)
```

`npm run dev:web` runs the frontend alone in a browser with a localStorage-backed data driver — useful for UI work without the Rust build. The desktop build always uses SQLite.

The NSIS installer is built in `src-tauri/target/release/bundle/nsis/`.

## Architecture

```text
src/
  models/      domain types, enums, constants
  db/          API surface + Tauri driver + browser fallback driver
  state/       route/theme/ui store, data-version refresh, useQuery
  components/  shell (TopBar, Sidebar), TaskRow, TaskList, detail panel,
               palette, quick add, shared UI primitives
  features/    one file per section (Today, Inbox, Areas, Goals, Projects,
               TodoList, Calendar, Habits, Reviews, Archive, Settings)
  utils/       date math, progress calculation (+ unit tests)
src-tauri/
  src/db.rs        schema, migrations, seed (+ tests)
  src/commands.rs  typed command handlers over SQLite
  src/models.rs    serialized row types
```

UI never talks SQL; it calls the typed `api` surface (Tauri commands in the app, an equivalent local driver in the browser). All views read the same tables, so edits propagate everywhere through a single data-version refresh.

## Version 1 scope

Included: areas, goals, projects, tasks, today, inbox, calendar (month), habits, basic weekly/monthly/annual review, search + command palette, local SQLite, archive, light/dark/system themes, keyboard shortcuts.

Deliberately deferred: AI assistant, cloud sync, email integration, external calendar sync, attachments/files, Gantt and the multi-year Roadmap view, notifications, mobile. Recurrence is stored but not yet expanded automatically.

## Status

0.1 — core system implemented and verified (type-check, lint, vitest, cargo test, production build). Built as a sibling of [Lotus](https://github.com/roma-buddha/lotus-notes) with the same engineering discipline: strict TypeScript, layered architecture, Windows CI.
