import { useMemo, useState } from "react";
import { useStore, type DailyTask, type NamedItem } from "../state/store";
import { numericDate } from "../utils/date";

interface FlatTask {
  task: DailyTask;
  dateISO: string;
}

/** All tasks across every day, tagged with their day. */
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

function EntityListPage({
  kind,
  singular,
  subtitle,
}: {
  kind: "projects" | "areas";
  singular: string;
  subtitle: string;
}) {
  const {
    projects,
    areas,
    addProject,
    addArea,
    renameProject,
    renameArea,
    deleteProject,
    deleteArea,
    toggleTask,
    openDetail,
  } = useStore();
  const flat = useFlatTasks();
  const items = kind === "projects" ? projects : areas;
  const add = kind === "projects" ? addProject : addArea;
  const rename = kind === "projects" ? renameProject : renameArea;
  const remove = kind === "projects" ? deleteProject : deleteArea;
  const field = kind === "projects" ? "projectId" : "areaId";

  const [draft, setDraft] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const create = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const id = add(trimmed);
    setDraft("");
    setSelectedId(id);
  };

  const counts = useMemo(() => {
    const map = new Map<string, { open: number; done: number }>();
    for (const { task } of flat) {
      const key = task[field];
      if (!key) continue;
      const entry = map.get(key) ?? { open: 0, done: 0 };
      if (task.status === "done") entry.done += 1;
      else entry.open += 1;
      map.set(key, entry);
    }
    return map;
  }, [flat, field]);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const selectedTasks = selected ? flat.filter(({ task }) => task[field] === selected.id) : [];

  const renameItem = (item: NamedItem) => {
    const next = window.prompt(`Rename ${singular}`, item.title);
    if (next?.trim()) rename(item.id, next.trim());
  };

  const removeItem = (item: NamedItem) => {
    const c = counts.get(item.id);
    const used = c ? c.open + c.done : 0;
    if (!window.confirm(`Delete ${singular} "${item.title}"?${used ? ` ${used} task${used === 1 ? "" : "s"} will be unlinked.` : ""}`))
      return;
    remove(item.id);
    if (selectedId === item.id) setSelectedId(null);
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>{kind === "projects" ? "Projects" : "Areas"}</h1>
        <p className="page-subtitle">{subtitle}</p>
      </header>

      <div className="entity-add">
        <input
          className="field-input"
          placeholder={`New ${singular}…`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") create();
          }}
        />
        <button className="button primary" disabled={!draft.trim()} onClick={create}>
          Add
        </button>
      </div>

      {items.length === 0 ? (
        <p className="muted">No {kind} yet — create one above, or from a task's detail panel.</p>
      ) : (
        <div className="link-list">
          {items.map((item) => {
            const c = counts.get(item.id);
            return (
              <div key={item.id} className={`entity-row${selectedId === item.id ? " selected" : ""}`}>
                <button className="link-row" onClick={() => setSelectedId(item.id)}>
                  <span className="entity-name">{item.title}</span>
                  <span className="entity-counts">
                    {c ? `${c.open} open · ${c.done} done` : "no tasks"}
                  </span>
                </button>
                <button className="icon-button small" title={`Rename ${singular}`} aria-label={`Rename ${singular}`} onClick={() => renameItem(item)}>
                  ✎
                </button>
                <button className="icon-button small" title={`Delete ${singular}`} aria-label={`Delete ${singular}`} onClick={() => removeItem(item)}>
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {selected ? (
        <section className="entity-tasks">
          <h2 className="entity-tasks-title">{selected.title}</h2>
          {selectedTasks.length === 0 ? (
            <p className="muted">No tasks linked to this {singular} yet.</p>
          ) : (
            <div className="agenda-rows">
              {selectedTasks.map(({ task, dateISO }) => (
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
          )}
        </section>
      ) : null}
    </div>
  );
}

export function ProjectsPage() {
  return (
    <EntityListPage kind="projects" singular="project" subtitle="Temporary initiatives with a desired outcome." />
  );
}

export function AreasPage() {
  return <EntityListPage kind="areas" singular="area" subtitle="Permanent domains of your life." />;
}
