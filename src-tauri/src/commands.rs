use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::db::{new_id, now_iso, today, AppState};
use crate::models::*;

type CmdResult<T> = Result<T, String>;

fn err(e: rusqlite::Error) -> String {
    e.to_string()
}

fn lock<'a>(
    state: &'a tauri::State<'a, AppState>,
) -> CmdResult<std::sync::MutexGuard<'a, Connection>> {
    state.conn.lock().map_err(|e| e.to_string())
}

fn opt_string(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(|x| x.as_str()).map(|s| s.to_string())
}

fn opt_i64(v: &Value, key: &str) -> Option<i64> {
    v.get(key).and_then(|x| x.as_i64())
}

fn required_string(v: &Value, key: &str) -> CmdResult<String> {
    opt_string(v, key).ok_or_else(|| format!("missing field: {}", key))
}

fn split_ids(raw: Option<String>) -> Vec<String> {
    raw.unwrap_or_default()
        .split(',')
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

fn value_to_sql(v: &Value) -> Box<dyn rusqlite::ToSql> {
    match v {
        Value::Null => Box::new(Option::<String>::None),
        Value::String(s) => Box::new(s.clone()),
        Value::Number(n) => Box::new(n.as_i64().unwrap_or(0)),
        Value::Bool(b) => Box::new(if *b { 1i64 } else { 0i64 }),
        other => Box::new(other.to_string()),
    }
}

fn apply_patch(
    conn: &Connection,
    table: &str,
    id: &str,
    patch: &Value,
    allowed: &[(&str, &str)],
) -> CmdResult<()> {
    let obj = patch.as_object().ok_or("invalid patch object")?;
    let mut sets: Vec<String> = Vec::new();
    let mut vals: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    for (key, col) in allowed {
        if let Some(v) = obj.get(*key) {
            sets.push(format!("{} = ?", col));
            vals.push(value_to_sql(v));
        }
    }
    if sets.is_empty() {
        return Ok(());
    }
    sets.push("updated_at = ?".to_string());
    vals.push(Box::new(now_iso()));
    let sql = format!("UPDATE {} SET {} WHERE id = ?", table, sets.join(", "));
    vals.push(Box::new(id.to_string()));
    conn.execute(&sql, params_from_iter(vals)).map_err(err)?;
    Ok(())
}

// ---------------------------------------------------------------- areas

#[tauri::command]
pub fn area_list(
    state: tauri::State<AppState>,
    include_archived: Option<bool>,
) -> CmdResult<Vec<AreaRow>> {
    let conn = lock(&state)?;
    let mut sql = String::from(
        "SELECT id, name, description, icon, color, sort_order, created_at, updated_at, archived FROM life_areas",
    );
    if !include_archived.unwrap_or(false) {
        sql.push_str(" WHERE archived = 0");
    }
    sql.push_str(" ORDER BY sort_order, name COLLATE NOCASE");
    let mut stmt = conn.prepare(&sql).map_err(err)?;
    let mapped = stmt
        .query_map([], |r| {
            Ok(AreaRow {
                id: r.get(0)?,
                name: r.get(1)?,
                description: r.get(2)?,
                icon: r.get(3)?,
                color: r.get(4)?,
                sort_order: r.get(5)?,
                created_at: r.get(6)?,
                updated_at: r.get(7)?,
                archived: r.get::<_, i64>(8)? != 0,
            })
        })
        .map_err(err)?;
    let rows = mapped.collect::<Result<Vec<_>, _>>().map_err(err)?;
    Ok(rows)
}

#[tauri::command]
pub fn area_create(state: tauri::State<AppState>, input: Value) -> CmdResult<AreaRow> {
    let conn = lock(&state)?;
    let id = new_id();
    let name = required_string(&input, "name")?;
    let now = now_iso();
    let max_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM life_areas",
            [],
            |r| r.get(0),
        )
        .map_err(err)?;
    conn.execute(
        "INSERT INTO life_areas (id, name, description, icon, color, sort_order, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?7)",
        params![
            id,
            name,
            opt_string(&input, "description").unwrap_or_default(),
            opt_string(&input, "icon").unwrap_or_default(),
            opt_string(&input, "color").unwrap_or_default(),
            opt_i64(&input, "sortOrder").unwrap_or(max_order + 1),
            now
        ],
    )
    .map_err(err)?;
    Ok(AreaRow {
        id,
        name,
        description: opt_string(&input, "description").unwrap_or_default(),
        icon: opt_string(&input, "icon").unwrap_or_default(),
        color: opt_string(&input, "color").unwrap_or_default(),
        sort_order: opt_i64(&input, "sortOrder").unwrap_or(max_order + 1),
        created_at: now.clone(),
        updated_at: now,
        archived: false,
    })
}

#[tauri::command]
pub fn area_update(state: tauri::State<AppState>, id: String, patch: Value) -> CmdResult<()> {
    let conn = lock(&state)?;
    apply_patch(
        &conn,
        "life_areas",
        &id,
        &patch,
        &[
            ("name", "name"),
            ("description", "description"),
            ("icon", "icon"),
            ("color", "color"),
            ("sortOrder", "sort_order"),
            ("archived", "archived"),
        ],
    )
}

#[tauri::command]
pub fn area_delete(state: tauri::State<AppState>, id: String) -> CmdResult<()> {
    let conn = lock(&state)?;
    conn.execute("DELETE FROM life_areas WHERE id = ?1", params![id])
        .map_err(err)?;
    Ok(())
}

// ---------------------------------------------------------------- goals

