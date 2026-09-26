import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { api } from "../db";
import type { Project, Task } from "../models/types";
import { useQuery, useStore } from "../state/store";
import { addDaysISO, formatDateLong, todayISO } from "../utils/date";

/** dd.mm.yyyy, like the paper planner. */
function numericDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function AgendaRow({ task, projects }: { task: Task; projects: Project[] }) {
  const { openTaskDetail, bumpData } = useStore();
  const completed = task.status === "completed";
  return (
    <div className={`agenda-row${completed ? " completed" : ""}`}>
      <input
        type="checkbox"
        className="task-checkbox"
        checked={completed}
        aria-label={completed ? "Mark as not completed" : "Mark as completed"}
        onChange={() => void api.task.setComplete(task.id, !completed).then(bumpData)}
      />
      <button className="agenda-title" onClick={() => openTaskDetail(task.id)}>
        {task.title}
      </button>
      <select
        className="agenda-pill"
        value={task.projectId ?? ""}
        aria-label="Project"
        onChange={(e) => void api.task.update(task.id, { projectId: e.target.value || null }).then(bumpData)}
      >
        <option value="">&nbsp;</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
    </div>
  );
}

function AgendaCard({
  label,
  caption,
  tasks,
  projects,
  headerAction,
  onAdd,
}: {
  label: string;
  caption: string;
  tasks: Task[];
  projects: Project[];
  headerAction?: React.ReactNode;
  onAdd?: (title: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");

  const submit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || !onAdd) return;
    await onAdd(trimmed);
    setDraft("");
  };

  return (
    <section className="agenda-card" aria-label={label}>
      <div className="agenda-head">
        <span className="agenda-weekday">{label}</span>
        <span className="agenda-date">
          {headerAction ? headerAction : caption}
        </span>
      </div>
      <div className="agenda-body">
        <div className="agenda-rows">
          {tasks.map((task) => (
            <AgendaRow key={task.id} task={task} projects={projects} />
          ))}
          {onAdd ? (
            <div className="agenda-row agenda-add">
              <span className="agenda-checkbox-spacer" aria-hidden />
              <input
                className="agenda-add-input"
                placeholder="Add…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                aria-label={`Add task to ${label}`}
              />
              <span className="agenda-pill agenda-pill-empty" aria-hidden />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function TodayPage() {
  const { bumpData } = useStore();
  const today = todayISO();
  const { data: scheduled } = useQuery(
    () => api.task.list({ scheduledFrom: today, scheduledTo: today, excludeStatuses: ["completed", "cancelled"] }),
    [today],
  );
  const { data: dueToday } = useQuery(
    () =>
      api.task.list({
        dueFrom: today,
        dueTo: today,
        excludeStatuses: ["completed", "cancelled"],
        parentId: "none",
      }),
    [today],
  );
  const { data: overdue } = useQuery(
    () =>
      api.task.list({
        dueTo: addDaysISO(today, -1),
        dueFrom: "2000-01-01",
        excludeStatuses: ["completed", "cancelled"],
        parentId: "none",
      }),
    [today],
  );
  const { data: completed } = useQuery(
    () => api.task.list({ statuses: ["completed"], scheduledFrom: today, scheduledTo: today, parentId: "none" }),
    [today],
  );
  const { data: projects } = useQuery(() => api.project.list({}), []);

  // Tasks due today that are not already scheduled today (avoid duplicates).
  const dueOnly = (dueToday ?? []).filter((t) => t.scheduledDate !== today);
  const overdueList = (overdue ?? []).filter((t) => t.scheduledDate !== today);
  const doneToday = (completed ?? []).filter((t) => t.completedAt && t.completedAt.slice(0, 10) === today);

  const projectList = projects ?? [];

  return (
    <div className="page">
      <header className="page-header">
        <h1>{formatDateLong(today)}</h1>
        <p className="page-subtitle">What do I need to deal with today?</p>
      </header>

      {overdueList.length > 0 ? (
        <AgendaCard
          label="Overdue"
          caption={`${overdueList.length} task${overdueList.length === 1 ? "" : "s"}`}
          tasks={overdueList}
          projects={projectList}
          headerAction={
            <button
              className="button ghost small agenda-head-action"
              onClick={() =>
                overdueList.forEach((t) => void api.task.update(t.id, { scheduledDate: today }).then(bumpData))
              }
            >
              <CalendarPlus size={14} /> Move all to today
            </button>
          }
        />
      ) : null}

      <AgendaCard
        label="Today"
        caption={numericDate(today)}
        tasks={scheduled ?? []}
        projects={projectList}
        onAdd={async (title) => {
          await api.task.create({ title, scheduledDate: today, status: "todo" });
          bumpData();
        }}
      />

      {dueOnly.length > 0 ? (
        <AgendaCard
          label="Due today"
          caption={numericDate(today)}
          tasks={dueOnly}
          projects={projectList}
          onAdd={async (title) => {
            await api.task.create({ title, dueDate: today, status: "todo" });
            bumpData();
          }}
        />
      ) : null}

      {doneToday.length > 0 ? (
        <AgendaCard
          label="Completed"
          caption={`${doneToday.length} done`}
          tasks={doneToday}
          projects={projectList}
        />
      ) : null}
    </div>
  );
}
