use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AreaRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub color: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
    pub archived: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GoalRow {
    pub id: String,
    pub title: String,
    pub description: String,
    pub life_area_id: Option<String>,
    pub status: String,
    pub priority: String,
    pub start_date: Option<String>,
    pub target_date: Option<String>,
    pub progress_mode: String,
    pub manual_progress: i64,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub archived: bool,
    pub area_name: Option<String>,
    pub project_ids: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRow {
    pub id: String,
    pub title: String,
    pub description: String,
    pub life_area_id: Option<String>,
    pub status: String,
    pub priority: String,
    pub icon: String,
    pub color: String,
    pub start_date: Option<String>,
    pub target_date: Option<String>,
    pub progress_mode: String,
    pub manual_progress: i64,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub archived: bool,
    pub area_name: Option<String>,
    pub goal_ids: Vec<String>,
    pub open_tasks: i64,
    pub total_tasks: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskRow {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub life_area_id: Option<String>,
    pub project_id: Option<String>,
    pub scheduled_date: Option<String>,
    pub due_date: Option<String>,
    pub deadline_type: String,
    pub priority: String,
    pub estimated_minutes: Option<i64>,
    pub actual_minutes: Option<i64>,
    pub recurrence_rule: Option<String>,
    pub parent_task_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub archived: bool,
    pub area_name: Option<String>,
    pub project_name: Option<String>,
    pub goal_ids: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HabitRow {
    pub id: String,
    pub name: String,
    pub life_area_id: Option<String>,
    pub frequency_type: String,
    pub frequency_rule: String,
    pub start_date: Option<String>,
    pub status: String,
    pub created_at: String,
    pub area_name: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HabitEntryRow {
    pub habit_id: String,
    pub date: String,
    pub completed: bool,
    pub value: Option<f64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRow {
    pub id: String,
    pub review_type: String,
    pub period_start: String,
    pub period_end: String,
    pub content: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteRow {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub content: String,
    pub updated_at: String,
}