fn map_goal_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<GoalRow> {
    Ok(GoalRow {
        id: r.get(0)?,
        title: r.get(1)?,
        description: r.get(2)?,
        life_area_id: r.get(3)?,
        status: r.get(4)?,
        priority: r.get(5)?,
        start_date: r.get(6)?,
        target_date: r.get(7)?,
        progress_mode: r.get(8)?,
        manual_progress: r.get(9)?,
        created_at: r.get(10)?,
        updated_at: r.get(11)?,
        completed_at: r.get(12)?,
        archived: r.get::<_, i64>(13)? != 0,
        area_name: r.get(14)?,
        project_ids: split_ids(r.get::<_, Option<String>>(15)?),
    })
}

const GOAL_SELECT: &str = "SELECT g.id, g.title, g.description, g.life_area_id, g.status, g.priority, g.start_date, g.target_date, g.progress_mode, g.manual_progress, g.created_at, g.updated_at, g.completed_at, g.archived, la.name, (SELECT GROUP_CONCAT(project_id) FROM goal_projects gp WHERE gp.goal_id = g.id) FROM goals g LEFT JOIN life_areas la ON la.id = g.life_area_id";

#[tauri::command]
pub fn goal_list(
    state: tauri::State<AppState>,
    include_archived: Option<bool>,
) -> CmdResult<Vec<GoalRow>> {
    let conn = lock(&state)?;
    let mut sql = String::from(GOAL_SELECT);
    if !include_archived.unwrap_or(false) {
        sql.push_str(" WHERE g.archived = 0");
    }
    sql.push_str(
        " ORDER BY g.status = 'completed', g.target_date IS NULL, g.target_date, g.created_at DESC",
    );
    let mut stmt = conn.prepare(&sql).map_err(err)?;
    let rows = stmt
        .query_map([], map_goal_row)
        .map_err(err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(err)?;
    Ok(rows)
}

#[tauri::command]
pub fn goal_create(state: tauri::State<AppState>, input: Value) -> CmdResult<GoalRow> {
    let conn = lock(&state)?;
    let id = new_id();
    let now = now_iso();
    conn.execute(
        "INSERT INTO goals (id, title, description, life_area_id, status, priority, start_date, target_date, progress_mode, manual_progress, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11)",
        params![
            id,
            required_string(&input, "title")?,
            opt_string(&input, "description").unwrap_or_default(),
            opt_string(&input, "lifeAreaId"),
            opt_string(&input, "status").unwrap_or_else(|| "planned".to_string()),
            opt_string(&input, "priority").unwrap_or_else(|| "p3".to_string()),
            opt_string(&input, "startDate"),
            opt_string(&input, "targetDate"),
            opt_string(&input, "progressMode").unwrap_or_else(|| "manual".to_string()),
            opt_i64(&input, "manualProgress").unwrap_or(0),
            now
        ],
    )
    .map_err(err)?;
    if let Some(ids) = input.get("projectIds").and_then(|v| v.as_array()) {
        for pid in ids {
            if let Some(pid) = pid.as_str() {
                conn.execute(
                    "INSERT OR IGNORE INTO goal_projects (goal_id, project_id) VALUES (?1,?2)",
                    params![id, pid],
                )
                .map_err(err)?;
            }
        }
    }
    get_goal(&conn, &id)
}

fn get_goal(conn: &Connection, id: &str) -> CmdResult<GoalRow> {
    let mut stmt = conn
        .prepare(&format!("{} WHERE g.id = ?1", GOAL_SELECT))
        .map_err(err)?;
    stmt.query_row(params![id], map_goal_row).map_err(err)
}

#[tauri::command]
pub fn goal_update(state: tauri::State<AppState>, id: String, patch: Value) -> CmdResult<()> {
    let conn = lock(&state)?;
    apply_patch(
        &conn,
        "goals",
        &id,
        &patch,
        &[
            ("title", "title"),
            ("description", "description"),
            ("lifeAreaId", "life_area_id"),
            ("status", "status"),
            ("priority", "priority"),
            ("startDate", "start_date"),
            ("targetDate", "target_date"),
            ("progressMode", "progress_mode"),
            ("manualProgress", "manual_progress"),
            ("archived", "archived"),
        ],
    )?;
    if let Some(status) = patch.get("status").and_then(|v| v.as_str()) {
        let completed_at = if status == "completed" {
            Some(now_iso())
        } else {
            None
        };
        conn.execute(
            "UPDATE goals SET completed_at = ?1 WHERE id = ?2",
            params![completed_at, id],
        )
        .map_err(err)?;
    }
    if let Some(ids) = patch.get("projectIds").and_then(|v| v.as_array()) {
        conn.execute("DELETE FROM goal_projects WHERE goal_id = ?1", params![id])
            .map_err(err)?;
        for pid in ids {
            if let Some(pid) = pid.as_str() {
                conn.execute(
                    "INSERT OR IGNORE INTO goal_projects (goal_id, project_id) VALUES (?1,?2)",
                    params![id, pid],
                )
                .map_err(err)?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn goal_delete(state: tauri::State<AppState>, id: String) -> CmdResult<()> {
    let conn = lock(&state)?;
    conn.execute("DELETE FROM goals WHERE id = ?1", params![id])
        .map_err(err)?;
    Ok(())
}

// ---------------------------------------------------------------- projects

fn map_project_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectRow> {
    Ok(ProjectRow {
        id: r.get(0)?,
        title: r.get(1)?,
        description: r.get(2)?,
        life_area_id: r.get(3)?,
        status: r.get(4)?,
        priority: r.get(5)?,
        start_date: r.get(6)?,
        target_date: r.get(7)?,
        progress_mode: r.get(8)?,
        manual_progress: r.get(9)?,
        created_at: r.get(10)?,
        updated_at: r.get(11)?,
        completed_at: r.get(12)?,
        archived: r.get::<_, i64>(13)? != 0,
        area_name: r.get(14)?,
        goal_ids: split_ids(r.get::<_, Option<String>>(15)?),
        open_tasks: r.get(16)?,
        total_tasks: r.get(17)?,
    })
}

const PROJECT_SELECT: &str = "SELECT p.id, p.title, p.description, p.life_area_id, p.status, p.priority, p.start_date, p.target_date, p.progress_mode, p.manual_progress, p.created_at, p.updated_at, p.completed_at, p.archived, la.name, (SELECT GROUP_CONCAT(goal_id) FROM goal_projects gp WHERE gp.project_id = p.id), (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status NOT IN ('completed','cancelled') AND t.archived = 0), (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.archived = 0) FROM projects p LEFT JOIN life_areas la ON la.id = p.life_area_id";

#[tauri::command]
pub fn project_list(
    state: tauri::State<AppState>,
    filter: Option<Value>,
) -> CmdResult<Vec<ProjectRow>> {
    let conn = lock(&state)?;
    let mut sql = String::from(PROJECT_SELECT);
    let mut where_clauses: Vec<String> = Vec::new();
    let mut vals: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let filter = filter.unwrap_or(json!({}));
    if !filter
        .get("includeArchived")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        where_clauses.push("p.archived = 0".to_string());
    }
    if let Some(area) = opt_string(&filter, "areaId") {
        where_clauses.push("p.life_area_id = ?".to_string());
        vals.push(Box::new(area));
    }
    if let Some(statuses) = filter.get("statuses").and_then(|v| v.as_array()) {
        let list: Vec<String> = statuses
            .iter()
            .filter_map(|s| s.as_str().map(String::from))
            .collect();
        if !list.is_empty() {
            where_clauses.push(format!(
                "p.status IN ({})",
                list.iter().map(|_| "?").collect::<Vec<_>>().join(",")
            ));
            for s in list {
                vals.push(Box::new(s));
            }
        }
    }
    if let Some(goal) = opt_string(&filter, "goalId") {
        where_clauses
            .push("p.id IN (SELECT project_id FROM goal_projects WHERE goal_id = ?)".to_string());
        vals.push(Box::new(goal));
    }
    if let Some(q) = opt_string(&filter, "q") {
        where_clauses.push("(p.title LIKE ? OR p.description LIKE ?)".to_string());
        let like = format!("%{}%", like_escape(&q));
        vals.push(Box::new(like.clone()));
        vals.push(Box::new(like));
    }
    if !where_clauses.is_empty() {
        sql.push_str(&format!(" WHERE {}", where_clauses.join(" AND ")));
    }
    sql.push_str(
        " ORDER BY p.status = 'completed', p.target_date IS NULL, p.target_date, p.created_at DESC",
    );
    let mut stmt = conn.prepare(&sql).map_err(err)?;
    let rows = stmt
        .query_map(params_from_iter(vals), map_project_row)
        .map_err(err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(err)?;
    Ok(rows)
}

fn like_escape(q: &str) -> String {
    q.replace('%', "\\%").replace('_', "\\_")
}

#[tauri::command]
pub fn project_create(state: tauri::State<AppState>, input: Value) -> CmdResult<ProjectRow> {
    let conn = lock(&state)?;
    let id = new_id();
    let now = now_iso();
    conn.execute(
        "INSERT INTO projects (id, title, description, life_area_id, status, priority, start_date, target_date, progress_mode, manual_progress, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11)",
        params![
            id,
            required_string(&input, "title")?,
            opt_string(&input, "description").unwrap_or_default(),
            opt_string(&input, "lifeAreaId"),
            opt_string(&input, "status").unwrap_or_else(|| "planned".to_string()),
            opt_string(&input, "priority").unwrap_or_else(|| "p3".to_string()),
            opt_string(&input, "startDate"),
            opt_string(&input, "targetDate"),
            opt_string(&input, "progressMode").unwrap_or_else(|| "auto".to_string()),
            opt_i64(&input, "manualProgress").unwrap_or(0),
            now
        ],
    )
    .map_err(err)?;
    if let Some(ids) = input.get("goalIds").and_then(|v| v.as_array()) {
        for gid in ids {
            if let Some(gid) = gid.as_str() {
                conn.execute(
                    "INSERT OR IGNORE INTO goal_projects (goal_id, project_id) VALUES (?1,?2)",
                    params![gid, id],
                )
                .map_err(err)?;
            }
        }
    }
    get_project(&conn, &id)
}

fn get_project(conn: &Connection, id: &str) -> CmdResult<ProjectRow> {
    let mut stmt = conn
        .prepare(&format!("{} WHERE p.id = ?1", PROJECT_SELECT))
        .map_err(err)?;
    stmt.query_row(params![id], map_project_row).map_err(err)
}

#[tauri::command]
pub fn project_update(state: tauri::State<AppState>, id: String, patch: Value) -> CmdResult<()> {
    let conn = lock(&state)?;
    apply_patch(
        &conn,
        "projects",
        &id,
        &patch,
        &[
            ("title", "title"),
            ("description", "description"),
            ("lifeAreaId", "life_area_id"),
            ("status", "status"),
            ("priority", "priority"),
            ("startDate", "start_date"),
            ("targetDate", "target_date"),
            ("progressMode", "progress_mode"),
            ("manualProgress", "manual_progress"),
            ("archived", "archived"),
        ],
    )?;
    if let Some(status) = patch.get("status").and_then(|v| v.as_str()) {
        let completed_at = if status == "completed" {
            Some(now_iso())
        } else {
            None
        };
        conn.execute(
            "UPDATE projects SET completed_at = ?1 WHERE id = ?2",
            params![completed_at, id],
        )
        .map_err(err)?;
    }
    if let Some(ids) = patch.get("goalIds").and_then(|v| v.as_array()) {
        conn.execute(
            "DELETE FROM goal_projects WHERE project_id = ?1",
            params![id],
        )
        .map_err(err)?;
        for gid in ids {
            if let Some(gid) = gid.as_str() {
                conn.execute(
                    "INSERT OR IGNORE INTO goal_projects (goal_id, project_id) VALUES (?1,?2)",
                    params![gid, id],
                )
                .map_err(err)?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn project_delete(state: tauri::State<AppState>, id: String) -> CmdResult<()> {
    let conn = lock(&state)?;
    conn.execute("DELETE FROM projects WHERE id = ?1", params![id])
        .map_err(err)?;
    Ok(())
}

// ---------------------------------------------------------------- tasks

fn map_task_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<TaskRow> {
    Ok(TaskRow {
        id: r.get(0)?,
        title: r.get(1)?,
        description: r.get(2)?,
        status: r.get(3)?,
        life_area_id: r.get(4)?,
        project_id: r.get(5)?,
        scheduled_date: r.get(6)?,
        due_date: r.get(7)?,
        deadline_type: r.get(8)?,
        priority: r.get(9)?,
        estimated_minutes: r.get(10)?,
        actual_minutes: r.get(11)?,
        recurrence_rule: r.get(12)?,
        parent_task_id: r.get(13)?,
        created_at: r.get(14)?,
        updated_at: r.get(15)?,
        completed_at: r.get(16)?,
        archived: r.get::<_, i64>(17)? != 0,
        area_name: r.get(18)?,
        project_name: r.get(19)?,
        goal_ids: split_ids(r.get::<_, Option<String>>(20)?),
    })
}

const TASK_SELECT: &str = "SELECT t.id, t.title, t.description, t.status, t.life_area_id, t.project_id, t.scheduled_date, t.due_date, t.deadline_type, t.priority, t.estimated_minutes, t.actual_minutes, t.recurrence_rule, t.parent_task_id, t.created_at, t.updated_at, t.completed_at, t.archived, la.name, p.title, (SELECT GROUP_CONCAT(goal_id) FROM task_goals tg WHERE tg.task_id = t.id) FROM tasks t LEFT JOIN life_areas la ON la.id = t.life_area_id LEFT JOIN projects p ON p.id = t.project_id";

#[tauri::command]
pub fn task_list(state: tauri::State<AppState>, filter: Option<Value>) -> CmdResult<Vec<TaskRow>> {
    let conn = lock(&state)?;
    let filter = filter.unwrap_or(json!({}));
    let mut where_clauses: Vec<String> = Vec::new();
    let mut vals: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(statuses) = filter.get("statuses").and_then(|v| v.as_array()) {
        let list: Vec<String> = statuses
            .iter()
            .filter_map(|s| s.as_str().map(String::from))
            .collect();
        if !list.is_empty() {
            where_clauses.push(format!(
                "t.status IN ({})",
                list.iter().map(|_| "?").collect::<Vec<_>>().join(",")
            ));
            for s in list {
                vals.push(Box::new(s));
            }
        }
    }
    if filter
        .get("excludeStatuses")
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(true)
    {
        where_clauses.push("t.status NOT IN ('completed','cancelled')".to_string());
    } else if let Some(list) = filter.get("excludeStatuses").and_then(|v| v.as_array()) {
        let list: Vec<String> = list
            .iter()
            .filter_map(|s| s.as_str().map(String::from))
            .collect();
        if !list.is_empty() {
            where_clauses.push(format!(
                "t.status NOT IN ({})",
                list.iter().map(|_| "?").collect::<Vec<_>>().join(",")
            ));
            for s in list {
                vals.push(Box::new(s));
            }
        }
    }
    if let Some(area) = opt_string(&filter, "areaId") {
        where_clauses.push("t.life_area_id = ?".to_string());
        vals.push(Box::new(area));
    }
    if let Some(project) = opt_string(&filter, "projectId") {
        where_clauses.push("t.project_id = ?".to_string());
        vals.push(Box::new(project));
    }
    if let Some(goal) = opt_string(&filter, "goalId") {
        where_clauses
            .push("t.id IN (SELECT task_id FROM task_goals WHERE goal_id = ?)".to_string());
        vals.push(Box::new(goal));
    }
    if let Some(priority) = opt_string(&filter, "priority") {
        where_clauses.push("t.priority = ?".to_string());
        vals.push(Box::new(priority));
    }
    if let Some(dt) = opt_string(&filter, "deadlineType") {
        where_clauses.push("t.deadline_type = ?".to_string());
        vals.push(Box::new(dt));
    }
    if let Some(from) = opt_string(&filter, "scheduledFrom") {
        where_clauses.push("t.scheduled_date >= ?".to_string());
        vals.push(Box::new(from));
    }
    if let Some(to) = opt_string(&filter, "scheduledTo") {
        where_clauses.push("t.scheduled_date <= ?".to_string());
        vals.push(Box::new(to));
    }
    if let Some(from) = opt_string(&filter, "dueFrom") {
        where_clauses.push("t.due_date >= ?".to_string());
        vals.push(Box::new(from));
    }
    if let Some(to) = opt_string(&filter, "dueTo") {
        where_clauses.push("t.due_date <= ?".to_string());
        vals.push(Box::new(to));
    }
    match filter.get("parentId").and_then(|v| v.as_str()) {
        Some("none") => where_clauses.push("t.parent_task_id IS NULL".to_string()),
        Some(pid) => {
            where_clauses.push("t.parent_task_id = ?".to_string());
            vals.push(Box::new(pid.to_string()));
        }
        None => {}
    }
    if !filter
        .get("includeArchived")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        where_clauses.push("t.archived = 0".to_string());
    }
    if let Some(q) = opt_string(&filter, "q") {
        where_clauses
            .push("(t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\')".to_string());
        let like = format!("%{}%", like_escape(&q));
        vals.push(Box::new(like.clone()));
        vals.push(Box::new(like));
    }

    let mut sql = String::from(TASK_SELECT);
    if !where_clauses.is_empty() {
        sql.push_str(&format!(" WHERE {}", where_clauses.join(" AND ")));
    }
    sql.push_str(
        " ORDER BY (t.status = 'completed' OR t.status = 'cancelled'), t.scheduled_date IS NULL, t.scheduled_date, CASE t.priority WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 WHEN 'p3' THEN 3 ELSE 4 END, t.created_at DESC",
    );
    let limit = opt_i64(&filter, "limit").unwrap_or(500);
    sql.push_str(" LIMIT ?");
    vals.push(Box::new(limit));
    let mut stmt = conn.prepare(&sql).map_err(err)?;
    let rows = stmt
        .query_map(params_from_iter(vals), map_task_row)
        .map_err(err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(err)?;
    Ok(rows)
}

#[tauri::command]
pub fn task_counts(state: tauri::State<AppState>) -> CmdResult<Value> {
    let conn = lock(&state)?;
    let today = today();
    let active = "status NOT IN ('completed','cancelled') AND archived = 0";
    let today_count: i64 = conn
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM tasks WHERE {} AND (scheduled_date = ? OR due_date = ?)",
                active
            ),
            params![today, today],
            |r| r.get(0),
        )
        .map_err(err)?;
    let overdue: i64 = conn
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM tasks WHERE {} AND due_date < ?",
                active
            ),
            params![today],
            |r| r.get(0),
        )
        .map_err(err)?;
    let inbox: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE status = 'inbox' AND archived = 0",
            [],
            |r| r.get(0),
        )
        .map_err(err)?;
    let waiting: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM tasks WHERE status = 'waiting' AND archived = 0"),
            [],
            |r| r.get(0),
        )
        .map_err(err)?;
    Ok(json!({ "today": today_count, "overdue": overdue, "inbox": inbox, "waiting": waiting }))
}

#[tauri::command]
pub fn task_create(state: tauri::State<AppState>, input: Value) -> CmdResult<TaskRow> {
    let conn = lock(&state)?;
    let id = new_id();
    let now = now_iso();
    conn.execute(
        "INSERT INTO tasks (id, title, description, status, life_area_id, project_id, scheduled_date, due_date, deadline_type, priority, estimated_minutes, actual_minutes, recurrence_rule, parent_task_id, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?15)",
        params![
            id,
            required_string(&input, "title")?,
            opt_string(&input, "description").unwrap_or_default(),
            opt_string(&input, "status").unwrap_or_else(|| "todo".to_string()),
            opt_string(&input, "lifeAreaId"),
            opt_string(&input, "projectId"),
            opt_string(&input, "scheduledDate"),
            opt_string(&input, "dueDate"),
            opt_string(&input, "deadlineType").unwrap_or_else(|| "none".to_string()),
            opt_string(&input, "priority").unwrap_or_else(|| "p3".to_string()),
            opt_i64(&input, "estimatedMinutes"),
            opt_i64(&input, "actualMinutes"),
            opt_string(&input, "recurrenceRule"),
            opt_string(&input, "parentTaskId"),
            now
        ],
    )
    .map_err(err)?;
    if let Some(ids) = input.get("goalIds").and_then(|v| v.as_array()) {
        for gid in ids {
            if let Some(gid) = gid.as_str() {
                conn.execute(
                    "INSERT OR IGNORE INTO task_goals (task_id, goal_id) VALUES (?1,?2)",
                    params![id, gid],
                )
                .map_err(err)?;
            }
        }
    }
    get_task(&conn, &id)
}

fn get_task(conn: &Connection, id: &str) -> CmdResult<TaskRow> {
    let mut stmt = conn
        .prepare(&format!("{} WHERE t.id = ?1", TASK_SELECT))
        .map_err(err)?;
    stmt.query_row(params![id], map_task_row).map_err(err)
}

#[tauri::command]
pub fn task_get(state: tauri::State<AppState>, id: String) -> CmdResult<Option<TaskRow>> {
    let conn = lock(&state)?;
    let mut stmt = conn
        .prepare(&format!("{} WHERE t.id = ?1", TASK_SELECT))
        .map_err(err)?;
    let row = stmt
        .query_row(params![id], map_task_row)
        .optional()
        .map_err(err)?;
    Ok(row)
}

#[tauri::command]
pub fn task_update(state: tauri::State<AppState>, id: String, patch: Value) -> CmdResult<()> {
    let conn = lock(&state)?;
    apply_patch(
        &conn,
        "tasks",
        &id,
        &patch,
        &[
            ("title", "title"),
            ("description", "description"),
            ("status", "status"),
            ("lifeAreaId", "life_area_id"),
            ("projectId", "project_id"),
            ("scheduledDate", "scheduled_date"),
            ("dueDate", "due_date"),
            ("deadlineType", "deadline_type"),
            ("priority", "priority"),
            ("estimatedMinutes", "estimated_minutes"),
            ("actualMinutes", "actual_minutes"),
            ("recurrenceRule", "recurrence_rule"),
            ("parentTaskId", "parent_task_id"),
            ("archived", "archived"),
        ],
    )?;
    if let Some(status) = patch.get("status").and_then(|v| v.as_str()) {
        let completed_at = if status == "completed" {
            Some(now_iso())
        } else {
            None
        };
        conn.execute(
            "UPDATE tasks SET completed_at = ?1 WHERE id = ?2",
            params![completed_at, id],
        )
        .map_err(err)?;
    }
    if let Some(ids) = patch.get("goalIds").and_then(|v| v.as_array()) {
        conn.execute("DELETE FROM task_goals WHERE task_id = ?1", params![id])
            .map_err(err)?;
        for gid in ids {
            if let Some(gid) = gid.as_str() {
                conn.execute(
                    "INSERT OR IGNORE INTO task_goals (task_id, goal_id) VALUES (?1,?2)",
                    params![id, gid],
                )
                .map_err(err)?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn task_set_complete(
    state: tauri::State<AppState>,
    id: String,
    completed: bool,
) -> CmdResult<()> {
    let conn = lock(&state)?;
    let status = if completed { "completed" } else { "todo" };
    let completed_at = if completed { Some(now_iso()) } else { None };
    conn.execute(
        "UPDATE tasks SET status = ?1, completed_at = ?2, updated_at = ?3 WHERE id = ?4",
        params![status, completed_at, now_iso(), id],
    )
    .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn task_delete(state: tauri::State<AppState>, id: String) -> CmdResult<()> {
    let conn = lock(&state)?;
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])
        .map_err(err)?;
    Ok(())
}

// ---------------------------------------------------------------- habits

#[tauri::command]
pub fn habit_list(state: tauri::State<AppState>) -> CmdResult<Vec<HabitRow>> {
    let conn = lock(&state)?;
    let mut stmt = conn
        .prepare(
            "SELECT h.id, h.name, h.life_area_id, h.frequency_type, h.frequency_rule, h.start_date, h.status, h.created_at, la.name FROM habits h LEFT JOIN life_areas la ON la.id = h.life_area_id ORDER BY h.name COLLATE NOCASE",
        )
        .map_err(err)?;
    let mapped = stmt
        .query_map([], |r| {
            Ok(HabitRow {
                id: r.get(0)?,
                name: r.get(1)?,
                life_area_id: r.get(2)?,
                frequency_type: r.get(3)?,
                frequency_rule: r.get(4)?,
                start_date: r.get(5)?,
                status: r.get(6)?,
                created_at: r.get(7)?,
                area_name: r.get(8)?,
            })
        })
        .map_err(err)?;
    let rows = mapped.collect::<Result<Vec<_>, _>>().map_err(err)?;
    Ok(rows)
}

#[tauri::command]
pub fn habit_create(state: tauri::State<AppState>, input: Value) -> CmdResult<HabitRow> {
    let conn = lock(&state)?;
    let id = new_id();
    conn.execute(
        "INSERT INTO habits (id, name, life_area_id, frequency_type, frequency_rule, start_date, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![
            id,
            required_string(&input, "name")?,
            opt_string(&input, "lifeAreaId"),
            opt_string(&input, "frequencyType").unwrap_or_else(|| "daily".to_string()),
            opt_string(&input, "frequencyRule").unwrap_or_default(),
            opt_string(&input, "startDate").unwrap_or_else(|| today()),
            opt_string(&input, "status").unwrap_or_else(|| "active".to_string()),
            now_iso()
        ],
    )
    .map_err(err)?;
    Ok(HabitRow {
        id,
        name: required_string(&input, "name")?,
        life_area_id: opt_string(&input, "lifeAreaId"),
        frequency_type: opt_string(&input, "frequencyType").unwrap_or_else(|| "daily".to_string()),
        frequency_rule: opt_string(&input, "frequencyRule").unwrap_or_default(),
        start_date: Some(opt_string(&input, "startDate").unwrap_or_else(|| today())),
        status: opt_string(&input, "status").unwrap_or_else(|| "active".to_string()),
        created_at: now_iso(),
        area_name: None,
    })
}

#[tauri::command]
pub fn habit_update(state: tauri::State<AppState>, id: String, patch: Value) -> CmdResult<()> {
    let conn = lock(&state)?;
    let obj = patch.as_object().ok_or("invalid patch object")?;
    let mut sets: Vec<String> = Vec::new();
    let mut vals: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    for (key, col) in [
        ("name", "name"),
        ("lifeAreaId", "life_area_id"),
        ("frequencyType", "frequency_type"),
        ("frequencyRule", "frequency_rule"),
        ("startDate", "start_date"),
        ("status", "status"),
    ] {
        if let Some(v) = obj.get(key) {
            sets.push(format!("{} = ?", col));
            vals.push(value_to_sql(v));
        }
    }
    if !sets.is_empty() {
        let sql = format!("UPDATE habits SET {} WHERE id = ?", sets.join(", "));
        vals.push(Box::new(id.clone()));
        conn.execute(&sql, params_from_iter(vals)).map_err(err)?;
    }
    Ok(())
}

#[tauri::command]
pub fn habit_delete(state: tauri::State<AppState>, id: String) -> CmdResult<()> {
    let conn = lock(&state)?;
    conn.execute("DELETE FROM habits WHERE id = ?1", params![id])
        .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn habit_entries(
    state: tauri::State<AppState>,
    from: String,
    to: String,
) -> CmdResult<Vec<HabitEntryRow>> {
    let conn = lock(&state)?;
    let mut stmt = conn
        .prepare("SELECT habit_id, date, completed, value FROM habit_entries WHERE date >= ?1 AND date <= ?2")
        .map_err(err)?;
    let mapped = stmt
        .query_map(params![from, to], |r| {
            Ok(HabitEntryRow {
                habit_id: r.get(0)?,
                date: r.get(1)?,
                completed: r.get::<_, i64>(2)? != 0,
                value: r.get(3)?,
            })
        })
        .map_err(err)?;
    let rows = mapped.collect::<Result<Vec<_>, _>>().map_err(err)?;
    Ok(rows)
}

#[tauri::command]
pub fn habit_toggle(
    state: tauri::State<AppState>,
    habit_id: String,
    date: String,
    completed: bool,
    value: Option<f64>,
) -> CmdResult<()> {
    let conn = lock(&state)?;
    conn.execute(
        "INSERT INTO habit_entries (habit_id, date, completed, value) VALUES (?1,?2,?3,?4) ON CONFLICT (habit_id, date) DO UPDATE SET completed = excluded.completed, value = excluded.value",
        params![habit_id, date, if completed { 1 } else { 0 }, value],
    )
    .map_err(err)?;
    Ok(())
}

// ---------------------------------------------------------------- reviews

fn map_review(r: &rusqlite::Row<'_>) -> rusqlite::Result<ReviewRow> {
    let content: String = r.get(4)?;
    Ok(ReviewRow {
        id: r.get(0)?,
        review_type: r.get(1)?,
        period_start: r.get(2)?,
        period_end: r.get(3)?,
        content: serde_json::from_str(&content).unwrap_or(json!({})),
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
    })
}

#[tauri::command]
pub fn review_list(
    state: tauri::State<AppState>,
    review_type: Option<String>,
) -> CmdResult<Vec<ReviewRow>> {
    let conn = lock(&state)?;
    let mut sql = String::from(
        "SELECT id, type, period_start, period_end, content, created_at, updated_at FROM reviews",
    );
    let mut vals: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if let Some(t) = review_type {
        sql.push_str(" WHERE type = ?");
        vals.push(Box::new(t));
    }
    sql.push_str(" ORDER BY period_start DESC");
    let mut stmt = conn.prepare(&sql).map_err(err)?;
    let rows = stmt
        .query_map(params_from_iter(vals), map_review)
        .map_err(err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(err)?;
    Ok(rows)
}

#[tauri::command]
pub fn review_get(
    state: tauri::State<AppState>,
    review_type: String,
    period_start: String,
) -> CmdResult<Option<ReviewRow>> {
    let conn = lock(&state)?;
    let mut stmt = conn
        .prepare("SELECT id, type, period_start, period_end, content, created_at, updated_at FROM reviews WHERE type = ?1 AND period_start = ?2")
        .map_err(err)?;
    let row = stmt
        .query_row(params![review_type, period_start], map_review)
        .optional()
        .map_err(err)?;
    Ok(row)
}

#[tauri::command]
pub fn review_save(
    state: tauri::State<AppState>,
    review_type: String,
    period_start: String,
    period_end: String,
    content: Value,
) -> CmdResult<()> {
    let conn = lock(&state)?;
    let now = now_iso();
    let content_str = serde_json::to_string(&content).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO reviews (id, type, period_start, period_end, content, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6) ON CONFLICT (type, period_start) DO UPDATE SET period_end = excluded.period_end, content = excluded.content, updated_at = excluded.updated_at",
        params![new_id(), review_type, period_start, period_end, content_str, now],
    )
    .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn review_stats(state: tauri::State<AppState>, from: String, to: String) -> CmdResult<Value> {
    let conn = lock(&state)?;
    let today = today();

    let completed: Vec<Value> = {
        let mut stmt = conn
            .prepare("SELECT id, title FROM tasks WHERE status = 'completed' AND date(completed_at) >= date(?1) AND date(completed_at) <= date(?2) ORDER BY completed_at DESC LIMIT 50")
            .map_err(err)?;
        let mapped = stmt
            .query_map(params![from, to], |r| {
                Ok(json!({ "id": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)? }))
            })
            .map_err(err)?;
        mapped.collect::<Result<Vec<_>, _>>().map_err(err)?
    };
    let overdue: Vec<Value> = {
        let mut stmt = conn
            .prepare("SELECT id, title, due_date FROM tasks WHERE status NOT IN ('completed','cancelled') AND archived = 0 AND due_date IS NOT NULL AND due_date < ?1 ORDER BY due_date LIMIT 50")
            .map_err(err)?;
        let mapped = stmt.query_map(params![today], |r| {
            Ok(json!({ "id": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)?, "dueDate": r.get::<_, Option<String>>(2)? }))
        }).map_err(err)?;
        mapped.collect::<Result<Vec<_>, _>>().map_err(err)?
    };
    let moved: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE status NOT IN ('completed','cancelled') AND date(updated_at) >= date(?1) AND date(updated_at) <= date(?2)",
            params![from, to],
            |r| r.get(0),
        )
        .map_err(err)?;
    let worked: Vec<Value> = {
        let mut stmt = conn
            .prepare("SELECT DISTINCT p.id, p.title FROM projects p JOIN tasks t ON t.project_id = p.id WHERE date(t.updated_at) >= date(?1) AND date(t.updated_at) <= date(?2) ORDER BY p.title LIMIT 50")
            .map_err(err)?;
        let mapped = stmt
            .query_map(params![from, to], |r| {
                Ok(json!({ "id": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)? }))
            })
            .map_err(err)?;
        mapped.collect::<Result<Vec<_>, _>>().map_err(err)?
    };
    let neglected: Vec<Value> = {
        let mut stmt = conn
            .prepare("SELECT id, title FROM projects p WHERE p.status = 'active' AND p.archived = 0 AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.project_id = p.id AND t.updated_at >= ?1 AND t.updated_at <= ?2) ORDER BY p.title LIMIT 50")
            .map_err(err)?;
        let mapped = stmt
            .query_map(params![from, to], |r| {
                Ok(json!({ "id": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)? }))
            })
            .map_err(err)?;
        mapped.collect::<Result<Vec<_>, _>>().map_err(err)?
    };
    let upcoming_hard: Vec<Value> = {
        let mut stmt = conn
            .prepare("SELECT id, title, due_date FROM tasks WHERE deadline_type = 'hard' AND status NOT IN ('completed','cancelled') AND archived = 0 AND due_date IS NOT NULL AND due_date >= ?1 ORDER BY due_date LIMIT 10")
            .map_err(err)?;
        let mapped = stmt.query_map(params![today], |r| {
            Ok(json!({ "id": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)?, "dueDate": r.get::<_, Option<String>>(2)? }))
        }).map_err(err)?;
        mapped.collect::<Result<Vec<_>, _>>().map_err(err)?
    };
    let active_goals: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM goals WHERE status = 'active' AND archived = 0",
            [],
            |r| r.get(0),
        )
        .map_err(err)?;
    let habit: Value = {
        let total: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM habit_entries WHERE date >= ?1 AND date <= ?2",
                params![from, to],
                |r| r.get(0),
            )
            .map_err(err)?;
        let done: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM habit_entries WHERE date >= ?1 AND date <= ?2 AND completed = 1",
                params![from, to],
                |r| r.get(0),
            )
            .map_err(err)?;
        json!({ "completed": done, "total": total })
    };
    Ok(json!({
        "completed": completed,
        "completedCount": completed.len(),
        "overdue": overdue,
        "movedCount": moved,
        "workedProjects": worked,
        "neglectedProjects": neglected,
        "upcomingHard": upcoming_hard,
        "activeGoals": active_goals,
        "habits": habit,
    }))
}

