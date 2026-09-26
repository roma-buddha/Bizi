import { useMemo, useState } from "react";
import { BucketDensityToggle, ProjectBuckets, useBucketCols } from "../components/Buckets";
import { ProjectsGantt } from "../components/Gantt";
import { api } from "../db";
import type {
  LifeArea,
  Priority,
  Project,
  ProjectFilter,
  ProjectStatus,
} from "../models/types";
import {
  PRIORITIES,
  PRIORITY_NAMES,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
} from "../models/types";
import { useQuery, useStore } from "../state/store";
import { projectProgress } from "../utils/calc";
import { formatDate } from "../utils/date";
import { NoteEditor } from "../components/NoteEditor";
import { TaskList } from "../components/TaskList";
import {
  DateField,
  EmptyState,
  Modal,
  PriorityBadge,
  ProgressBar,
  SectionTitle,
  SelectField,
  Tabs,
  TextField,
} from "../components/ui";

export function ProjectsPage() {
  const { navigate, bumpData } = useStore();
  const [view, setView] = useState<"list" | "board" | "buckets" | "gantt">("buckets");
  const [bucketCols, setBucketCols] = useBucketCols("bizi.bucket-cols.projects");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [areaFilter, setAreaFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const { data: projects } = useQuery<Project[]>(() => api.project.list({}), []);
  const { data: areas } = useQuery(() => api.area.list(), []);
  const { data: tasks } = useQuery(() => api.task.list({}), []);

  const filter: ProjectFilter = {};
  if (statusFilter !== "all") filter.statuses = [statusFilter];
  if (areaFilter) filter.areaId = areaFilter;

  const filtered = useMemo(() => {
    let rows = projects ?? [];
    if (filter.statuses) rows = rows.filter((p) => filter.statuses!.includes(p.status));
    if (filter.areaId) rows = rows.filter((p) => p.lifeAreaId === filter.areaId);
    return rows;
  }, [projects, filter.statuses, filter.areaId]);

  const progressOf = (p: Project) => projectProgress(p, tasks ?? []);

  return (
    <div className="page wide">
      <header className="page-header with-action">
        <div>
          <h1>Projects</h1>
          <p className="page-subtitle">Temporary initiatives with a desired outcome.</p>
        </div>
        <div className="header-actions">
          <div className="chip-group">
            <button className={`chip${view === "buckets" ? " active" : ""}`} onClick={() => setView("buckets")}>
              Buckets
            </button>
            <button className={`chip${view === "list" ? " active" : ""}`} onClick={() => setView("list")}>
              List
            </button>
            <button className={`chip${view === "board" ? " active" : ""}`} onClick={() => setView("board")}>
              Board
            </button>
            <button className={`chip${view === "gantt" ? " active" : ""}`} onClick={() => setView("gantt")}>
              Gantt
            </button>
          </div>
          {view === "buckets" ? <BucketDensityToggle value={bucketCols} onChange={setBucketCols} /> : null}
          <button className="button primary" onClick={() => setCreating(true)}>
            New project
          </button>
        </div>
      </header>

      <div className="filter-bar">
        <button className={`chip${statusFilter === "all" ? " active" : ""}`} onClick={() => setStatusFilter("all")}>
          All
        </button>
        {PROJECT_STATUSES.map((s) => (
          <button
            key={s}
            className={`chip${statusFilter === s ? " active" : ""}`}
            onClick={() => setStatusFilter(s)}
          >
            {PROJECT_STATUS_LABELS[s]}
          </button>
        ))}
        <select className="chip-select" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} aria-label="Filter by area">
          <option value="">All areas</option>
          {areas?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No projects here."
          action={
            <button className="button primary" onClick={() => setCreating(true)}>
              Create Project
            </button>
          }
        />
      ) : view === "buckets" ? (
        <ProjectBuckets projects={filtered} tasks={tasks ?? []} cols={bucketCols} />
      ) : view === "gantt" ? (
        <ProjectsGantt projects={filtered} areas={areas ?? []} />
      ) : view === "list" ? (
        <div className="project-table">
          <div className="project-row project-row-head">
            <span>Project</span>
            <span>Area</span>
            <span>Status</span>
            <span>Priority</span>
            <span>Target</span>
            <span>Progress</span>
          </div>
          {filtered.map((p) => (
            <button key={p.id} className="project-row" onClick={() => navigate({ kind: "project", id: p.id })}>
              <span className="project-title">{p.title}</span>
              <span className="muted">{p.areaName ?? "—"}</span>
              <span>{PROJECT_STATUS_LABELS[p.status]}</span>
              <span>
                <PriorityBadge priority={p.priority} />
              </span>
              <span className="muted">{p.targetDate ? formatDate(p.targetDate) : "—"}</span>
              <span className="goal-progress">
                <ProgressBar value={progressOf(p)} />
                <span className="goal-progress-num">{progressOf(p)}%</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="board">
          {PROJECT_STATUSES.filter((s) => s !== "idea" && s !== "cancelled").map((status) => {
            const column = filtered.filter((p) => p.status === status);
            return (
              <div key={status} className="board-column">
                <div className="board-column-head">
                  {PROJECT_STATUS_LABELS[status]}
                  <span className="board-count">{column.length}</span>
                </div>
                {column.map((p) => (
                  <button key={p.id} className="board-card" onClick={() => navigate({ kind: "project", id: p.id })}>
                    <span className="board-card-title">{p.title}</span>
                    <span className="board-card-meta">
                      {p.areaName ?? "No area"}
                      {p.targetDate ? ` · ${formatDate(p.targetDate)}` : ""}
                    </span>
                    <span className="goal-progress">
                      <ProgressBar value={progressOf(p)} />
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {creating ? (
        <ProjectModal
          areas={areas ?? []}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            bumpData();
          }}
        />
      ) : null}
    </div>
  );
}

export function ProjectModal({
  areas,
  onClose,
  onSaved,
  initial,
}: {
  areas: LifeArea[];
  onClose: () => void;
  onSaved: () => void;
  initial?: Project;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [lifeAreaId, setLifeAreaId] = useState(initial?.lifeAreaId ?? "");
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? "planned");
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "p3");
  const [startDate, setStartDate] = useState(initial?.startDate ?? null);
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? null);

  const save = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const payload = {
      title: trimmed,
      lifeAreaId: lifeAreaId || null,
      status,
      priority,
      startDate,
      targetDate,
    };
    if (initial) await api.project.update(initial.id, payload);
    else await api.project.create(payload);
    onSaved();
  };

  return (
    <Modal title={initial ? "Edit project" : "New project"} onClose={onClose} width={440}>
      <TextField label="Title" value={title} onChange={setTitle} autoFocus onEnter={() => void save()} />
      <div className="field-grid">
        <SelectField
          label="Life area"
          value={lifeAreaId}
          onChange={setLifeAreaId}
          options={[
            { value: "", label: "None" },
            ...areas.map((a) => ({ value: a.id, label: a.name })),
          ]}
        />
        <SelectField
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as ProjectStatus)}
          options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] }))}
        />
      </div>
      <div className="field-grid">
        <SelectField
          label="Priority"
          value={priority}
          onChange={(v) => setPriority(v as Priority)}
          options={PRIORITIES.map((p) => ({ value: p, label: `${p.toUpperCase()} · ${PRIORITY_NAMES[p]}` }))}
        />
        <span />
      </div>
      <div className="field-grid">
        <DateField label="Start date" value={startDate} onChange={setStartDate} />
        <DateField label="Target date" value={targetDate} onChange={setTargetDate} />
      </div>
      <div className="detail-actions">
        <button className="button ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="button primary" disabled={!title.trim()} onClick={() => void save()}>
          Save
        </button>
      </div>
    </Modal>
  );
}

