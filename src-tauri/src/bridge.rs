// Local AI bridge: a loopback-only HTTP API exposing the same command layer
// as the Tauri commands, so external agents (Kimi Work, scripts) can drive a
// running Bizi instance. Bound to 127.0.0.1, guarded by a bearer token.

use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

use crate::commands;
use crate::db::{new_id, now_iso, AppState};

const MAX_BODY: u64 = 1024 * 1024;
const PORT_RANGE: u16 = 20;
pub const DATA_CHANGED_EVENT: &str = "bizi://data-changed";

type JsonResponse = Response<Cursor<Vec<u8>>>;

// (name, writes, destructive, args doc)
pub const COMMANDS: &[(&str, bool, bool, &str)] = &[
    ("area_list", false, false, "{ includeArchived?: bool }"),
    ("area_create", true, false, "{ input: { name, description?, icon?, color?, sortOrder? } }"),
    ("area_update", true, false, "{ id, patch }"),
    ("area_delete", true, true, "{ id }"),
    ("goal_list", false, false, "{ includeArchived?: bool }"),
    ("goal_create", true, false, "{ input: { title, description?, lifeAreaId?, status?, priority?, startDate?, targetDate?, progressMode?, manualProgress?, projectIds? } }"),
    ("goal_update", true, false, "{ id, patch }"),
    ("goal_delete", true, true, "{ id }"),
    ("project_list", false, false, "{ filter?: object }"),
    ("project_create", true, false, "{ input: { title, description?, lifeAreaId?, status?, priority?, icon?, color?, startDate?, targetDate?, progressMode?, manualProgress?, goalIds? } }"),
    ("project_update", true, false, "{ id, patch }"),
    ("project_delete", true, true, "{ id }"),
    ("task_list", false, false, "{ filter?: object }"),
    ("task_get", false, false, "{ id }"),
    ("task_counts", false, false, "{}"),
    ("task_create", true, false, "{ input: { title, description?, status?, lifeAreaId?, projectId?, scheduledDate?, dueDate?, deadlineType?, priority?, estimatedMinutes?, actualMinutes?, recurrenceRule?, parentTaskId?, goalIds? } }"),
    ("task_update", true, false, "{ id, patch }"),
    ("task_set_complete", true, false, "{ id, completed }"),
    ("task_delete", true, true, "{ id }"),
    ("habit_list", false, false, "{}"),
    ("habit_create", true, false, "{ input: { name, lifeAreaId?, frequencyType?, frequencyRule?, startDate?, status? } }"),
    ("habit_update", true, false, "{ id, patch }"),
    ("habit_delete", true, true, "{ id }"),
    ("habit_entries", false, false, "{ from, to }"),
    ("habit_toggle", true, false, "{ habitId, date, completed, value? }"),
    ("review_list", false, false, "{ reviewType? }"),
    ("review_get", false, false, "{ reviewType, periodStart }"),
    ("review_save", true, false, "{ reviewType, periodStart, periodEnd, content }"),
    ("review_stats", false, false, "{ from, to }"),
    ("note_get", false, false, "{ entityType, entityId }"),
    ("note_save", true, false, "{ entityType, entityId, content }"),
    ("search_all", false, false, "{ q }"),
];

fn command_writes(cmd: &str) -> bool {
    COMMANDS.iter().any(|(n, w, _, _)| *n == cmd && *w)
}

// ---------------------------------------------------------------- config

#[derive(serde::Serialize, serde::Deserialize, Clone, Copy)]
pub struct BridgeConfig {
    pub enabled: bool,
    pub port: u16,
}

impl Default for BridgeConfig {
    fn default() -> Self {
        BridgeConfig {
            enabled: true,
            port: 1421,
        }
    }
}

pub struct Bridge {
    pub data_dir: PathBuf,
    pub config: Mutex<BridgeConfig>,
    pub token: Mutex<String>,
    server: Mutex<Option<Arc<Server>>>,
    running_port: Mutex<Option<u16>>,
}

