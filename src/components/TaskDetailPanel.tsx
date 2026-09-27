import { useStore } from "../state/store";

/**
 * Right-hand detail panel. Rebuilt function by function: for now it only
 * shows the task title, which is editable.
 */
export function TaskDetailPanel() {
  const { detail, closeDetail, byDay, renameTask } = useStore();
  if (!detail) return null;

  const task = (byDay[detail.dateISO] ?? []).find((t) => t.id === detail.id) ?? null;

  return (
    <aside className="detail-panel" aria-label="Task details">
      <div className="detail-head">
        <h3>Task</h3>
        <button className="detail-close" onClick={closeDetail} aria-label="Close details" title="Close">
          ×
        </button>
      </div>
      {task ? (
        <div className="detail-body">
          <label className="field">
            <span className="field-label">Title</span>
            <input
              className="field-input"
              value={task.title}
              onChange={(e) => renameTask(detail.dateISO, task.id, e.target.value)}
              autoFocus
            />
          </label>
        </div>
      ) : (
        <p className="detail-empty">Task not found.</p>
      )}
    </aside>
  );
}
