import {
  DEADLINE_LABELS,
  DEADLINE_TYPES,
  PRIORITIES,
  PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  useStore,
  type DeadlineType,
  type Priority,
  type TaskStatus,
} from "../state/store";

/** A select that also offers creating a new entry on the fly. */
function NamedSelect({
  label,
  value,
  items,
  onChange,
  onCreate,
}: {
  label: string;
  value: string;
  items: { id: string; title: string }[];
  onChange: (id: string | null) => void;
  onCreate: (title: string) => string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        className="field-input"
        value={value}
        onChange={(e) => {
          if (e.target.value === "__new__") {
            const title = window.prompt(`New ${label.toLowerCase()} name`);
            if (title?.trim()) onChange(onCreate(title.trim()));
          } else {
            onChange(e.target.value || null);
          }
        }}
      >
        <option value="">None</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
        <option value="__new__">+ New {label.toLowerCase()}…</option>
      </select>
    </label>
  );
}

export function TaskDetailPanel() {
  const {
    detail,
    closeDetail,
    byDay,
    updateTask,
    deleteTask,
    projects,
    areas,
    addProject,
    addArea,
  } = useStore();
  if (!detail) return null;

  const task = (byDay[detail.dateISO] ?? []).find((t) => t.id === detail.id) ?? null;
  if (!task) {
    return (
      <aside className="detail-panel" aria-label="Task details">
        <div className="detail-head">
          <h3>Task</h3>
          <button className="detail-close" onClick={closeDetail} aria-label="Close details" title="Close">
            ×
          </button>
        </div>
        <p className="detail-empty">Task not found.</p>
      </aside>
    );
  }

  const patch = (p: Parameters<typeof updateTask>[2]) => updateTask(detail.dateISO, task.id, p);

  const remove = () => {
    if (!window.confirm(`Delete "${task.title}" permanently?`)) return;
    deleteTask(detail.dateISO, task.id);
    closeDetail();
  };

  return (
    <aside className="detail-panel" aria-label="Task details">
      <div className="detail-head">
        <h3>Task</h3>
        <button className="detail-close" onClick={closeDetail} aria-label="Close details" title="Close">
          ×
        </button>
      </div>
      <div className="detail-body">
        <label className="field">
          <span className="field-label">Title</span>
          <input
            className="field-input"
            value={task.title}
            onChange={(e) => patch({ title: e.target.value })}
            autoFocus
          />
        </label>
        <div className="field-grid">
          <label className="field">
            <span className="field-label">Status</span>
            <select
              className="field-input"
              value={task.status}
              onChange={(e) => patch({ status: e.target.value as TaskStatus })}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Priority</span>
            <select
              className="field-input"
              value={task.priority}
              onChange={(e) => patch({ priority: e.target.value as Priority })}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field-grid">
          <NamedSelect
            label="Project"
            value={task.projectId ?? ""}
            items={projects}
            onChange={(id) => patch({ projectId: id })}
            onCreate={(title) => addProject({ title })}
          />
          <NamedSelect
            label="Area"
            value={task.areaId ?? ""}
            items={areas}
            onChange={(id) => patch({ areaId: id })}
            onCreate={(title) => addArea({ title })}
          />
        </div>
        <div className="field-grid">
          <label className="field">
            <span className="field-label">Scheduled</span>
            <input
              type="date"
              className="field-input"
              value={task.scheduledDate ?? ""}
              onChange={(e) => patch({ scheduledDate: e.target.value || null })}
            />
          </label>
          <label className="field">
            <span className="field-label">Due</span>
            <input
              type="date"
              className="field-input"
              value={task.dueDate ?? ""}
              onChange={(e) => patch({ dueDate: e.target.value || null })}
            />
          </label>
        </div>
        <label className="field">
          <span className="field-label">Deadline Type</span>
          <select
            className="field-input"
            value={task.deadlineType}
            onChange={(e) => patch({ deadlineType: e.target.value as DeadlineType })}
          >
            {DEADLINE_TYPES.map((d) => (
              <option key={d} value={d}>
                {DEADLINE_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Notes</span>
          <textarea
            className="field-input textarea"
            rows={4}
            value={task.notes}
            placeholder="Notes…"
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </label>
        <div className="detail-actions">
          <button className="button ghost" onClick={() => patch({ archived: !task.archived })}>
            {task.archived ? "Unarchive" : "Archive"}
          </button>
          <button className="button danger" onClick={remove}>
            Delete
          </button>
        </div>
      </div>
    </aside>
  );
}
