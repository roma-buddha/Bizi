import { ArrowLeft, Columns2, Columns3, Square } from "lucide-react";
import { useMemo, useState } from "react";
import {
  BucketDensityToggle,
  DateField,
  EmptyState,
  EntityIcon,
  IconPicker,
  ColorPicker,
  Modal,
  ProgressBar,
  SectionTitle,
  SelectField,
  SelectMenu,
  Tabs,
  TextField,
  densityStyle,
  useBucketCols,
  type BucketCols,
} from "../components/ui";
import { ProjectsBoard, ProjectsGantt } from "./ProjectViews";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  useStore,
  type AreaItem,
  type DailyTask,
  type ProjectItem,
  type ProjectStatus,
} from "../state/store";
import { numericDate, todayISO } from "../utils/date";

interface FlatTask {
  task: DailyTask;
  dateISO: string;
}

/** All non-archived tasks across every day, tagged with their day. */
function useFlatTasks(): FlatTask[] {
  const { byDay } = useStore();
  return useMemo(
    () =>
      Object.entries(byDay).flatMap(([dateISO, tasks]) =>
        tasks.filter((t) => !t.archived).map((task) => ({ task, dateISO })),
      ),
    [byDay],
  );
}

/** Checkbox task rows that open the right detail panel, planner styling. */
function TaskRows({ tasks }: { tasks: FlatTask[] }) {
  const { toggleTask, openDetail } = useStore();
  return (
    <div className="agenda-rows">
      {tasks.map(({ task, dateISO }) => (
        <div key={task.id} className={`agenda-row${task.status === "done" ? " completed" : ""}`}>
          <input
            type="checkbox"
            className="task-checkbox"
            checked={task.status === "done"}
            aria-label={task.status === "done" ? "Mark as not done" : "Mark as done"}
            onChange={() => toggleTask(dateISO, task.id)}
          />
          <button className="agenda-title" onClick={() => openDetail({ dateISO, id: task.id })}>
            {task.title}
          </button>
          <span className="entity-task-day">{numericDate(dateISO)}</span>
        </div>
      ))}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="entity-back" onClick={onClick} aria-label="Back to list">
      <ArrowLeft size={15} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Areas                                                               */
/* ------------------------------------------------------------------ */

function AreaModal({ onClose }: { onClose: () => void }) {
  const { addArea, openArea } = useStore();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("briefcase");
  const [color, setColor] = useState("amber");

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = addArea({ title: trimmed, icon, color });
    setName("");
    onClose();
    openArea(id);
  };

  return (
    <Modal title="New life area" onClose={onClose} width={420}>
      <TextField label="Name" value={name} onChange={setName} autoFocus onEnter={create} />
      <div className="field-label">Icon</div>
      <IconPicker value={icon} onChange={setIcon} />
      <div className="field-label">Color</div>
      <ColorPicker value={color} onChange={setColor} />
      <div className="detail-actions">
        <button className="button ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="button primary" disabled={!name.trim()} onClick={create}>
          Create
        </button>
      </div>
    </Modal>
  );
}

function AreaDetailPage({ area }: { area: AreaItem }) {
  const { projects, updateArea, deleteArea, openArea, setSection, openProject } = useStore();
  const flat = useFlatTasks();
  const [tab, setTab] = useState("overview");

  const areaProjects = projects.filter((p) => p.areaId === area.id && !p.archived);
  const areaTasks = flat.filter(({ task }) => task.areaId === area.id);
  const activeTasks = areaTasks.filter(({ task }) => task.status !== "done");
  const upcoming = activeTasks
    .filter(({ task }) => task.scheduledDate != null)
    .sort((a, b) => (a.task.scheduledDate! < b.task.scheduledDate! ? -1 : 1))
    .slice(0, 5);

  const remove = () => {
    if (!window.confirm(`Delete area "${area.title}"? Projects and tasks keep their data.`)) return;
    deleteArea(area.id);
    openArea(null);
  };

  return (
    <div className="page">
      <header className="page-header with-action">
        <div className="entity-header">
          <BackButton onClick={() => openArea(null)} />
          <span className="entity-icon" data-color={area.color}>
            <EntityIcon name={area.icon} size={20} />
          </span>
          <div>
            <h1
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => {
                const title = e.currentTarget.textContent?.trim();
                if (title && title !== area.title) updateArea(area.id, { title });
              }}
            >
              {area.title}
            </h1>
            <p
              className="page-subtitle"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Add a short description…"
              onBlur={(e) => {
                const description = e.currentTarget.textContent?.trim() ?? "";
                if (description !== area.description) updateArea(area.id, { description });
              }}
            >
              {area.description}
            </p>
          </div>
        </div>
        <button className="button ghost" onClick={remove}>
          Delete
        </button>
      </header>

      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "projects", label: `Projects (${areaProjects.length})` },
          { id: "tasks", label: `Tasks (${activeTasks.length})` },
          { id: "notes", label: "Notes" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "overview" ? (
        <div className="stack">
          <section>
            <SectionTitle>Active projects</SectionTitle>
            {areaProjects.length === 0 ? (
              <p className="muted">No projects in {area.title}.</p>
            ) : (
              <div className="link-list">
                {areaProjects.map((p) => (
                  <button
                    key={p.id}
                    className="link-row"
                    onClick={() => {
                      setSection("projects");
                      openProject(p.id);
                    }}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            )}
          </section>
          <section>
            <SectionTitle>Upcoming tasks</SectionTitle>
            {upcoming.length === 0 ? (
              <p className="muted">No scheduled tasks.</p>
            ) : (
              <TaskRows tasks={upcoming} />
            )}
          </section>
        </div>
      ) : null}

      {tab === "projects" ? (
        areaProjects.length === 0 ? (
          <p className="muted">No projects in this area yet.</p>
        ) : (
          <div className="link-list">
            {areaProjects.map((p) => (
              <button
                key={p.id}
                className="link-row"
                onClick={() => {
                  setSection("projects");
                  openProject(p.id);
                }}
              >
                {p.title}
              </button>
            ))}
          </div>
        )
      ) : null}

      {tab === "tasks" ? (
        areaTasks.length === 0 ? (
          <p className="muted">No tasks in this area yet.</p>
        ) : (
          <TaskRows tasks={areaTasks} />
        )
      ) : null}

      {tab === "notes" ? (
        <textarea
          className="field-input textarea notes-editor"
          rows={10}
          placeholder={`Notes about ${area.title}…`}
          value={area.notes}
          onChange={(e) => updateArea(area.id, { notes: e.target.value })}
        />
      ) : null}
    </div>
  );
}

export function AreasPage() {
  const { areas, projects, selectedAreaId, openArea } = useStore();
  const [creating, setCreating] = useState(false);
  const [cols, setCols] = useBucketCols("bizi.grid-cols.areas");
  const flat = useFlatTasks();

  const selected = areas.find((a) => a.id === selectedAreaId) ?? null;
  if (selected) return <AreaDetailPage area={selected} />;

  return (
    <div className="page">
      <header className="page-header with-action">
        <div>
          <h1>Life Areas</h1>
          <p className="page-subtitle">Permanent domains of your life.</p>
        </div>
        <div className="header-actions">
          <BucketDensityToggle value={cols} onChange={setCols} />
          <button className="button primary" onClick={() => setCreating(true)}>
            New area
          </button>
        </div>
      </header>

      {areas.length === 0 ? (
        <EmptyState
          title="No life areas yet."
          hint="Areas are the broadest level: Business, Health, Research…"
          action={
            <button className="button primary" onClick={() => setCreating(true)}>
              Create Area
            </button>
          }
        />
      ) : (
        <div className="area-grid" style={densityStyle(cols)}>
          {areas.map((area) => {
            const areaProjects = projects.filter((p) => p.areaId === area.id && !p.archived).length;
            const openTasks = flat.filter(
              ({ task }) => task.areaId === area.id && task.status !== "done",
            ).length;
            return (
              <button key={area.id} className="area-card" onClick={() => openArea(area.id)}>
                <span className="area-card-icon" data-color={area.color}>
                  <EntityIcon name={area.icon} size={18} />
                </span>
                <span className="area-card-name">{area.title}</span>
                <span className="area-card-meta">
                  {areaProjects} projects · {openTasks} open tasks
                </span>
              </button>
            );
          })}
        </div>
      )}

      {creating ? <AreaModal onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

function ProjectModal({
  onClose,
  initial,
}: {
  onClose: () => void;
  initial?: ProjectItem;
}) {
  const { addProject, updateProject, areas } = useStore();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [areaId, setAreaId] = useState(initial?.areaId ?? "");
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? "planned");
  const [startDate, setStartDate] = useState(initial?.startDate ?? null);
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? null);

  const save = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const payload = {
      title: trimmed,
      areaId: areaId || null,
      status,
      startDate,
      targetDate,
    };
    if (initial) updateProject(initial.id, payload);
    else addProject(payload);
    onClose();
  };

  return (
    <Modal title={initial ? "Edit project" : "New project"} onClose={onClose} width={440}>
      <TextField label="Title" value={title} onChange={setTitle} autoFocus onEnter={save} />
      <div className="field-grid">
        <SelectField
          label="Life area"
          value={areaId}
          onChange={setAreaId}
          options={[
            { value: "", label: "None" },
            ...areas.map((a) => ({ value: a.id, label: a.title })),
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
        <DateField label="Start date" value={startDate} onChange={setStartDate} />
        <DateField label="Target date" value={targetDate} onChange={setTargetDate} />
      </div>
      <div className="detail-actions">
        <button className="button ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="button primary" disabled={!title.trim()} onClick={save}>
          Save
        </button>
      </div>
    </Modal>
  );
}

function progressOf(projectId: string, flat: FlatTask[]): number {
  const tasks = flat.filter(({ task }) => task.projectId === projectId);
  if (tasks.length === 0) return 0;
  const done = tasks.filter(({ task }) => task.status === "done").length;
  return Math.round((done / tasks.length) * 100);
}

function ProjectDetailPage({ project }: { project: ProjectItem }) {
  const {
    areas,
    updateProject,
    deleteProject,
    openProject,
    addTask,
    deleteTask,
    byDay,
  } = useStore();
  const flat = useFlatTasks();
  const [tab, setTab] = useState("tasks");
  const [editing, setEditing] = useState(false);
  const [newTask, setNewTask] = useState("");

  const projectTasks = flat.filter(({ task }) => task.projectId === project.id);
  const openTasks = projectTasks.filter(({ task }) => task.status !== "done");
  const completedTasks = projectTasks.filter(({ task }) => task.status === "done");
  const progress = progressOf(project.id, flat);
  const area = areas.find((a) => a.id === project.areaId) ?? null;

  const addTaskToProject = () => {
    const trimmed = newTask.trim();
    if (!trimmed) return;
    addTask(todayISO(), trimmed, { projectId: project.id, areaId: project.areaId });
    setNewTask("");
  };

  const archive = () => {
    updateProject(project.id, { archived: !project.archived });
    if (!project.archived) openProject(null);
  };

  const remove = () => {
    if (!window.confirm(`Delete project "${project.title}" and all its tasks?`)) return;
    for (const [day, tasks] of Object.entries(byDay)) {
      for (const t of tasks) {
        if (t.projectId === project.id) deleteTask(day, t.id);
      }
    }
    deleteProject(project.id);
    openProject(null);
  };

  return (
    <div className="page">
      <header className="page-header with-action">
        <div className="entity-header">
          <BackButton onClick={() => openProject(null)} />
          <span className="entity-icon" data-color={project.color}>
            <EntityIcon name={project.icon} size={20} />
          </span>
          <div>
            <h1
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => {
                const title = e.currentTarget.textContent?.trim();
                if (title && title !== project.title) updateProject(project.id, { title });
              }}
            >
              {project.title}
            </h1>
            <p className="page-subtitle">
              {area ? area.title : "No area"}
              {project.targetDate ? ` · Target ${numericDate(project.targetDate)}` : ""}
            </p>
          </div>
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
                if (e.key === "Enter") addTaskToProject();
              }}
            />
            <button className="button primary" disabled={!newTask.trim()} onClick={addTaskToProject}>
              Add
            </button>
          </div>
          <SectionTitle>Open tasks</SectionTitle>
          {openTasks.length === 0 ? (
            <p className="muted">No open tasks.</p>
          ) : (
            <TaskRows tasks={openTasks} />
          )}
          {completedTasks.length > 0 ? (
            <>
              <SectionTitle>Completed</SectionTitle>
              <TaskRows tasks={completedTasks} />
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
                  updateProject(project.id, { description });
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
                onChange={(v) => updateProject(project.id, { status: v as ProjectStatus })}
                options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] }))}
              />
              <span />
            </div>
            <div className="field-grid">
              <DateField
                label="Start date"
                value={project.startDate}
                onChange={(v) => updateProject(project.id, { startDate: v })}
              />
              <DateField
                label="Target date"
                value={project.targetDate}
                onChange={(v) => updateProject(project.id, { targetDate: v })}
              />
            </div>
          </section>
          <section className="detail-actions">
            <button className="button ghost" onClick={archive}>
              {project.archived ? "Unarchive" : "Archive project"}
            </button>
            <button className="button danger" onClick={remove}>
              Delete project
            </button>
          </section>
        </div>
      ) : null}

      {tab === "notes" ? (
        <textarea
          className="field-input textarea notes-editor"
          rows={10}
          placeholder={`Notes about ${project.title}…`}
          value={project.notes}
          onChange={(e) => updateProject(project.id, { notes: e.target.value })}
        />
      ) : null}

      {editing ? <ProjectModal onClose={() => setEditing(false)} initial={project} /> : null}
    </div>
  );
}