export function ProjectDetailPage({ id }: { id: string }) {
  const { navigate, bumpData } = useStore();
  const [tab, setTab] = useState("tasks");
  const [editing, setEditing] = useState(false);
  const [newTask, setNewTask] = useState("");
  const { data: project } = useQuery(
    () => api.project.list({ includeArchived: true }).then((list) => list.find((p) => p.id === id) ?? null),
    [id],
  );
  const { data: areas } = useQuery(() => api.area.list(), [id]);
  const { data: tasks } = useQuery(() => api.task.list({ projectId: id, excludeStatuses: [], parentId: "none" }), [id]);

  const openTasks = (tasks ?? []).filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const completedTasks = (tasks ?? []).filter((t) => t.status === "completed");

  if (!project) return <div className="page" />;

  const progress =
    project.progressMode === "manual"
      ? project.manualProgress
      : project.totalTasks === 0
        ? 0
        : Math.round(((project.totalTasks - project.openTasks) / project.totalTasks) * 100);

  const addTask = async () => {
    const trimmed = newTask.trim();
    if (!trimmed) return;
    await api.task.create({ title: trimmed, projectId: id, lifeAreaId: project.lifeAreaId, status: "todo" });
    setNewTask("");
    bumpData();
  };

  const archive = async () => {
    await api.project.update(id, { archived: !project.archived });
    bumpData();
    if (!project.archived) navigate({ kind: "projects" });
  };

  const remove = async () => {
    if (!window.confirm(`Delete project "${project.title}" and all its tasks?`)) return;
    await api.project.remove(id);
    bumpData();
    navigate({ kind: "projects" });
  };

  return (
    <div className="page">
      <header className="page-header with-action">
        <div>
          <h1>{project.title}</h1>
          <p className="page-subtitle">
            {project.areaName ?? "No area"}
            {project.targetDate ? ` · Target ${formatDate(project.targetDate)}` : ""}
          </p>
        </div>
        <div className="header-actions">
          <span className="goal-progress">
            <ProgressBar value={progress} />
            <span className="goal-progress-num">{progress}%</span>
          </span>
          <button className="button ghost" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      </header>

      <Tabs
        tabs={[
          { id: "tasks", label: `Tasks (${openTasks.length})` },
          { id: "overview", label: "Overview" },
          { id: "timeline", label: "Timeline" },
          { id: "notes", label: "Notes" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "tasks" ? (
        <div className="stack">
          <div className="inbox-capture">
            <input
              className="inbox-input"
              placeholder="Add a task to this project…"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addTask();
              }}
            />
            <button className="button primary" disabled={!newTask.trim()} onClick={() => void addTask()}>
              Add
            </button>
          </div>
          <SectionTitle>Open tasks</SectionTitle>
          <TaskList tasks={openTasks} emptyTitle="No open tasks." />
          {completedTasks.length > 0 ? (
            <>
              <SectionTitle>Completed</SectionTitle>
              <TaskList tasks={completedTasks} emptyTitle="" />
            </>
          ) : null}
        </div>
      ) : null}

      {tab === "overview" ? (
        <div className="stack">
          <section>
            <SectionTitle>Description</SectionTitle>
            <p
              className="editable-text"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="What is the desired outcome?"
              onBlur={(e) => {
                const description = e.currentTarget.textContent?.trim() ?? "";
                if (description !== project.description)
                  void api.project.update(id, { description }).then(bumpData);
              }}
            >
              {project.description}
            </p>
          </section>
          <section>
            <SectionTitle>Status &amp; dates</SectionTitle>
            <div className="field-grid">
              <SelectField
                label="Status"
                value={project.status}
                onChange={(v) => void api.project.update(id, { status: v as ProjectStatus }).then(bumpData)}
                options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] }))}
              />
              <span />
            </div>
            <div className="field-grid">
              <DateField
                label="Start date"
                value={project.startDate}
                onChange={(v) => void api.project.update(id, { startDate: v }).then(bumpData)}
              />
              <DateField
                label="Target date"
                value={project.targetDate}
                onChange={(v) => void api.project.update(id, { targetDate: v }).then(bumpData)}
              />
            </div>
          </section>
          <section>
            <SectionTitle>Linked goals</SectionTitle>
            <GoalLinks projectId={id} goalIds={project.goalIds} />
          </section>
          <section className="detail-actions">
            <button className="button ghost" onClick={() => void archive()}>
              {project.archived ? "Unarchive" : "Archive project"}
            </button>
            <button className="button danger" onClick={() => void remove()}>
              Delete project
            </button>
          </section>
        </div>
      ) : null}

      {tab === "timeline" ? (
        <div className="timeline">
          {project.startDate ? <div className="timeline-item">Started {formatDate(project.startDate)}</div> : null}
          {project.targetDate ? (
            <div className="timeline-item">Target {formatDate(project.targetDate)}</div>
          ) : null}
          {(tasks ?? [])
            .filter((t) => t.dueDate != null)
            .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
            .map((t) => (
              <div key={t.id} className="timeline-item">
                {formatDate(t.dueDate)} — {t.title}
              </div>
            ))}
        </div>
      ) : null}

      {tab === "notes" ? (
        <NoteEditor entityType="project" entityId={id} placeholder={`Notes about ${project.title}…`} />
      ) : null}

      {editing ? (
        <ProjectModal
          areas={areas ?? []}
          initial={project}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            bumpData();
          }}
        />
      ) : null}
    </div>
  );
}

function GoalLinks({ projectId, goalIds }: { projectId: string; goalIds: string[] }) {
  const { bumpData, navigate } = useStore();
  const { data: goals } = useQuery(() => api.goal.list(), [projectId]);
  const toggle = async (goalId: string, linked: boolean) => {
    const next = linked ? [...goalIds, goalId] : goalIds.filter((g) => g !== goalId);
    await api.project.update(projectId, { goalIds: next });
    bumpData();
  };
  return (
    <div>
      {(goals ?? []).map((g) => (
        <label key={g.id} className="goal-link">
          <input type="checkbox" checked={goalIds.includes(g.id)} onChange={(e) => void toggle(g.id, e.target.checked)} />
          <button
            className="link-inline"
            onClick={(e) => {
              e.preventDefault();
              navigate({ kind: "goal", id: g.id });
            }}
          >
            {g.title}
          </button>
        </label>
      ))}
    </div>
  );
}
