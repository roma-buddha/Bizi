import { useState } from "react";
import { DraftField } from "./DraftField";
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
  onCreate: (title: string) => Promise<string | null>;
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
            if (title?.trim())
              void onCreate(title.trim()).then((id) => {
                if (id) onChange(id);
              });
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
  const [acting, setActing] = useState(false);
  const {
    detail,
    pending,
    flushDrafts,
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

  const task =
    (byDay[detail.dateISO] ?? []).find((t) => t.id === detail.id) ?? null;
  if (!task) {
    return (
      <aside className="detail-panel" aria-label="Task details">
        <div className="detail-head">
          <h3>Task</h3>
          <button
            className="detail-close"
            onClick={closeDetail}
            aria-label="Close details"
            title="Close"
          >
            ×
          </button>
        </div>
        <p className="detail-empty">Task not found.</p>
      </aside>
    );
  }

  const patch = (p: Parameters<typeof updateTask>[2]) =>
    updateTask(detail.dateISO, task.id, p);

  const remove = async () => {
    if (!window.confirm(`Delete "${task.title}" permanently?`)) return;
    setActing(true);
    if ((await flushDrafts()) && (await deleteTask(detail.dateISO, task.id)))
      closeDetail();
    setActing(false);
  };

  return (
    <aside className="detail-panel" aria-label="Task details">
      <div className="detail-head">
        <h3>Task</h3>
        <button
          className="detail-close"
          onClick={closeDetail}
          aria-label="Close details"
          title="Close"
        >
          ×
        </button>
      </div>
      <fieldset
        className="detail-body edit-fields"
        disabled={acting || pending > 0}
      >
        <label className="field">
          <span className="field-label">Title</span>
          <DraftField
            key={task.id + ":title"}
            draftKey={task.id + ":title"}
            value={task.title}
            onSave={(title) => patch({ title })}
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
            onChange={(e) =>
              patch({ deadlineType: e.target.value as DeadlineType })
            }
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
          <DraftField
            key={task.id + ":notes"}
            draftKey={task.id + ":notes"}
            value={task.notes}
            onSave={(notes) => patch({ notes })}
            multiline
            className="field-input textarea"
            placeholder="Notes…"
          />
        </label>
        <div className="detail-actions">
          <button
            className="button ghost"
            onClick={() => patch({ archived: !task.archived })}
          >
            {task.archived ? "Unarchive" : "Archive"}
          </button>
          <button className="button danger" onClick={remove}>
            Delete
          </button>
        </div>
      </fieldset>
    </aside>
  );
}