type ProjectsView = "cards" | "board" | "gantt";

const VIEW_OPTIONS: { id: ProjectsView; label: string }[] = [
  { id: "cards", label: "Cards" },
  { id: "board", label: "Board" },
  { id: "gantt", label: "Gantt" },
];

export function ProjectsPage() {
  const { projects, areas, selectedProjectId, openProject } = useStore();
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<ProjectsView>("cards");
  const [cols, setCols] = useBucketCols("bizi.grid-cols.projects");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [areaFilter, setAreaFilter] = useState("");
  const flat = useFlatTasks();

  const selected = projects.find((p) => p.id === selectedProjectId) ?? null;
  if (selected) return <ProjectDetailPage project={selected} />;

  const filtered = projects.filter((p) => {
    if (p.archived) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (areaFilter && p.areaId !== areaFilter) return false;
    return true;
  });

  const densityIcon = cols === 3 ? <Columns3 size={14} /> : cols === 2 ? <Columns2 size={14} /> : <Square size={14} />;

  return (
    <div className="page wide">
      <header className="page-header with-action">
        <div>
          <h1>Projects</h1>
          <p className="page-subtitle">Temporary initiatives with a desired outcome.</p>
        </div>
        <div className="header-actions">
          <div className="chip-group">
            {VIEW_OPTIONS.map((v) => (
              <button
                key={v.id}
                className={`chip${view === v.id ? " active" : ""}`}
                onClick={() => setView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
          {view === "cards" ? (
            <SelectMenu
              value={String(cols)}
              options={[
                { value: "3", label: "Three per row" },
                { value: "2", label: "Two per row" },
                { value: "1", label: "One per row" },
              ]}
              onChange={(v) => setCols(Number(v) as BucketCols)}
              icon={densityIcon}
              ariaLabel="Cards per row"
            />
          ) : null}
          <button className="button primary" onClick={() => setCreating(true)}>
            New project
          </button>
        </div>
      </header>

      <div className="filter-bar">
        <SelectMenu
          value={statusFilter}
          options={[
            { value: "all", label: "All statuses" },
            ...PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] })),
          ]}
          onChange={(v) => setStatusFilter(v as ProjectStatus | "all")}
          ariaLabel="Filter by status"
        />
        <SelectMenu
          value={areaFilter}
          options={[
            { value: "", label: "All areas" },
            ...areas.map((a) => ({ value: a.id, label: a.title })),
          ]}
          onChange={setAreaFilter}
          ariaLabel="Filter by area"
        />
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
      ) : view === "board" ? (
        <ProjectsBoard projects={filtered} />
      ) : view === "gantt" ? (
        <ProjectsGantt projects={filtered} />
      ) : (
        <div className="area-grid" style={densityStyle(cols)}>
          {filtered.map((project) => {
            const tasks = flat.filter(({ task }) => task.projectId === project.id);
            const open = tasks.filter(({ task }) => task.status !== "done").length;
            return (
              <button key={project.id} className="area-card" onClick={() => openProject(project.id)}>
                <span className="area-card-icon" data-color={project.color}>
                  <EntityIcon name={project.icon} size={18} />
                </span>
                <span className="area-card-name">{project.title}</span>
                <span className="area-card-meta">
                  {PROJECT_STATUS_LABELS[project.status]} · {open} open tasks
                  {project.targetDate ? ` · Target ${numericDate(project.targetDate)}` : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {creating ? <ProjectModal onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