impl Bridge {
    pub fn load(data_dir: &Path) -> Result<Bridge, String> {
        let config = read_config(data_dir);
        let token = read_or_create_token(data_dir)?;
        Ok(Bridge {
            data_dir: data_dir.to_path_buf(),
            config: Mutex::new(config),
            token: Mutex::new(token),
            server: Mutex::new(None),
            running_port: Mutex::new(None),
        })
    }
}

fn read_config(data_dir: &Path) -> BridgeConfig {
    fs::read_to_string(data_dir.join("bridge.json"))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save_config(data_dir: &Path, config: &BridgeConfig) -> Result<(), String> {
    let text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(data_dir.join("bridge.json"), text).map_err(|e| e.to_string())
}

fn read_or_create_token(data_dir: &Path) -> Result<String, String> {
    let path = data_dir.join("bridge.token");
    if let Ok(text) = fs::read_to_string(&path) {
        let token = text.trim().to_string();
        if !token.is_empty() {
            return Ok(token);
        }
    }
    let token = new_id();
    fs::write(&path, &token).map_err(|e| e.to_string())?;
    Ok(token)
}

// ---------------------------------------------------------------- lifecycle

pub fn start(app: &AppHandle) -> Result<Option<u16>, String> {
    let bridge = app.state::<Bridge>();
    let (enabled, base_port) = {
        let cfg = bridge.config.lock().map_err(|e| e.to_string())?;
        (cfg.enabled, cfg.port)
    };
    if !enabled {
        return Ok(None);
    }
    if let Some(port) = *bridge.running_port.lock().map_err(|e| e.to_string())? {
        return Ok(Some(port));
    }
    let mut bound = None;
    for port in base_port..base_port.saturating_add(PORT_RANGE) {
        if let Ok(server) = Server::http(("127.0.0.1", port)) {
            bound = Some((server, port));
            break;
        }
    }
    let (server, port) = bound.ok_or_else(|| {
        format!(
            "no free port in range {base_port}..{}",
            base_port + PORT_RANGE - 1
        )
    })?;
    let server = Arc::new(server);
    let token = bridge.token.lock().map_err(|e| e.to_string())?.clone();
    let state = app.state::<Arc<AppState>>().inner().clone();
    let handle = Some(app.clone());
    let log_path = bridge.data_dir.join("bridge.log");
    let thread_server = server.clone();
    std::thread::spawn(move || {
        for mut request in thread_server.incoming_requests() {
            let response = handle_request(&state, &handle, &token, &log_path, &mut request);
            let _ = request.respond(response);
        }
    });
    *bridge.server.lock().map_err(|e| e.to_string())? = Some(server);
    *bridge.running_port.lock().map_err(|e| e.to_string())? = Some(port);
    Ok(Some(port))
}

pub fn stop(app: &AppHandle) -> Result<(), String> {
    let bridge = app.state::<Bridge>();
    let server = bridge.server.lock().map_err(|e| e.to_string())?.take();
    if let Some(server) = server {
        server.unblock();
    }
    *bridge.running_port.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

// ---------------------------------------------------------------- http

fn json_resp(status: u16, body: Value) -> JsonResponse {
    Response::from_string(body.to_string())
        .with_status_code(StatusCode(status))
        .with_header(
            Header::from_bytes(
                &b"Content-Type"[..],
                &b"application/json; charset=utf-8"[..],
            )
            .expect("static header"),
        )
}

fn check_auth(request: &Request, token: &str) -> Result<(), JsonResponse> {
    let expected = format!("Bearer {token}");
    let authorized = request
        .headers()
        .iter()
        .any(|h| h.field.equiv("Authorization") && h.value.as_str() == expected);
    if authorized {
        Ok(())
    } else {
        Err(json_resp(401, json!({ "error": "unauthorized" })))
    }
}

fn schema_json() -> Value {
    json!({
        "name": "bizi-bridge",
        "version": env!("CARGO_PKG_VERSION"),
        "auth": "Authorization: Bearer <token>",
        "invoke": "POST /invoke with body { \"cmd\": string, \"args\": object }",
        "commands": COMMANDS
            .iter()
            .map(|(name, writes, destructive, args)| {
                json!({ "name": name, "write": writes, "destructive": destructive, "args": args })
            })
            .collect::<Vec<_>>(),
    })
}

fn handle_request(
    state: &Arc<AppState>,
    emit: &Option<AppHandle>,
    token: &str,
    log_path: &Path,
    request: &mut Request,
) -> JsonResponse {
    let path = request.url().split('?').next().unwrap_or("/").to_string();
    match request.method() {
        Method::Get if path == "/health" => json_resp(
            200,
            json!({ "ok": true, "name": "bizi-bridge", "version": env!("CARGO_PKG_VERSION") }),
        ),
        Method::Get if path == "/schema" => match check_auth(request, token) {
            Ok(()) => json_resp(200, schema_json()),
            Err(resp) => resp,
        },
        Method::Post if path == "/invoke" => match check_auth(request, token) {
            Ok(()) => handle_invoke(state, emit, log_path, request),
            Err(resp) => resp,
        },
        _ => json_resp(404, json!({ "error": "not found" })),
    }
}

fn handle_invoke(
    state: &Arc<AppState>,
    emit: &Option<AppHandle>,
    log_path: &Path,
    request: &mut Request,
) -> JsonResponse {
    let mut body = String::new();
    if let Err(e) = request
        .as_reader()
        .take(MAX_BODY + 1)
        .read_to_string(&mut body)
    {
        return json_resp(400, json!({ "error": format!("failed to read body: {e}") }));
    }
    if body.len() as u64 > MAX_BODY {
        return json_resp(413, json!({ "error": "body too large" }));
    }
    let parsed: Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => return json_resp(400, json!({ "error": format!("invalid json: {e}") })),
    };
    let cmd = match parsed.get("cmd").and_then(|c| c.as_str()) {
        Some(c) => c.to_string(),
        None => return json_resp(400, json!({ "error": "missing field: cmd" })),
    };
    let args = parsed.get("args").cloned().unwrap_or_else(|| json!({}));
    if !args.is_object() {
        return json_resp(400, json!({ "error": "args must be an object" }));
    }
    let started = std::time::Instant::now();
    let result = dispatch(state, &cmd, &args);
    let elapsed_ms = started.elapsed().as_millis() as u64;
    let writes = command_writes(&cmd);
    append_log(log_path, &cmd, &args, result.is_ok(), elapsed_ms);
    match result {
        Ok(value) => {
            if writes {
                if let Some(handle) = emit {
                    let _ = handle.emit(DATA_CHANGED_EVENT, ());
                }
            }
            json_resp(200, json!({ "ok": true, "result": value }))
        }
        Err(e) if e.starts_with("unknown command") => {
            json_resp(400, json!({ "ok": false, "error": e }))
        }
        Err(e) => json_resp(500, json!({ "ok": false, "error": e })),
    }
}

fn append_log(path: &Path, cmd: &str, args: &Value, ok: bool, elapsed_ms: u64) {
    let line = json!({
        "ts": now_iso(),
        "cmd": cmd,
        "args": truncate_strings(args, 160),
        "ok": ok,
        "ms": elapsed_ms,
    });
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{line}");
    }
}