// ---------------------------------------------------------------- notes

#[tauri::command]
pub fn note_get(
    state: tauri::State<AppState>,
    entity_type: String,
    entity_id: String,
) -> CmdResult<Option<NoteRow>> {
    let conn = lock(&state)?;
    let mut stmt = conn
        .prepare("SELECT id, entity_type, entity_id, content, updated_at FROM notes WHERE entity_type = ?1 AND entity_id = ?2")
        .map_err(err)?;
    let row = stmt
        .query_row(params![entity_type, entity_id], |r| {
            Ok(NoteRow {
                id: r.get(0)?,
                entity_type: r.get(1)?,
                entity_id: r.get(2)?,
                content: r.get(3)?,
                updated_at: r.get(4)?,
            })
        })
        .optional()
        .map_err(err)?;
    Ok(row)
}

#[tauri::command]
pub fn note_save(
    state: tauri::State<AppState>,
    entity_type: String,
    entity_id: String,
    content: String,
) -> CmdResult<()> {
    let conn = lock(&state)?;
    let now = now_iso();
    conn.execute(
        "INSERT INTO notes (id, entity_type, entity_id, content, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?5) ON CONFLICT (entity_type, entity_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at",
        params![new_id(), entity_type, entity_id, content, now],
    )
    .map_err(err)?;
    Ok(())
}

