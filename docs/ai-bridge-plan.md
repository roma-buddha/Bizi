# Plan: Local AI Bridge for Bizi (Path B)

**Goal:** Let external AI agents (Kimi Work, scripts, any tool) connect to a *running* Bizi instance over a loopback-only HTTP API and perform any operation the UI can — driven by voice commands spoken to the AI. All writes go through Bizi's existing validated command layer; external processes never touch `bizi.db` directly.

**Status:** implemented — all 5 phases complete and verified (7 Rust tests incl. end-to-end HTTP, ESLint zero warnings, `tsc` + production build green). The one untested seam is app startup wiring (`main.rs`), which requires launching the desktop app.

---

## 1. Architecture

```
voice → Kimi app / Kimi Work → POST http://127.0.0.1:1421/invoke
                                        │
                              bridge.rs (tiny_http thread)
                                        │  auth: Bearer token
                              same *_impl functions as Tauri commands
                                        │
                              Mutex<Connection> (SQLite, WAL)
                                        │
                     emit "bizi://data-changed" → UI refreshes all views
```

Key properties:

- **One code path.** The bridge calls the exact same business-logic functions as the Tauri commands, so validation, migrations and FK behavior are identical for UI and AI.
- **Loopback only.** The server binds `127.0.0.1`, never `0.0.0.0`. Nothing on the network can reach it.
- **Token auth.** A random bearer token generated on first run, stored in the app-data dir, shown (with copy button) in Settings.
- **No frontend dependency.** The bridge is pure Rust; it works even if the WebView is closed, as long as the app process lives.

### Endpoints

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /health` | none | `{ "ok": true, "version": "0.1.1" }` — liveness probe |
| `GET /schema` | Bearer | Machine-readable catalog of commands, arg shapes, and a `destructive` flag per command |
| `POST /invoke` | Bearer | `{ "cmd": "task_create", "args": { ... } }` → JSON result or error |

`/invoke` mirrors Tauri command names 1:1 (`task_list`, `task_create`, `task_update`, `task_set_complete`, `goal_create`, `search_all`, … — the full set registered in `main.rs`).

Status codes: `200` ok · `400` unknown cmd / bad args · `401` missing or wrong token · `413` body too large (limit 1 MB) · `500` command execution error (body: `{ "error": "..." }`).

---

## 2. Phase 0 — Refactor command layer (no behavior change)

Today every handler is a `#[tauri::command]` taking `tauri::State<AppState>` and locking the connection inline. The bridge cannot call those directly, so first extract plain functions.

1. In `src-tauri/src/commands.rs`, for each of the ~35 commands, move the body into `pub(crate) fn <name>_impl(conn: &Connection, ...) -> CmdResult<T>`.
2. Keep the existing `#[tauri::command]` wrappers thin: lock the mutex (`state.conn.lock()`), call `_impl`, map errors.
3. Verify zero behavior change: `cargo test`, `npm test`, `npm run lint`, `npm run build` all green.
4. Commit separately — this is the only wide-ranging diff in the project.

## 3. Phase 1 — Bridge server

1. **Dependency.** Add `tiny_http = "1"` to `src-tauri/Cargo.toml` (sync, tiny, runs in one dedicated thread — avoids pulling async runtime concerns into SQLite access). Decision recorded: `axum`+`tokio` rejected as unnecessary weight.
2. **New module `src-tauri/src/bridge.rs`:**
   - `pub struct BridgeConfig { pub port: u16, pub token: String, pub enabled: bool }`, loaded from `<app_data_dir>/bridge.json` (defaults: port `1421`, enabled `true`).
   - `pub fn start(state: Arc<AppState>, handle: AppHandle) -> std::thread::JoinHandle<()>` — spawns a thread running `tiny_http::Server::http("127.0.0.1:<port>")`.
   - Request loop: parse path, enforce auth (`Authorization: Bearer <token>`), route to handler, serialize results with `serde_json`.
   - Dispatch: a `match cmd` over the command catalog calling `<name>_impl` with the locked connection. The catalog for `/schema` is a hand-written static JSON — add a **unit test** asserting that every name in the schema has a dispatch arm and vice versa (guards against drift).
3. **Concurrency.** Every request locks the same `Mutex<Connection>`; requests are serialized, which is correct for SQLite. Verify `db.rs` sets `PRAGMA busy_timeout` (add `busy_timeout = 5000` on open if absent) and confirm WAL mode is on.
4. **Token lifecycle.** On first run: `uuid::Uuid::new_v4()` → write `<app_data_dir>/bridge.token`. Regeneration supported later via Settings (Phase 3).
5. **Wiring in `main.rs`.** Wrap `AppState` in `Arc`, `app.manage(...)` the state, clone the `Arc` + `AppHandle`, read `bridge.json`, spawn the bridge thread in `.setup()`. Thread is a daemon — it dies with the process; the single-instance plugin guarantees only one app (and thus one bridge) at a time.
6. **Port conflicts.** If the configured port is taken, try `port+1..port+20`, then log and start bridge-disabled (surfaced in Settings).