fn truncate_strings(v: &Value, max: usize) -> Value {
    match v {
        Value::String(s) => Value::String(s.chars().take(max).collect()),
        Value::Array(a) => Value::Array(a.iter().map(|x| truncate_strings(x, max)).collect()),
        Value::Object(o) => Value::Object(
            o.iter()
                .map(|(k, x)| (k.clone(), truncate_strings(x, max)))
                .collect(),
        ),
        other => other.clone(),
    }
}

// ---------------------------------------------------------------- dispatch

fn ok_json<T: serde::Serialize>(r: Result<T, String>) -> Result<Value, String> {
    r.and_then(|v| serde_json::to_value(v).map_err(|e| e.to_string()))
}

fn req_str(args: &Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| format!("missing field: {key}"))
}

fn opt_str(args: &Value, key: &str) -> Option<String> {
    args.get(key).and_then(|v| v.as_str()).map(String::from)
}

fn opt_bool(args: &Value, key: &str) -> Option<bool> {
    args.get(key).and_then(|v| v.as_bool())
}

fn req_bool(args: &Value, key: &str) -> Result<bool, String> {
    args.get(key)
        .and_then(|v| v.as_bool())
        .ok_or_else(|| format!("missing field: {key}"))
}

fn child(args: &Value, key: &str) -> Result<Value, String> {
    args.get(key)
        .cloned()
        .ok_or_else(|| format!("missing field: {key}"))
}

