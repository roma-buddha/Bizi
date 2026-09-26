import { useState, type CSSProperties, type ReactNode } from "react";
import { Columns2, Columns3, Square } from "lucide-react";
import type { Goal, Project, Task } from "../models/types";
import { api } from "../db";
import { useStore } from "../state/store";
import { projectProgress } from "../utils/calc";
import { ProgressBar } from "./ui";

export type BucketCols = 3 | 2 | 1;

/** Density preference, persisted per page. */
export function useBucketCols(storageKey: string): [BucketCols, (cols: BucketCols) => void] {
  const [cols, setCols] = useState<BucketCols>(() => {
    const saved = Number(localStorage.getItem(storageKey));
    return saved === 1 || saved === 2 ? (saved as BucketCols) : 3;
  });
  const set = (next: BucketCols) => {
    setCols(next);
    try {
      localStorage.setItem(storageKey, String(next));
    } catch {
      // storage unavailable
    }
  };
  return [cols, set];
}

const DENSITY_OPTIONS: { value: BucketCols; icon: ReactNode; label: string }[] = [
  { value: 3, icon: <Columns3 size={15} />, label: "Three per row" },
  { value: 2, icon: <Columns2 size={15} />, label: "Two per row" },
  { value: 1, icon: <Square size={15} />, label: "One per row" },
];

export function BucketDensityToggle({ value, onChange }: { value: BucketCols; onChange: (cols: BucketCols) => void }) {
  return (
    <div className="chip-group" role="group" aria-label="Projects per row">
      {DENSITY_OPTIONS.map((option) => (
        <button
          key={option.value}
          className={`chip icon-chip${value === option.value ? " active" : ""}`}
          title={option.label}
          aria-label={option.label}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

function BucketShell({
  cols,
  children,
}: {
  cols: BucketCols;
  children: ReactNode;
}) {
  return (
    <div className="bucket-grid" style={{ "--bucket-cols": cols } as CSSProperties}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Projects: one column per project, its open tasks as a checklist.    */
/* ------------------------------------------------------------------ */

function BucketTaskRow({ task }: { task: Task }) {
  const { openTaskDetail, bumpData } = useStore();
  const completed = task.status === "completed";
  return (
    <div className="bucket-row" onClick={() => openTaskDetail(task.id)}>
      <input
        type="checkbox"
        className="task-checkbox"
        checked={completed}
        aria-label={completed ? "Mark as not completed" : "Mark as completed"}
        onClick={(e) => e.stopPropagation()}
        onChange={() => void api.task.setComplete(task.id, !completed).then(bumpData)}
      />
      <span className="bucket-row-title">{task.title}</span>
    </div>
  );
}

function BucketQuickAdd({ projectId, lifeAreaId }: { projectId: string; lifeAreaId: string | null }) {
  const { bumpData } = useStore();
  const [title, setTitle] = useState("");

  const add = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await api.task.create({ title: trimmed, projectId, lifeAreaId, status: "todo" });
    setTitle("");
    bumpData();
  };

  return (
    <div className="bucket-add">
      <input
        value={title}
        placeholder="Add task…"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void add();
        }}
        onBlur={() => void add()}
        aria-label="Add task to project"
      />
    </div>
  );
}

export function ProjectBuckets({
  projects,
  tasks,
  cols,
}: {
  projects: Project[];
  tasks: Task[];
  cols: BucketCols;
}) {
  const { navigate } = useStore();
  const all = tasks ?? [];
  return (
    <BucketShell cols={cols}>
      {projects.map((project) => {
        const openTasks = all.filter(
          (t) => t.projectId === project.id && t.status !== "completed" && t.status !== "cancelled",
        );
        const doneCount = all.filter((t) => t.projectId === project.id && t.status === "completed").length;
        const progress = projectProgress(project, all);
        return (
          <section key={project.id} className="bucket" aria-label={project.title}>
            <button className="bucket-head" onClick={() => navigate({ kind: "project", id: project.id })}>
              <span className="bucket-title">{project.title}</span>
              <span className="bucket-progress">
                <ProgressBar value={progress} />
                <span className="goal-progress-num">
                  {progress}%{doneCount > 0 ? ` · ${doneCount} done` : ""}
                </span>
              </span>
            </button>
            <div className="bucket-body">
              {openTasks.length === 0 ? <p className="bucket-empty">No open tasks</p> : null}
              {openTasks.map((task) => (
                <BucketTaskRow key={task.id} task={task} />
              ))}
              <BucketQuickAdd projectId={project.id} lifeAreaId={project.lifeAreaId} />
            </div>
          </section>
        );
      })}
    </BucketShell>
  );
}

/* ------------------------------------------------------------------ */
/* Goals: one column per goal, its linked projects as a checklist.     */
/* ------------------------------------------------------------------ */

export function GoalBuckets({
  goals,
  projects,
  tasks,
  cols,
}: {
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  cols: BucketCols;
}) {
  const { navigate, bumpData } = useStore();
  const allProjects = projects ?? [];
  const allTasks = tasks ?? [];

  const progressOf = (goal: Goal) => {
    if (goal.progressMode === "manual") return goal.manualProgress;
    const linked = allProjects.filter((p) => goal.projectIds.includes(p.id));
    if (linked.length === 0) return 0;
    const avg = linked.reduce((sum, p) => sum + projectProgress(p, allTasks), 0) / linked.length;
    return Math.round(avg);
  };

  return (
    <BucketShell cols={cols}>
      {goals.map((goal) => {
        const linked = allProjects.filter((p) => goal.projectIds.includes(p.id));
        const progress = progressOf(goal);
        return (
          <section key={goal.id} className="bucket" aria-label={goal.title}>
            <button className="bucket-head" onClick={() => navigate({ kind: "goal", id: goal.id })}>
              <span className="bucket-title">{goal.title}</span>
              <span className="bucket-progress">
                <ProgressBar value={progress} />
                <span className="goal-progress-num">{progress}%</span>
              </span>
            </button>
            <div className="bucket-body">
              {linked.length === 0 ? <p className="bucket-empty">No linked projects</p> : null}
              {linked.map((project) => {
                const completed = project.status === "completed";
                return (
                  <div key={project.id} className="bucket-row" onClick={() => navigate({ kind: "project", id: project.id })}>
                    <input
                      type="checkbox"
                      className="task-checkbox"
                      checked={completed}
                      aria-label={completed ? "Mark project as not completed" : "Mark project as completed"}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() =>
                        void api.project
                          .update(project.id, { status: completed ? "active" : "completed" })
                          .then(bumpData)
                      }
                    />
                    <span className="bucket-row-title">{project.title}</span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </BucketShell>
  );
}
