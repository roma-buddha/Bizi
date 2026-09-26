import { useState } from "react";
import {
  BucketDensityToggle,
  GoalBuckets,
  ProjectBuckets,
  useBucketCols,
} from "../components/Buckets";
import { api } from "../db";
import { AREA_COLORS, AREA_ICONS } from "../models/types";
import { useQuery, useStore } from "../state/store";
import { NoteEditor } from "../components/NoteEditor";
import { TaskList } from "../components/TaskList";
import {
  AreaIcon,
  ColorPicker,
  EmptyState,
  IconPicker,
  Modal,
  SectionTitle,
  Tabs,
  TextField,
} from "../components/ui";

export function AreasPage() {
  const { navigate, bumpData } = useStore();
  const { data: areas } = useQuery(() => api.area.list(), []);
  const { data: goals } = useQuery(() => api.goal.list(), []);
  const { data: projects } = useQuery(() => api.project.list({}), []);
  const { data: tasks } = useQuery(() => api.task.list({}), []);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>(AREA_ICONS[0]);
  const [color, setColor] = useState<string>(AREA_COLORS[0]);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const area = await api.area.create({ name: trimmed, icon, color });
    bumpData();
    setCreating(false);
    setName("");
    navigate({ kind: "area", id: area.id });
  };

  return (
    <div className="page">
      <header className="page-header with-action">
        <div>
          <h1>Life Areas</h1>
          <p className="page-subtitle">Permanent domains of your life.</p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          New area
        </button>
      </header>

      {!areas || areas.length === 0 ? (
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
        <div className="area-grid">
          {areas.map((area) => {
            const areaGoals = (goals ?? []).filter((g) => g.lifeAreaId === area.id);
            const areaProjects = (projects ?? []).filter((p) => p.lifeAreaId === area.id);
            const openTasks = (tasks ?? []).filter(
              (t) => t.lifeAreaId === area.id && t.status !== "completed" && t.status !== "cancelled",
            ).length;
            return (
              <button key={area.id} className="area-card" onClick={() => navigate({ kind: "area", id: area.id })}>
                <span className="area-card-icon" data-color={area.color}>
                  <AreaIcon name={area.icon} size={18} />
                </span>
                <span className="area-card-name">{area.name}</span>
                <span className="area-card-meta">
                  {areaGoals.length} goals · {areaProjects.length} projects · {openTasks} open tasks
                </span>
              </button>
            );
          })}
        </div>
      )}

      {creating ? (
        <Modal title="New life area" onClose={() => setCreating(false)} width={420}>
          <TextField label="Name" value={name} onChange={setName} autoFocus onEnter={() => void create()} />
          <div className="field-label">Icon</div>
          <IconPicker value={icon} onChange={setIcon} />
          <div className="field-label">Color</div>
          <ColorPicker value={color} onChange={setColor} colors={AREA_COLORS} />
          <div className="detail-actions">
            <button className="button ghost" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button className="button primary" disabled={!name.trim()} onClick={() => void create()}>
              Create
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export function AreaDetailPage({ id }: { id: string }) {
  const { navigate, bumpData } = useStore();
  const [tab, setTab] = useState("overview");
  const [goalCols, setGoalCols] = useBucketCols("bizi.bucket-cols.goals");
  const [projectCols, setProjectCols] = useBucketCols("bizi.bucket-cols.projects");
  const { data: area } = useQuery(() => api.area.list().then((list) => list.find((a) => a.id === id) ?? null), [id]);
  const { data: goals } = useQuery(() => api.goal.list(), [id]);
  const { data: projects } = useQuery(() => api.project.list({}), [id]);
  const { data: tasks } = useQuery(() => api.task.list({ areaId: id, excludeStatuses: [] }), [id]);

  if (!area) return <div className="page" />;

  const areaGoals = (goals ?? []).filter((g) => g.lifeAreaId === id);
  const areaProjects = (projects ?? []).filter((p) => p.lifeAreaId === id);
  const activeTasks = (tasks ?? []).filter((t) => t.status !== "completed" && t.status !== "cancelled");

  const remove = async () => {
    if (!window.confirm(`Delete area "${area.name}"? Goals and projects keep their data.`)) return;
    await api.area.remove(id);
    bumpData();
    navigate({ kind: "areas" });
  };

  return (
    <div className="page">
      <header className="page-header with-action">
        <div className="entity-header">
          <span className="entity-icon" data-color={area.color}>
            <AreaIcon name={area.icon} size={20} />
          </span>
          <div>
            <h1
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => {
                const name = e.currentTarget.textContent?.trim();
                if (name && name !== area.name) void api.area.update(id, { name }).then(bumpData);
              }}
            >
              {area.name}
            </h1>
            <p
              className="page-subtitle"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Add a short description…"
              onBlur={(e) => {
                const description = e.currentTarget.textContent?.trim() ?? "";
                if (description !== area.description)
                  void api.area.update(id, { description }).then(bumpData);
              }}
            >
              {area.description}
            </p>
          </div>
        </div>
        <button className="button ghost" onClick={() => void remove()}>
          Delete
        </button>
      </header>

      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "goals", label: `Goals (${areaGoals.length})` },
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
            <SectionTitle>Active goals</SectionTitle>
            {areaGoals.filter((g) => g.status === "active").length === 0 ? (
              <p className="muted">No active goals in {area.name}.</p>
            ) : (
              <div className="link-list">
                {areaGoals
                  .filter((g) => g.status === "active")
                  .map((g) => (
                    <button key={g.id} className="link-row" onClick={() => navigate({ kind: "goal", id: g.id })}>
                      {g.title}
                    </button>
                  ))}
              </div>
            )}
          </section>
          <section>
            <SectionTitle>Active projects</SectionTitle>
            {areaProjects.filter((p) => p.status === "active").length === 0 ? (
              <p className="muted">No active projects in {area.name}.</p>
            ) : (
              <div className="link-list">
                {areaProjects
                  .filter((p) => p.status === "active")
                  .map((p) => (
                    <button key={p.id} className="link-row" onClick={() => navigate({ kind: "project", id: p.id })}>
                      {p.title}
                    </button>
                  ))}
              </div>
            )}
          </section>
          <section>
            <SectionTitle>Upcoming tasks</SectionTitle>
            <TaskList
              tasks={activeTasks.filter((t) => t.scheduledDate != null).slice(0, 5)}
              emptyTitle="No scheduled tasks."
            />
          </section>
        </div>
      ) : null}

      {tab === "goals" ? (
        areaGoals.length === 0 ? (
          <p className="muted">No goals in this area yet.</p>
        ) : (
          <>
            <div className="bucket-toolbar">
              <BucketDensityToggle value={goalCols} onChange={setGoalCols} />
            </div>
            <GoalBuckets goals={areaGoals} projects={projects ?? []} tasks={tasks ?? []} cols={goalCols} />
          </>
        )
      ) : null}

      {tab === "projects" ? (
        areaProjects.length === 0 ? (
          <p className="muted">No projects in this area yet.</p>
        ) : (
          <>
            <div className="bucket-toolbar">
              <BucketDensityToggle value={projectCols} onChange={setProjectCols} />
            </div>
            <ProjectBuckets projects={areaProjects} tasks={tasks ?? []} cols={projectCols} />
          </>
        )
      ) : null}

      {tab === "tasks" ? (
        <TaskList tasks={tasks} emptyTitle="No tasks in this area yet." />
      ) : null}

      {tab === "notes" ? <NoteEditor entityType="area" entityId={id} placeholder={`Notes about ${area.name}…`} /> : null}
    </div>
  );
}
