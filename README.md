# Bizi

A local Windows organizer built with Tauri 2, Rust, SQLite, React 19, TypeScript, and Vite. Desktop data stays in the app-data directory. No account or cloud service is required.

## Available interface

- **To-Do:** scheduled tasks in day, week, month, year, and two-year views; overdue scheduled work; an Unscheduled group; archived-task recovery. Long views use 60-day pages.
- **Projects:** cards, status board, timeline, tasks, notes, and archive recovery.
- **Areas:** descriptions, linked projects, tasks, and notes.
- **Life:** birth date/time, lifespan statistics, and a calendar in weeks or months.
- **Settings:** local AI bridge status, port, credentials, and activity.

Goals, habits, reviews, and search remain backend capabilities. Their dedicated interfaces, an Inbox page, a command palette, system theme, and the former keyboard shortcuts are not currently implemented. Recurrence is stored but is not expanded automatically.

Tasks have separate scheduled and due dates. Moving a task changes its scheduled date and persisted position; it leaves the due date unchanged. Archived tasks and projects are recoverable through filters in their existing views.

## Persistence

Desktop data uses SQLite with WAL mode and foreign-key enforcement. Versioned migrations run transactionally. Upgrading an existing database to version 3 creates a consistent SQLite backup named `bizi-before-v3-<id>.db` beside the database before changing it. Migration 3 adds task order without deleting user records.

The UI waits for confirmed writes, serializes mutations, and displays persistence errors. Titles and notes use a 400 ms debounce, flush on blur and in-app navigation, and retain failed drafts for retry. Closing the entire application with unsaved drafts is not a substitute for completing a save.

A workspace snapshot reads tasks, projects, areas, and notes in one request without a 500-task cutoff. External write events are coalesced and stale snapshot responses are discarded.

Browser development uses a localStorage driver with matching validation and task movement. It uses separate browser data; it does not edit the desktop SQLite database.

## Local AI bridge

The desktop app serves a loopback HTTP API on `127.0.0.1`, starting at port 1421. Settings shows the actual listening port if the configured one is busy.

- `GET /health`: liveness, without authentication.
- `GET /schema`: command catalog, including write/destructive flags.
- `POST /invoke`: JSON `{ "cmd": "task_create", "args": { "input": { "title": "Example" } } }`.

Except for health, requests require `Authorization: Bearer <token>`. The token is stored in `bridge.token`. Regeneration revokes the old credential for subsequent requests immediately. Successful mutations emit a data-changed event to the interface.

The shared Rust layer validates supplied field types, titles, dates, enums, numeric ranges, and referenced records. Multi-statement task/project/goal changes roll back on failure. Invalid arguments return HTTP 400; unexpected execution failures return 500.

New commands:

- `workspace_snapshot`, with empty arguments: all tasks/projects/areas and their notes, including archived records.
- `task_move`, with `{ "id": "...", "scheduledDate": "2030-01-01", "beforeId": null }`: move/reorder atomically. A null date makes a task unscheduled; a null anchor appends it. The anchor must be a different task in the destination bucket.

Existing command names and successful response envelopes are preserved. `task_list` still defaults to 500 records; use the snapshot for the complete workspace. Fetch the schema before using the bridge, and confirm destructive actions before invoking deletion commands.

The stdlib Python client is in `scripts/bridge_client.py`. It can read the local token automatically. Configure `BIZI_BRIDGE_URL` when the bridge uses a different port.

## Development and builds

Use Node 20.19+ in the 20.x line, or Node 22.12+. Desktop builds additionally require Rust/MSVC, Visual Studio C++ Build Tools, and WebView2.

`npm ci` installs the locked frontend dependencies.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Browser development server |
| `npm run dev:web` | Browser development on port 1420 |
| `npm run dev:desktop` | Tauri desktop development with incremental Rust builds |
| `npm run build` | Type checking and production frontend bundle |
| `npm run preview` | Serve the existing built dist output on port 7100 |
| `npm run lint` | ESLint, zero warnings |
| `npm test` | Frontend regression tests; fails if tests are absent |
| `npm run test:native` | Locked native tests |
| `npm run package:win -- -- --locked` | Release executable and NSIS installer |

The installer is written to `src-tauri/target/release/bundle/nsis/`. Use desktop development for iteration; release builds retain thin LTO and a single code-generation unit.

## Verification and CI

Frontend tests cover browser persistence, validation, persisted IDs/order, failed writes, snapshots above 500 tasks, queued refreshes, draft debounce/retry, date conversion, and planner pagination. Native tests use foreign-key enforcement and cover transactional relationships, input rejection, movement, snapshot completeness, migration/backup preservation, and authenticated HTTP requests including token rotation.

Windows validation runs lint, frontend tests/build, formatting, and native tests. Rust dependencies are cached. The separate Windows installer workflow runs manually or on version tags and uploads an installer artifact; it does not publish a release.

Automated checks do not establish that an installer was installed and exercised. Release verification must separately check Windows installation/startup, window controls, HTML drag-and-drop, persistence after restart, recovery views, and bridge enable/disable/port changes.