// ---------------------------------------------------------------- search / misc

#[tauri::command]
pub fn search_all(state: tauri::State<AppState>, q: String) -> CmdResult<Value> {
    let conn = lock(&state)?;
    if q.trim().is_empty() {
        return Ok(json!({ "tasks": [], "projects": [], "goals": [], "areas": [], "notes": [] }));
    }
    let like = format!("%{}%", like_escape(&q));

    let tasks: Vec<Value> = {
        let mut stmt = conn
            .prepare("SELECT id, title, status FROM tasks WHERE (title LIKE ? OR description LIKE ?) AND archived = 0 ORDER BY status = 'completed' LIMIT 20")
            .map_err(err)?;
        let mapped = stmt.query_map(params![like, like], |r| {
            Ok(json!({ "id": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)?, "status": r.get::<_, String>(2)? }))
        }).map_err(err)?;
        mapped.collect::<Result<Vec<_>, _>>().map_err(err)?
    };
    let projects: Vec<Value> = {
        let mut stmt = conn
            .prepare("SELECT id, title, status FROM projects WHERE (title LIKE ? OR description LIKE ?) AND archived = 0 LIMIT 20")
            .map_err(err)?;
        let mapped = stmt.query_map(params![like, like], |r| {
            Ok(json!({ "id": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)?, "status": r.get::<_, String>(2)? }))
        }).map_err(err)?;
        mapped.collect::<Result<Vec<_>, _>>().map_err(err)?
    };
    let goals: Vec<Value> = {
        let mut stmt = conn
            .prepare("SELECT id, title, status FROM goals WHERE (title LIKE ? OR description LIKE ?) AND archived = 0 LIMIT 20")
            .map_err(err)?;
        let mapped = stmt.query_map(params![like, like], |r| {
            Ok(json!({ "id": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)?, "status": r.get::<_, String>(2)? }))
        }).map_err(err)?;
        mapped.collect::<Result<Vec<_>, _>>().map_err(err)?
    };
    let areas: Vec<Value> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, name FROM life_areas WHERE name LIKE ? OR description LIKE ? LIMIT 20",
            )
            .map_err(err)?;
        let mapped = stmt
            .query_map(params![like, like], |r| {
                Ok(json!({ "id": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)? }))
            })
            .map_err(err)?;
        mapped.collect::<Result<Vec<_>, _>>().map_err(err)?
    };
    let notes: Vec<Value> = {
        let mut stmt = conn
            .prepare("SELECT entity_type, entity_id, substr(content, 1, 120) FROM notes WHERE content LIKE ? LIMIT 20")
            .map_err(err)?;
        let mapped = stmt.query_map(params![like], |r| {
            Ok(json!({ "entityType": r.get::<_, String>(0)?, "entityId": r.get::<_, String>(1)?, "title": r.get::<_, String>(2)? }))
        }).map_err(err)?;
        mapped.collect::<Result<Vec<_>, _>>().map_err(err)?
    };
    Ok(json!({
        "tasks": tasks,
        "projects": projects,
        "goals": goals,
        "areas": areas,
        "notes": notes,
    }))
}

#[tauri::command]
pub fn app_data_dir(app: AppHandle) -> CmdResult<String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}