pub(crate) fn dispatch(state: &AppState, cmd: &str, args: &Value) -> Result<Value, String> {
    if !COMMANDS.iter().any(|(n, _, _, _)| *n == cmd) {
        return Err(format!("unknown command: {cmd}"));
    }
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    match cmd {
        "area_list" => ok_json(commands::area_list_impl(
            &conn,
            opt_bool(args, "includeArchived"),
        )),
        "area_create" => ok_json(commands::area_create_impl(&conn, child(args, "input")?)),
        "area_update" => ok_json(commands::area_update_impl(
            &conn,
            req_str(args, "id")?,
            child(args, "patch")?,
        )),
        "area_delete" => ok_json(commands::area_delete_impl(&conn, req_str(args, "id")?)),
        "goal_list" => ok_json(commands::goal_list_impl(
            &conn,
            opt_bool(args, "includeArchived"),
        )),
        "goal_create" => ok_json(commands::goal_create_impl(&conn, child(args, "input")?)),
        "goal_update" => ok_json(commands::goal_update_impl(
            &conn,
            req_str(args, "id")?,
            child(args, "patch")?,
        )),
        "goal_delete" => ok_json(commands::goal_delete_impl(&conn, req_str(args, "id")?)),
        "project_list" => ok_json(commands::project_list_impl(
            &conn,
            args.get("filter").cloned(),
        )),
        "project_create" => ok_json(commands::project_create_impl(&conn, child(args, "input")?)),
        "project_update" => ok_json(commands::project_update_impl(
            &conn,
            req_str(args, "id")?,
            child(args, "patch")?,
        )),
        "project_delete" => ok_json(commands::project_delete_impl(&conn, req_str(args, "id")?)),
        "task_list" => ok_json(commands::task_list_impl(&conn, args.get("filter").cloned())),
        "task_get" => ok_json(commands::task_get_impl(&conn, req_str(args, "id")?)),
        "task_counts" => ok_json(commands::task_counts_impl(&conn)),
        "task_create" => ok_json(commands::task_create_impl(&conn, child(args, "input")?)),
        "task_update" => ok_json(commands::task_update_impl(
            &conn,
            req_str(args, "id")?,
            child(args, "patch")?,
        )),
        "task_set_complete" => ok_json(commands::task_set_complete_impl(
            &conn,
            req_str(args, "id")?,
            req_bool(args, "completed")?,
        )),
        "task_delete" => ok_json(commands::task_delete_impl(&conn, req_str(args, "id")?)),
        "habit_list" => ok_json(commands::habit_list_impl(&conn)),
        "habit_create" => ok_json(commands::habit_create_impl(&conn, child(args, "input")?)),
        "habit_update" => ok_json(commands::habit_update_impl(
            &conn,
            req_str(args, "id")?,
            child(args, "patch")?,
        )),
        "habit_delete" => ok_json(commands::habit_delete_impl(&conn, req_str(args, "id")?)),
        "habit_entries" => ok_json(commands::habit_entries_impl(
            &conn,
            req_str(args, "from")?,
            req_str(args, "to")?,
        )),
        "habit_toggle" => ok_json(commands::habit_toggle_impl(
            &conn,
            req_str(args, "habitId")?,
            req_str(args, "date")?,
            req_bool(args, "completed")?,
            args.get("value").and_then(|v| v.as_f64()),
        )),
        "review_list" => ok_json(commands::review_list_impl(
            &conn,
            opt_str(args, "reviewType"),
        )),
        "review_get" => ok_json(commands::review_get_impl(
            &conn,
            req_str(args, "reviewType")?,
            req_str(args, "periodStart")?,
        )),
        "review_save" => ok_json(commands::review_save_impl(
            &conn,
            req_str(args, "reviewType")?,
            req_str(args, "periodStart")?,
            req_str(args, "periodEnd")?,
            child(args, "content")?,
        )),
        "review_stats" => ok_json(commands::review_stats_impl(
            &conn,
            req_str(args, "from")?,
            req_str(args, "to")?,
        )),
        "note_get" => ok_json(commands::note_get_impl(
            &conn,
            req_str(args, "entityType")?,
            req_str(args, "entityId")?,
        )),
        "note_save" => ok_json(commands::note_save_impl(
            &conn,
            req_str(args, "entityType")?,
            req_str(args, "entityId")?,
            req_str(args, "content")?,
        )),
        "search_all" => ok_json(commands::search_all_impl(&conn, req_str(args, "q")?)),
        other => Err(format!("unknown command: {other}")),
    }
}