## 4. Phase 2 — UI refresh on external writes

The UI currently re-queries after its own mutations; nothing notifies it about external ones.

1. After every successful **mutating** `/invoke`, call `handle.emit("bizi://data-changed", ())`.
2. Frontend: in the state layer, `listen("bizi://data-changed", ...)` → run the same refetch path used after local mutations. (Confirm the exact existing refresh mechanism — README describes a data-version refresh; adapt the listener to whichever implementation is present.)
3. Fallback if events prove awkward: poll a cheap signature (`task_counts()` hash) every 5 s while the app is open. Documented as plan B, not default.
4. Manual test: create a task via `curl /invoke` → task appears in Today without any UI interaction.

## 5. Phase 3 — Settings surface + audit log

1. **Settings → AI Bridge section** (Tauri runtime only; hidden in the `dev:web` browser driver via the existing `isTauriRuntime()` check):
   - status: running / disabled / port-conflict, with actual port
   - token value + Copy button + Regenerate
   - enable/disable toggle, port number
2. **New Tauri commands:** `bridge_status`, `bridge_set_enabled(bool)`, `bridge_set_port(u16)`, `bridge_regen_token` — each rewrites `bridge.json` and starts/stops the thread (`tiny_http`'s `unblock()` for clean shutdown).
3. **Audit log:** one JSON line per `/invoke` (timestamp, cmd, args digest, ok/error) appended to `<app_data_dir>/bridge.log`; Settings shows the last 50 entries via a `bridge_log` command. This is the "what did the AI change" trail.

## 6. Phase 4 — Client side: voice commands via Kimi (usage, not app code)

1. Point any agent at the bridge:
   - Base URL `http://127.0.0.1:<port>`, token from Settings.
   - Agent workflow: `GET /schema` → understand available commands → `POST /invoke` per action.
2. **Reference client** `scripts/bridge_client.py` (stdlib only): `python scripts/bridge_client.py task_create '{"input":{"title":"from bridge"}}'` — doubles as executable documentation and lets agents shell out instead of speaking HTTP.
3. **Voice loop:** user dictates in the Kimi app (voice input) → Kimi translates speech → bridge calls. Bizi itself needs no STT code for this path.
4. **Destructive-action guard:** `/schema` marks `*_delete` as `destructive: true`; instruct agents (and note in README) to ask for confirmation before calling them. Optionally add a `bridge.require_confirm` config later.

## 7. Files touched

| File | Change |
| --- | --- |
| `src-tauri/src/commands.rs` | extract `*_impl` functions (Phase 0) |
| `src-tauri/src/bridge.rs` | **new** — HTTP server, auth, dispatch, audit log |
| `src-tauri/src/main.rs` | wire bridge thread, register new commands |
| `src-tauri/src/db.rs` | `busy_timeout` if missing |
| `src-tauri/Cargo.toml` | add `tiny_http` |
| `src/state/…` | `data-changed` listener → refetch |
| `src/features/Settings.tsx` | AI Bridge section |
| `scripts/bridge_client.py` | **new** — reference CLI client |
| `README.md` | "Local AI bridge" section with curl examples |

## 8. Verification

- Automated: `cargo test`, `npm test`, `npm run lint`, `npm run build`, schema↔dispatch unit test.
- Manual checklist:
  1. App starts; `curl http://127.0.0.1:1421/health` → ok.
  2. `/invoke` without token → 401; with token → task created and visible in UI without refresh.
  3. Unknown cmd → 400; 2 MB body → 413.
  4. 20 concurrent invokes → no `SQLITE_BUSY`, all applied.
  5. Second app launch blocked by single-instance plugin → no duplicate bridge.
  6. Token regenerated → old token rejected.

## 9. Risks and decisions

- **Security:** loopback bind + bearer token is adequate for a localhost personal app. Token is plaintext in the user profile (acceptable; README notes it, Windows profile ACLs protect it). Future: move to Windows Credential Manager via the `keyring` crate.
- **Schema drift:** mitigated by the schema↔dispatch unit test.
- **External SQLite writers:** explicitly out of scope and discouraged — while WAL tolerates concurrent readers, uncontrolled external writes bypass validation. Everything routes through the bridge.
- **Port choice:** 1421 is arbitrary (adjacent to the Vite port 1420, easy to remember); configurable.

## 10. Sequencing and effort

| Step | Depends on | Estimate |
| --- | --- | --- |
| Phase 0 refactor | — | 1–2 h |
| Phase 1 bridge core | Phase 0 | 3–4 h |
| Phase 2 UI refresh | Phase 1 | 1–2 h |
| Phase 3 settings + audit | Phase 1 | 2–3 h |
| Phase 4 client + docs | Phase 1 | ~1 h |

Recommended commit order: Phase 0 alone → Phase 1+2 together → Phase 3 → Phase 4.
