use rusqlite::{params, Connection};
use serde_json::Value;

pub fn date(value: &str) -> Result<(), String> {
    if value.len() != 10
        || chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
            .map(|d| d.format("%Y-%m-%d").to_string() != value)
            .unwrap_or(true)
    {
        return Err("validation: expected a real YYYY-MM-DD date".into());
    }
    Ok(())
}

pub fn exists(conn: &Connection, table: &str, id: &str) -> Result<(), String> {
    let found: bool = conn
        .query_row(
            &format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id=?1)"),
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !found {
        return Err(format!("validation: {table} record not found: {id}"));
    }
    Ok(())
}

pub fn input(conn: &Connection, kind: &str, value: &Value, creating: bool) -> Result<(), String> {
    let obj = value.as_object().ok_or("validation: expected an object")?;
    let fields: &[&str] = match kind {
        "area" => &[
            "name",
            "description",
            "icon",
            "color",
            "sortOrder",
            "archived",
        ],
        "goal" => &[
            "title",
            "description",
            "lifeAreaId",
            "status",
            "priority",
            "startDate",
            "targetDate",
            "progressMode",
            "manualProgress",
            "projectIds",
            "archived",
        ],
        "project" => &[
            "title",
            "description",
            "lifeAreaId",
            "status",
            "priority",
            "icon",
            "color",
            "startDate",
            "targetDate",
            "progressMode",
            "manualProgress",
            "goalIds",
            "archived",
        ],
        "task" => &[
            "title",
            "description",
            "status",
            "lifeAreaId",
            "projectId",
            "scheduledDate",
            "dueDate",
            "deadlineType",
            "priority",
            "estimatedMinutes",
            "actualMinutes",
            "recurrenceRule",
            "parentTaskId",
            "goalIds",
            "archived",
        ],
        "habit" => &[
            "name",
            "lifeAreaId",
            "frequencyType",
            "frequencyRule",
            "startDate",
            "status",
        ],
        _ => return Err("validation: unsupported entity".into()),
    };
    let title = if kind == "area" || kind == "habit" {
        "name"
    } else {
        "title"
    };
    if creating && !obj.contains_key(title) {
        return Err(format!("validation: missing field: {title}"));
    }
    for (key, v) in obj {
        if !fields.contains(&key.as_str()) {
            return Err(format!("validation: unsupported field: {key}"));
        }
        match key.as_str() {
            "title" | "name" => {
                if v.as_str().map(|s| s.trim().is_empty()).unwrap_or(true) {
                    return Err(format!("validation: {key} must be nonempty text"));
                }
            }
            "description" | "icon" | "color" | "frequencyRule" => {
                if !v.is_string() {
                    return Err(format!("validation: {key} must be text"));
                }
            }
            "recurrenceRule" => {
                if !v.is_null() && !v.is_string() {
                    return Err("validation: recurrenceRule must be text or null".into());
                }
            }
            "status" | "priority" | "deadlineType" | "progressMode" | "frequencyType" => {
                let choices: &[&str] = match key.as_str() {
                    "status" => match kind {
                        "task" => &[
                            "inbox",
                            "todo",
                            "in_progress",
                            "waiting",
                            "completed",
                            "cancelled",
                        ],
                        "project" => &[
                            "idea",
                            "planned",
                            "active",
                            "waiting",
                            "on_hold",
                            "completed",
                            "cancelled",
                        ],
                        "goal" => &["planned", "active", "on_hold", "completed", "abandoned"],
                        "habit" => &["active", "paused"],
                        _ => &[],
                    },
                    "priority" => &["p1", "p2", "p3", "p4"],
                    "deadlineType" => &["none", "soft", "hard"],
                    "progressMode" => &["auto", "manual"],
                    _ => &["daily", "weekdays", "weekly", "custom"],
                };
                if !v.as_str().map(|s| choices.contains(&s)).unwrap_or(false) {
                    return Err(format!("validation: unsupported {key}"));
                }
            }
            "scheduledDate" | "dueDate" | "startDate" | "targetDate" => {
                if !v.is_null() {
                    date(
                        v.as_str()
                            .ok_or(format!("validation: {key} must be text or null"))?,
                    )?;
                }
            }
            "lifeAreaId" | "projectId" | "parentTaskId" => {
                if !v.is_null() {
                    let id = v
                        .as_str()
                        .ok_or(format!("validation: {key} must be an ID or null"))?;
                    let table = match key.as_str() {
                        "lifeAreaId" => "life_areas",
                        "projectId" => "projects",
                        _ => "tasks",
                    };
                    exists(conn, table, id)?;
                }
            }
            "goalIds" | "projectIds" => {
                let ids = v
                    .as_array()
                    .ok_or(format!("validation: {key} must be an array"))?;
                for id in ids {
                    exists(
                        conn,
                        if key == "goalIds" {
                            "goals"
                        } else {
                            "projects"
                        },
                        id.as_str()
                            .ok_or("validation: relationship IDs must be strings")?,
                    )?;
                }
            }
            "estimatedMinutes" | "actualMinutes" | "manualProgress" | "sortOrder" => {
                if v.is_null() && (key == "estimatedMinutes" || key == "actualMinutes") {
                    continue;
                }
                let n = v
                    .as_i64()
                    .ok_or(format!("validation: {key} must be an integer"))?;
                if n < 0 || (key == "manualProgress" && n > 100) {
                    return Err(format!("validation: {key} is out of range"));
                }
                if key == "sortOrder" && kind != "area" {
                    return Err("validation: use task_move to change order".into());
                }
            }
            "archived" => {
                if !v.is_boolean() {
                    return Err("validation: archived must be boolean".into());
                }
            }
            _ => return Err(format!("validation: unsupported field: {key}")),
        }
    }
    Ok(())
}