// ---------------------------------------------------------------- tauri commands

fn status_json(app: &AppHandle) -> Result<Value, String> {
    let bridge = app.state::<Bridge>();
    let (enabled, port) = {
        let cfg = bridge.config.lock().map_err(|e| e.to_string())?;
        (cfg.enabled, cfg.port)
    };
    let actual = *bridge.running_port.lock().map_err(|e| e.to_string())?;
    Ok(json!({
        "enabled": enabled,
        "port": port,
        "actualPort": actual,
        "running": actual.is_some(),
    }))
}

#[tauri::command]
pub fn bridge_status(app: AppHandle) -> Result<Value, String> {
    status_json(&app)
}

#[tauri::command]
pub fn bridge_set_enabled(app: AppHandle, enabled: bool) -> Result<Value, String> {
    let bridge = app.state::<Bridge>();
    {
        let mut cfg = bridge.config.lock().map_err(|e| e.to_string())?;
        cfg.enabled = enabled;
        save_config(&bridge.data_dir, &cfg)?;
    }
    if enabled {
        start(&app)?;
    } else {
        stop(&app)?;
    }
    status_json(&app)
}

#[tauri::command]
pub fn bridge_set_port(app: AppHandle, port: u16) -> Result<Value, String> {
    let bridge = app.state::<Bridge>();
    let was_running = bridge
        .running_port
        .lock()
        .map_err(|e| e.to_string())?
        .is_some();
    {
        let mut cfg = bridge.config.lock().map_err(|e| e.to_string())?;
        cfg.port = port;
        save_config(&bridge.data_dir, &cfg)?;
    }
    if was_running {
        stop(&app)?;
        start(&app)?;
    }
    status_json(&app)
}

#[tauri::command]
pub fn bridge_regen_token(app: AppHandle) -> Result<String, String> {
    let bridge = app.state::<Bridge>();
    let token = new_id();
    fs::write(bridge.data_dir.join("bridge.token"), &token).map_err(|e| e.to_string())?;
    *bridge.token.lock().map_err(|e| e.to_string())? = token.clone();
    Ok(token)
}

#[tauri::command]
pub fn bridge_log(app: AppHandle) -> Result<Vec<String>, String> {
    let bridge = app.state::<Bridge>();
    let text = match fs::read_to_string(bridge.data_dir.join("bridge.log")) {
        Ok(t) => t,
        Err(_) => return Ok(vec![]),
    };
    Ok(text.lines().rev().take(50).map(|l| l.to_string()).collect())
}

#[tauri::command]
pub fn bridge_get_token(app: AppHandle) -> Result<String, String> {
    let bridge = app.state::<Bridge>();
    let token = bridge.token.lock().map_err(|e| e.to_string())?.clone();
    Ok(token)
}

