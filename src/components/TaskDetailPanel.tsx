import { useEffect } from "react";
import { X } from "lucide-react";
import { api } from "../db";
import type { LifeArea, Priority, Project, TaskPatch, TaskStatus } from "../models/types";
import { PRIORITIES, PRIORITY_NAMES, TASK_STATUSES, TASK_STATUS_LABELS } from "../models/types";
import { useQuery, useStore } from "../state/store";
import { formatDate, todayISO } from "../utils/date";
import { DateField, SelectField, TextField } from "./ui";

export function TaskDetailPanel() {
  const { detailTaskId, closeTaskDetail, bumpData } = useStore();
  const { data: task } = useQuery(
    () => (detailTaskId ? api.task.get(detailTaskId) : Promise.resolve(null)),
    [detailTaskId],
  );
  const { data: areas } = useQuery(() => api.area.list(), []);
  const { data: projects } = useQuery(() => api.project.list({}), []);

  useEffect(() => {
    if (!detailTaskId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target?.isContentEditable ?? false);
      if (!typing) closeTaskDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailTaskId, closeTaskDetail]);

  if (!detailTaskId) return null;

  const patch = async (p: TaskPatch) => {
    await api.task.update(detailTaskId, p);
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
        <button className="detail-close" onClick={closeTaskDetail} aria-label="Close details" title="Close (Esc)">
          <X size={15} aria-hidden />
          <span>Close</span>
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
          <div className="field-grid">
            <DateField
              label="Scheduled (work on)"
              value={task.scheduledDate}
              onChange={(v) => void patch({ scheduledDate: v })}
            />
            <DateField label="Due (complete by)" value={task.dueDate} onChange={(v) => void patch({ dueDate: v })} />
          </div>
          <label className="field">
            <span className="field-label">Description</span>
            <textarea
              className="field-input textarea"
              rows={4}
              value={task.description}
              onChange={(e) => void patch({ description: e.target.value })}
            />
          </label>
          <div className="detail-meta">
            <span>Created {formatDate(task.createdAt.slice(0, 10))}</span>
            {task.completedAt ? <span>Completed {formatDate(task.completedAt.slice(0, 10))}</span> : null}
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
