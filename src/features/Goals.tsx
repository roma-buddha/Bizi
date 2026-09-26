import { useMemo, useState } from "react";
import { api } from "../db";
import type { Goal, GoalStatus, LifeArea, Priority } from "../models/types";
import {
  GOAL_STATUSES,
  GOAL_STATUS_LABELS,
  PRIORITIES,
  PRIORITY_NAMES,
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

export function GoalsPage() {
  const { navigate, bumpData } = useStore();
  const [statusFilter, setStatusFilter] = useState<GoalStatus | "all">("all");
  const [creating, setCreating] = useState(false);
  const { data: goals } = useQuery(() => api.goal.list(), []);
  const { data: areas } = useQuery(() => api.area.list(), []);
  const { data: projects } = useQuery(() => api.project.list({}), []);
  const { data: tasks } = useQuery(() => api.task.list({}), []);

  const filtered = (goals ?? []).filter((g) => statusFilter === "all" || g.status === statusFilter);

  const progressOf = (goal: Goal) => {
    if (goal.progressMode === "manual") return goal.manualProgress;
    const linked = (projects ?? []).filter((p) => goal.projectIds.includes(p.id));
    if (linked.length === 0) return 0;
    const avg = linked.reduce((sum, p) => sum + projectProgress(p, tasks ?? []), 0) / linked.length;
    return Math.round(avg);
  };

  return (
    <div className="page">
      <header className="page-header with-action">
        <div>
          <h1>Goals</h1>
          <p className="page-subtitle">Desired outcomes across your life.</p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          New goal
        </button>
      </header>

      <div className="filter-bar">
        <button
          className={`chip${statusFilter === "all" ? " active" : ""}`}
          onClick={() => setStatusFilter("all")}
        >
          All
        </button>
        {GOAL_STATUSES.map((s) => (
          <button
            key={s}
            className={`chip${statusFilter === s ? " active" : ""}`}
            onClick={() => setStatusFilter(s)}
          >
            {GOAL_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No goals here."
          action={
            <button className="button primary" onClick={() => setCreating(true)}>
              Create Goal
            </button>
          }
        />
      ) : (
        <div className="goal-list">
          {filtered.map((goal) => (
            <button key={goal.id} className="goal-row" onClick={() => navigate({ kind: "goal", id: goal.id })}>
              <div className="goal-row-main">
                <span className="goal-row-title">{goal.title}</span>
                <span className="goal-row-meta">
                  {goal.areaName ?? "No area"}
                  {goal.targetDate ? ` · Target ${formatDate(goal.targetDate)}` : ""}
                </span>
              </div>
              <PriorityBadge priority={goal.priority} />
              <span className="goal-progress">
                <ProgressBar value={progressOf(goal)} />
                <span className="goal-progress-num">{progressOf(goal)}%</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {creating ? (
        <GoalModal
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

export function GoalModal({
  areas,
  onClose,
  onSaved,
  initial,
}: {
  areas: LifeArea[];
  onClose: () => void;
  onSaved: () => void;
  initial?: Goal;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [lifeAreaId, setLifeAreaId] = useState(initial?.lifeAreaId ?? "");
  const [status, setStatus] = useState<GoalStatus>(initial?.status ?? "planned");
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
    if (initial) await api.goal.update(initial.id, payload);
    else await api.goal.create(payload);
    onSaved();
  };

  return (
    <Modal title={initial ? "Edit goal" : "New goal"} onClose={onClose} width={440}>
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
          onChange={(v) => setStatus(v as GoalStatus)}
          options={GOAL_STATUSES.map((s) => ({ value: s, label: GOAL_STATUS_LABELS[s] }))}
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

export function GoalDetailPage({ id }: { id: string }) {
  const { navigate, bumpData } = useStore();
  const [tab, setTab] = useState("overview");
  const { data: goal } = useQuery(() => api.goal.list().then((list) => list.find((g) => g.id === id) ?? null), [id]);
  const { data: areas } = useQuery(() => api.area.list(), [id]);
  const { data: tasks } = useQuery(() => api.task.list({ goalId: id, excludeStatuses: [] }), [id]);
  const { data: allProjects } = useQuery(() => api.project.list({}), [id]);
  const [editing, setEditing] = useState(false);

  const linkedProjects = useMemo(
    () => (allProjects ?? []).filter((p) => goal?.projectIds.includes(p.id)),
    [allProjects, goal],
  );
  const progress = useMemo(() => {
    if (!goal) return 0;
    if (goal.progressMode === "manual") return goal.manualProgress;
    if (linkedProjects.length === 0) return 0;
    const avg = linkedProjects.reduce((sum, p) => sum + projectProgress(p, tasks ?? []), 0) / linkedProjects.length;
    return Math.round(avg);
  }, [goal, linkedProjects, tasks]);

  if (!goal) return <div className="page" />;

  const setStatus = async (status: GoalStatus) => {
    await api.goal.update(id, { status });
    bumpData();
  };

  const toggleProject = async (projectId: string, linked: boolean) => {
    const next = linked ? [...goal.projectIds, projectId] : goal.projectIds.filter((p) => p !== projectId);
    await api.goal.update(id, { projectIds: next });
    bumpData();
  };

  return (
    <div className="page">
      <header className="page-header with-action">
        <div>
          <h1>{goal.title}</h1>
          <p className="page-subtitle">
            {goal.areaName ?? "No area"}
            {goal.targetDate ? ` · Target ${formatDate(goal.targetDate)}` : ""}
          </p>
        </div>
        <div className="header-actions">
          <span className="goal-progress">
            <ProgressBar value={progress} />
            <span className="goal-progress-num">{progress}%</span>
          </span>
          <SelectField
            label=""
            value={goal.status}
            onChange={(v) => void setStatus(v as GoalStatus)}
            options={GOAL_STATUSES.map((s) => ({ value: s, label: GOAL_STATUS_LABELS[s] }))}
          />
          <button className="button ghost" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      </header>

      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "projects", label: `Projects (${linkedProjects.length})` },
          { id: "tasks", label: "Tasks" },
          { id: "timeline", label: "Timeline" },
          { id: "notes", label: "Notes" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "overview" ? (
        <div className="stack">
          <section>
            <SectionTitle>Description</SectionTitle>
            <p
              className="editable-text"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="What does achieving this goal look like?"
              onBlur={(e) => {
                const description = e.currentTarget.textContent?.trim() ?? "";
                if (description !== goal.description) void api.goal.update(id, { description }).then(bumpData);
              }}
            >
              {goal.description}
            </p>
          </section>
          <section>
            <SectionTitle>Linked projects</SectionTitle>
            {(allProjects ?? []).map((p) => (
              <label key={p.id} className="goal-link">
                <input
                  type="checkbox"
                  checked={goal.projectIds.includes(p.id)}
                  onChange={(e) => void toggleProject(p.id, e.target.checked)}
                />
                <span>{p.title}</span>
              </label>
            ))}
          </section>
        </div>
      ) : null}

      {tab === "projects" ? (
        <div className="link-list">
          {linkedProjects.length === 0 ? <p className="muted">No projects linked to this goal.</p> : null}
          {linkedProjects.map((p) => (
            <button key={p.id} className="link-row" onClick={() => navigate({ kind: "project", id: p.id })}>
              {p.title}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "tasks" ? <TaskList tasks={tasks} emptyTitle="No tasks related to this goal." /> : null}

      {tab === "timeline" ? (
        <div className="timeline">
          {goal.startDate ? <div className="timeline-item">Started {formatDate(goal.startDate)}</div> : null}
          {linkedProjects.map((p) =>
            p.targetDate ? (
              <div key={p.id} className="timeline-item">
                {p.title} targets {formatDate(p.targetDate)}
              </div>
            ) : null,
          )}
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

      {tab === "notes" ? <NoteEditor entityType="goal" entityId={id} placeholder={`Notes about ${goal.title}…`} /> : null}

      {editing ? (
        <GoalModal
          areas={areas ?? []}
          initial={goal}
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
