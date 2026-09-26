import { useEffect, useState } from "react";
import { api } from "../db";
import type {
  Goal,
  LifeArea,
  Priority,
  Project,
  Task,
  TaskPatch,
  TaskStatus,
} from "../models/types";
import {
  DEADLINE_LABELS,
  DEADLINE_TYPES,
  PRIORITIES,
  PRIORITY_NAMES,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from "../models/types";
import { useQuery, useStore } from "../state/store";
import { formatMinutes } from "../utils/calc";
import { formatDate, todayISO } from "../utils/date";
import { DateField, SelectField, TextField } from "./ui";
import { NoteEditor } from "./NoteEditor";

export function TaskDetailPanel() {
  const { detailTaskId, closeTaskDetail, bumpData } = useStore();
  const { data: task } = useQuery(() => (detailTaskId ? api.task.get(detailTaskId) : Promise.resolve(null)), [detailTaskId]);
  const { data: areas } = useQuery(() => api.area.list(), []);
  const { data: projects } = useQuery(() => api.project.list({}), []);
  const { data: goals } = useQuery(() => api.goal.list(), []);
  const { data: subtasks } = useQuery(
    () => (detailTaskId ? api.task.list({ parentId: detailTaskId, excludeStatuses: [] }) : Promise.resolve([])),
    [detailTaskId],
  );
  const [newSubtask, setNewSubtask] = useState("");

  useEffect(() => setNewSubtask(""), [detailTaskId]);

  if (!detailTaskId) return null;

  const patch = async (p: TaskPatch) => {
    await api.task.update(detailTaskId, p);
    bumpData();
  };

  const toggleGoal = async (goalId: string, linked: boolean) => {
    const current = task?.goalIds ?? [];
    await patch({ goalIds: linked ? [...current, goalId] : current.filter((g) => g !== goalId) });
  };

  const addSubtask = async () => {
    const trimmed = newSubtask.trim();
    if (!trimmed) return;
    await api.task.create({ title: trimmed, parentTaskId: detailTaskId, status: "todo" });
    setNewSubtask("");
    bumpData();
  };

  const remove = async () => {
    if (!task) return;
    if (!window.confirm(`Delete "${task.title}" permanently?`)) return;
    await api.task.remove(task.id);
    closeTaskDetail();
    bumpData();
  };

  const archive = async () => {
    if (!task) return;
    await patch({ archived: !task.archived });
    closeTaskDetail();
  };

  return (
    <aside className="detail-panel" aria-label="Task details">
      <div className="detail-head">
        <h3>Task</h3>
        <button className="icon-button" onClick={closeTaskDetail} aria-label="Close details">
          ×
        </button>
      </div>
      {!task ? (
        <p className="detail-empty">Loading…</p>
      ) : (
        <div className="detail-body">
          <TextField label="Title" value={task.title} onChange={(v) => void patch({ title: v })} />
          <div className="field-grid">
            <SelectField
              label="Status"
              value={task.status}
              onChange={(v) => void patch({ status: v as TaskStatus })}
              options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s] }))}
            />
            <SelectField
              label="Priority"
              value={task.priority}
              onChange={(v) => void patch({ priority: v as Priority })}
              options={PRIORITIES.map((p) => ({ value: p, label: `${p.toUpperCase()} · ${PRIORITY_NAMES[p]}` }))}
            />
          </div>
          <div className="field-grid">
            <SelectField
              label="Project"
              value={task.projectId ?? ""}
              onChange={(v) => void patch({ projectId: v || null })}
              options={[
                { value: "", label: "None" },
                ...(projects ?? []).map((p: Project) => ({ value: p.id, label: p.title })),
              ]}
            />
            <SelectField
              label="Life area"
              value={task.lifeAreaId ?? ""}
              onChange={(v) => void patch({ lifeAreaId: v || null })}
              options={[
                { value: "", label: "None" },
                ...(areas ?? []).map((a: LifeArea) => ({ value: a.id, label: a.name })),
              ]}
            />
          </div>
          <div className="field-label">Related goals</div>
          <div className="goal-link-list">
            {(goals ?? []).length === 0 ? <span className="field-hint">No goals yet</span> : null}
            {(goals ?? []).map((g: Goal) => (
              <label key={g.id} className="goal-link">
                <input
                  type="checkbox"
                  checked={task.goalIds.includes(g.id)}
                  onChange={(e) => void toggleGoal(g.id, e.target.checked)}
                />
                <span>{g.title}</span>
              </label>
            ))}
          </div>
          <div className="field-grid">
            <DateField
              label="Scheduled (work on)"
              value={task.scheduledDate}
              onChange={(v) => void patch({ scheduledDate: v })}
            />
            <DateField label="Due (complete by)" value={task.dueDate} onChange={(v) => void patch({ dueDate: v })} />
          </div>
          <SelectField
            label="Deadline type"
            value={task.deadlineType}
            onChange={(v) => void patch({ deadlineType: v as Task["deadlineType"] })}
            options={DEADLINE_TYPES.map((d) => ({ value: d, label: DEADLINE_LABELS[d] }))}
          />
          <label className="field">
            <span className="field-label">Description</span>
            <textarea
              className="field-input textarea"
              rows={3}
              value={task.description}
              onChange={(e) => void patch({ description: e.target.value })}
            />
          </label>
          <div className="field-grid">
            <TextField
              label="Estimated (minutes)"
              value={task.estimatedMinutes?.toString() ?? ""}
              onChange={(v) => void patch({ estimatedMinutes: v ? Number(v) : null })}
            />
            <TextField
              label="Actual (minutes)"
              value={task.actualMinutes?.toString() ?? ""}
              onChange={(v) => void patch({ actualMinutes: v ? Number(v) : null })}
            />
          </div>
          <div className="subtasks">
            <span className="field-label">Subtasks</span>
            {subtasks?.map((s) => (
              <div key={s.id} className="subtask-row">
                <input
                  type="checkbox"
                  checked={s.status === "completed"}
                  onChange={(e) => void api.task.setComplete(s.id, e.target.checked).then(bumpData)}
                />
                <span className={s.status === "completed" ? "subtask-done" : ""}>{s.title}</span>
                <button
                  className="icon-button small"
                  aria-label="Delete subtask"
                  onClick={() => void api.task.remove(s.id).then(bumpData)}
                >
                  ×
                </button>
              </div>
            ))}
            <div className="subtask-add">
              <input
                className="field-input"
                placeholder="Add subtask…"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addSubtask();
                }}
              />
            </div>
          </div>
          <div className="field-label">Notes</div>
          <NoteEditor entityType="task" entityId={task.id} />
          <div className="detail-meta">
            <span>Created {formatDate(task.createdAt.slice(0, 10))}</span>
            {task.completedAt ? <span>Completed {formatDate(task.completedAt.slice(0, 10))}</span> : null}
            {task.estimatedMinutes != null ? <span>Estimate {formatMinutes(task.estimatedMinutes)}</span> : null}
            {task.scheduledDate === todayISO() ? <span>Scheduled today</span> : null}
          </div>
          <div className="detail-actions">
            <button className="button ghost" onClick={() => void archive()}>
              {task.archived ? "Unarchive" : "Archive"}
            </button>
            <button className="button danger" onClick={() => void remove()}>
              Delete
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