// ---------------------------------------------------------------- tests

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn dummy_state() -> AppState {
        AppState {
            conn: Mutex::new(Connection::open_in_memory().unwrap()),
        }
    }

    #[test]
    fn schema_commands_all_dispatchable() {
        let state = dummy_state();
        for (name, _, _, _) in COMMANDS {
            let err = dispatch(&state, name, &json!({})).unwrap_err();
            assert!(
                !err.starts_with("unknown command"),
                "{name} fell through dispatch: {err}"
            );
        }
    }

    #[test]
    fn unknown_command_rejected() {
        let state = dummy_state();
        let err = dispatch(&state, "drop_everything", &json!({})).unwrap_err();
        assert!(err.starts_with("unknown command"));
    }

    #[test]
    fn schema_names_unique() {
        let mut names: Vec<&str> = COMMANDS.iter().map(|c| c.0).collect();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), COMMANDS.len());
    }

    #[test]
    fn log_truncation_shortens_long_strings() {
        let long = json!({ "title": "x".repeat(500), "nested": [{ "s": "y".repeat(300) }] });
        let cut = truncate_strings(&long, 160);
        assert_eq!(cut["title"].as_str().unwrap().chars().count(), 160);
        assert_eq!(cut["nested"][0]["s"].as_str().unwrap().chars().count(), 160);
    }

    fn seeded_state() -> AppState {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrate(&conn).unwrap();
        AppState {
            conn: Mutex::new(conn),
        }
    }

    /// Raw HTTP/1.1 helper: returns (status code, body).
    fn raw_request(
        port: u16,
        method: &str,
        path: &str,
        token: Option<&str>,
        body: &str,
    ) -> (u16, String) {
        use std::io::Write as _;
        use std::net::TcpStream;
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        let auth = token
            .map(|t| format!("Authorization: Bearer {t}\r\n"))
            .unwrap_or_default();
        let request = format!(
            "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {len}\r\n{auth}Connection: close\r\n\r\n{body}",
            len = body.len()
        );
        stream.write_all(request.as_bytes()).unwrap();
        let mut raw = String::new();
        stream.read_to_string(&mut raw).unwrap();
        let status: u16 = raw
            .split_whitespace()
            .nth(1)
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let body_out = raw.split("\r\n\r\n").nth(1).unwrap_or("").to_string();
        (status, body_out)
    }

    #[test]
    fn http_end_to_end() {
        let state = Arc::new(seeded_state());
        let server = Arc::new(Server::http(("127.0.0.1", 0)).unwrap());
        let port = server.server_addr().to_ip().unwrap().port();
        let token = "test-token".to_string();
        let log_path = std::env::temp_dir().join("bizi-test-bridge.log");
        let _ = std::fs::remove_file(&log_path);
        let thread_server = server.clone();
        let thread_state = state.clone();
        let thread_log = log_path.clone();
        std::thread::spawn(move || {
            let emit: Option<AppHandle> = None;
            for mut request in thread_server.incoming_requests() {
                let response =
                    handle_request(&thread_state, &emit, &token, &thread_log, &mut request);
                let _ = request.respond(response);
            }
        });

        // /health is open.
        let (status, body) = raw_request(port, "GET", "/health", None, "");
        assert_eq!(status, 200);
        assert!(body.contains("\"ok\":true"));

        // /invoke without a token is rejected.
        let (status, _) = raw_request(port, "POST", "/invoke", None, "{\"cmd\":\"task_counts\"}");
        assert_eq!(status, 401);

        // A write succeeds with the token and is persisted.
        let (status, body) = raw_request(
            port,
            "POST",
            "/invoke",
            Some("test-token"),
            "{\"cmd\":\"task_create\",\"args\":{\"input\":{\"title\":\"from bridge test\"}}}",
        );
        assert_eq!(status, 200, "body: {body}");
        let parsed: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(parsed["ok"], true);
        assert_eq!(parsed["result"]["title"], "from bridge test");
        let task_id = parsed["result"]["id"].as_str().unwrap().to_string();

        // The read model sees it.
        let (status, body) = raw_request(
            port,
            "POST",
            "/invoke",
            Some("test-token"),
            "{\"cmd\":\"task_list\",\"args\":{\"filter\":{\"q\":\"from bridge\"}}}",
        );
        assert_eq!(status, 200);
        assert!(body.contains(&task_id));

        // Unknown command -> 400, wrong path -> 404.
        let (status, _) = raw_request(
            port,
            "POST",
            "/invoke",
            Some("test-token"),
            "{\"cmd\":\"nope\"}",
        );
        assert_eq!(status, 400);
        let (status, _) = raw_request(port, "GET", "/nope", Some("test-token"), "");
        assert_eq!(status, 404);

        // The audit log recorded the calls.
        let log = std::fs::read_to_string(&log_path).unwrap();
        assert!(log.contains("task_create"));
        assert!(log.contains("from bridge test"));

        server.unblock();
    }
}
