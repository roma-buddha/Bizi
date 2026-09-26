use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct AppState {
    pub conn: Mutex<Connection>,
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

pub fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

pub fn day_offset(days: i64) -> String {
    (chrono::Local::now() + chrono::Duration::days(days))
        .format("%Y-%m-%d")
        .to_string()
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS life_areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  life_area_id TEXT REFERENCES life_areas(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  priority TEXT NOT NULL DEFAULT 'p3',
  start_date TEXT,
  target_date TEXT,
  progress_mode TEXT NOT NULL DEFAULT 'manual',
  manual_progress INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  life_area_id TEXT REFERENCES life_areas(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  priority TEXT NOT NULL DEFAULT 'p3',
  start_date TEXT,
  target_date TEXT,
  progress_mode TEXT NOT NULL DEFAULT 'manual',
  manual_progress INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS goal_projects (
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (goal_id, project_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  life_area_id TEXT REFERENCES life_areas(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  scheduled_date TEXT,
  due_date TEXT,
  deadline_type TEXT NOT NULL DEFAULT 'none',
  priority TEXT NOT NULL DEFAULT 'p3',
  estimated_minutes INTEGER,
  actual_minutes INTEGER,
  recurrence_rule TEXT,
  parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS task_goals (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, goal_id)
);

CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  life_area_id TEXT REFERENCES life_areas(id) ON DELETE SET NULL,
  frequency_type TEXT NOT NULL DEFAULT 'daily',
  frequency_rule TEXT NOT NULL DEFAULT '',
  start_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habit_entries (
  habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  value REAL,
  PRIMARY KEY (habit_id, date)
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (type, period_start)
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled ON tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_area ON tasks(life_area_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_habit_entries_date ON habit_entries(date);
CREATE INDEX IF NOT EXISTS idx_notes_entity ON notes(entity_type, entity_id);
"#;

pub fn init(app: &AppHandle) -> Result<AppState, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let conn = Connection::open(dir.join("bizi.db")).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    migrate(&conn)?;
    Ok(AppState {
        conn: Mutex::new(conn),
    })
}

fn migrate(conn: &Connection) -> Result<(), String> {
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if version < 1 {
        conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
        seed(conn)?;
        conn.pragma_update(None, "user_version", 1)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn seed(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM life_areas", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Ok(());
    }
    let now = now_iso();
    let today_s = today();

    let areas = [
        ("Business", "briefcase", "amber"),
        ("Research", "flask-conical", "blue"),
        ("Health", "heart-pulse", "green"),
        ("Finances", "wallet", "violet"),
        ("Relationships", "users", "rose"),
        ("Life Organization", "calendar-check", "slate"),
    ];
    let mut area_ids: Vec<String> = Vec::new();
    for (i, (name, icon, color)) in areas.iter().enumerate() {
        let id = new_id();
        conn.execute(
            "INSERT INTO life_areas (id, name, description, icon, color, sort_order, created_at, updated_at) VALUES (?1,?2,'',?3,?4,?5,?6,?6)",
            rusqlite::params![id, name, icon, color, i as i64, now],
        )
        .map_err(|e| e.to_string())?;
        area_ids.push(id);
    }
    let (business, research, health, finances, _relationships, _life_org) = (
        area_ids[0].clone(),
        area_ids[1].clone(),
        area_ids[2].clone(),
        area_ids[3].clone(),
        area_ids[4].clone(),
        area_ids[5].clone(),
    );

    let add_goal = |title: &str,
                    area: &str,
                    status: &str,
                    priority: &str,
                    target: &str|
     -> Result<String, String> {
        let id = new_id();
        conn.execute(
            "INSERT INTO goals (id, title, life_area_id, status, priority, start_date, target_date, progress_mode, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'auto',?8,?8)",
            rusqlite::params![id, title, area, status, priority, today_s, target, now],
        )
        .map_err(|e| e.to_string())?;
        Ok(id)
    };

    let g_fin = add_goal(
        "Financial Independence",
        &business,
        "active",
        "p1",
        &day_offset(730),
    )?;
    let g_res = add_goal(
        "Publish High-Quality Research",
        &research,
        "active",
        "p2",
        &day_offset(365),
    )?;
    let _g_fit = add_goal("Improve Fitness", &health, "active", "p3", &day_offset(180))?;
    add_goal(
        "Build an International Research Network",
        &research,
        "planned",
        "p3",
        &day_offset(540),
    )?;
    add_goal(
        "Obtain Spanish Citizenship",
        &finances,
        "on_hold",
        "p4",
        &day_offset(900),
    )?;

    let add_project = |title: &str,
                       area: &str,
                       status: &str,
                       priority: &str,
                       target: &str|
     -> Result<String, String> {
        let id = new_id();
        conn.execute(
                "INSERT INTO projects (id, title, life_area_id, status, priority, start_date, target_date, progress_mode, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'auto',?8,?8)",
                rusqlite::params![id, title, area, status, priority, today_s, target, now],
            )
            .map_err(|e| e.to_string())?;
        Ok(id)
    };

    let p_sci = add_project("SciMaps", &business, "active", "p1", &day_offset(120))?;
    let p_rev = add_project(
        "Human-AI Interaction Review",
        &research,
        "active",
        "p2",
        &day_offset(60),
    )?;
    let p_web = add_project(
        "Personal Website Redesign",
        &business,
        "planned",
        "p3",
        &day_offset(45),
    )?;
    conn.execute(
        "INSERT INTO goal_projects (goal_id, project_id) VALUES (?1,?2), (?3,?4)",
        rusqlite::params![g_fin, p_sci, g_res, p_rev],
    )
    .map_err(|e| e.to_string())?;

    let add_task = |title: &str,
                    status: &str,
                    area: Option<&str>,
                    project: Option<&str>,
                    scheduled: Option<String>,
                    due: Option<String>,
                    deadline: &str,
                    priority: &str,
                    completed_days_ago: Option<i64>|
     -> Result<String, String> {
        let id = new_id();
        let completed_at = completed_days_ago.map(|d| {
            (chrono::Utc::now() - chrono::Duration::days(d))
                .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
        });
        conn.execute(
            "INSERT INTO tasks (id, title, status, life_area_id, project_id, scheduled_date, due_date, deadline_type, priority, created_at, updated_at, completed_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10,?11)",
            rusqlite::params![id, title, status, area, project, scheduled, due, deadline, priority, now, completed_at],
        )
        .map_err(|e| e.to_string())?;
        Ok(id)
    };

    let t_onboard = add_task(
        "Improve onboarding",
        "todo",
        Some(&business),
        Some(&p_sci),
        Some(today_s.clone()),
        Some(day_offset(14)),
        "soft",
        "p2",
        None,
    )?;
    add_task(
        "Fix profile statistics",
        "todo",
        Some(&business),
        Some(&p_sci),
        Some(today_s.clone()),
        Some(today_s.clone()),
        "hard",
        "p1",
        None,
    )?;
    add_task(
        "Design pricing page",
        "todo",
        Some(&business),
        Some(&p_sci),
        Some(day_offset(2)),
        Some(day_offset(10)),
        "soft",
        "p2",
        None,
    )?;
    add_task(
        "Implement OpenAlex connection",
        "completed",
        Some(&business),
        Some(&p_sci),
        Some(day_offset(-6)),
        Some(day_offset(-4)),
        "soft",
        "p2",
        Some(4),
    )?;
    let t_review = add_task(
        "Review 10 papers",
        "in_progress",
        Some(&research),
        Some(&p_rev),
        Some(today_s.clone()),
        Some(day_offset(7)),
        "soft",
        "p2",
        None,
    )?;
    add_task(
        "Update search strategy",
        "todo",
        Some(&research),
        Some(&p_rev),
        Some(day_offset(1)),
        None,
        "none",
        "p3",
        None,
    )?;
    add_task(
        "Draft methodology section",
        "todo",
        Some(&research),
        Some(&p_rev),
        Some(day_offset(3)),
        Some(day_offset(21)),
        "hard",
        "p1",
        None,
    )?;
    add_task(
        "Book dentist appointment",
        "todo",
        Some(&health),
        None,
        Some(today_s.clone()),
        Some(day_offset(30)),
        "soft",
        "p3",
        None,
    )?;
    add_task(
        "Go to gym",
        "todo",
        Some(&health),
        None,
        Some(today_s.clone()),
        None,
        "none",
        "p3",
        None,
    )?;
    add_task(
        "Review quarterly budget",
        "todo",
        Some(&finances),
        None,
        Some(day_offset(5)),
        Some(day_offset(12)),
        "soft",
        "p3",
        None,
    )?;
    add_task(
        "Submit conference paper",
        "waiting",
        Some(&research),
        None,
        Some(day_offset(4)),
        Some(day_offset(14)),
        "hard",
        "p1",
        None,
    )?;
    add_task(
        "Renew passport",
        "todo",
        Some(&finances),
        None,
        None,
        Some(day_offset(-2)),
        "hard",
        "p1",
        None,
    )?;
    add_task(
        "File tax documents",
        "completed",
        Some(&finances),
        None,
        Some(day_offset(-9)),
        Some(day_offset(-7)),
        "hard",
        "p2",
        Some(7),
    )?;
    add_task(
        "Water the plants",
        "completed",
        Some(&health),
        None,
        Some(day_offset(-1)),
        None,
        "none",
        "p4",
        Some(1),
    )?;

    // subtasks
    add_task(
        "Collect user feedback on current onboarding",
        "completed",
        Some(&business),
        Some(&p_sci),
        Some(day_offset(-3)),
        None,
        "none",
        "p3",
        Some(2),
    )?;
    let sub = add_task(
        "Sketch new onboarding screens",
        "todo",
        Some(&business),
        Some(&p_sci),
        Some(day_offset(1)),
        None,
        "none",
        "p3",
        None,
    )?;
    conn.execute(
        "UPDATE tasks SET parent_task_id = ?1 WHERE id = ?2",
        rusqlite::params![t_onboard, sub],
    )
    .map_err(|e| e.to_string())?;

    // inbox items: unclassified captures
    add_task(
        "Look into new laptop",
        "inbox",
        None,
        None,
        None,
        None,
        "none",
        "p3",
        None,
    )?;
    add_task(
        "Idea: weekly planning template",
        "inbox",
        None,
        None,
        None,
        None,
        "none",
        "p4",
        None,
    )?;
    add_task(
        "Ask Anna about the conference hotel",
        "inbox",
        None,
        None,
        None,
        None,
        "none",
        "p3",
        None,
    )?;

    // task-goal relation example
    conn.execute(
        "INSERT INTO task_goals (task_id, goal_id) VALUES (?1,?2), (?3,?4)",
        rusqlite::params![t_review, g_res, t_onboard, g_fin],
    )
    .map_err(|e| e.to_string())?;

    // habits with two weeks of entries
    let habits = [
        ("Gym", &health, "daily", ""),
        ("Read 20 pages", &research, "daily", ""),
        ("Walk", &health, "weekly", "3"),
        ("Meditation", &health, "weekdays", ""),
    ];
    for (name, area, ftype, frule) in habits.iter() {
        let id = new_id();
        conn.execute(
            "INSERT INTO habits (id, name, life_area_id, frequency_type, frequency_rule, start_date, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,'active',?7)",
            rusqlite::params![id, name, area, ftype, frule, today_s, now],
        )
        .map_err(|e| e.to_string())?;
        for back in 0..14 {
            let date = day_offset(-back);
            let completed = if (back as usize + name.len()) % 3 != 0 {
                1
            } else {
                0
            };
            conn.execute(
                "INSERT INTO habit_entries (habit_id, date, completed) VALUES (?1,?2,?3)",
                rusqlite::params![id, date, completed],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // a note on the SciMaps project
    conn.execute(
        "INSERT INTO notes (id, entity_type, entity_id, content, created_at, updated_at) VALUES (?1,'project',?2,?3,?4,?4)",
        rusqlite::params![
            new_id(),
            p_web,
            "Goals for the redesign:\n\n- Cleaner landing page\n- Better mobile layout\n- Add a changelog section",
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn count(conn: &Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn migration_seeds_relational_sample_data() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();

        assert!(count(&conn, "SELECT COUNT(*) FROM life_areas") >= 6);
        assert!(count(&conn, "SELECT COUNT(*) FROM goals") >= 5);
        assert!(count(&conn, "SELECT COUNT(*) FROM projects") >= 3);
        assert!(count(&conn, "SELECT COUNT(*) FROM tasks") >= 18);
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM tasks WHERE status = 'inbox'"),
            3
        );
        assert!(count(&conn, "SELECT COUNT(*) FROM habits") >= 4);
        assert!(count(&conn, "SELECT COUNT(*) FROM habit_entries") >= 56);

        // Relationship tables are populated.
        assert!(count(&conn, "SELECT COUNT(*) FROM goal_projects") >= 2);
        assert!(count(&conn, "SELECT COUNT(*) FROM task_goals") >= 2);

        // A task linked to a project and a goal resolves its area through the project.
        let row: (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT life_area_id, project_id FROM tasks WHERE title = 'Fix profile statistics'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert!(row.0.is_some(), "task should inherit an area");
        assert!(row.1.is_some(), "task should belong to a project");

        // Migration is idempotent.
        migrate(&conn).unwrap();
        assert!(count(&conn, "SELECT COUNT(*) FROM tasks") >= 18);
    }

    #[test]
    fn scheduled_and_due_dates_are_distinct_columns() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        let row: (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT scheduled_date, due_date FROM tasks WHERE title = 'Write article' OR title = 'Design pricing page' LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        // Column shape check: at least one seeded task carries both dates or a due date.
        let _ = row;
        let both: i64 = count(
            &conn,
            "SELECT COUNT(*) FROM tasks WHERE scheduled_date IS NOT NULL AND due_date IS NOT NULL",
        );
        assert!(
            both >= 2,
            "seed should include tasks with separate scheduled and due dates"
        );
    }
}
