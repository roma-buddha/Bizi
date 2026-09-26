import { api } from "../db";
import type { Goal, Project, Task } from "../models/types";
import { useQuery, useStore } from "../state/store";
import { EmptyState, SectionTitle } from "../components/ui";

export function ArchivePage() {
  const { bumpData, navigate } = useStore();
  const { data: areas } = useQuery(() => api.area.list(true), []);
  const { data: goals } = useQuery(() => api.goal.list(true), []);
  const { data: projects } = useQuery(() => api.project.list({ includeArchived: true }), []);
  const { data: tasks } = useQuery(() => api.task.list({ includeArchived: true, excludeStatuses: [], limit: 1000 }), []);

  const archivedAreas = (areas ?? []).filter((a) => a.archived);
  const archivedGoals = (goals ?? []).filter((g: Goal) => g.archived);
  const archivedProjects = (projects ?? []).filter((p: Project) => p.archived);
  const archivedTasks = (tasks ?? []).filter((t: Task) => t.archived);
  const empty =
    archivedAreas.length + archivedGoals.length + archivedProjects.length + archivedTasks.length === 0;

  const unarchive = async (kind: "area" | "goal" | "project" | "task", id: string) => {
    if (kind === "area") await api.area.update(id, { archived: false });
    if (kind === "goal") await api.goal.update(id, { archived: false });
    if (kind === "project") await api.project.update(id, { archived: false });
    if (kind === "task") await api.task.update(id, { archived: false });
    bumpData();
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Archive</h1>
        <p className="page-subtitle">Out of sight, never out of reach.</p>
      </header>

      {empty ? (
        <EmptyState title="Archive is empty." hint="Archived goals, projects, tasks and areas appear here." />
      ) : (
        <div className="stack">
          {archivedAreas.length > 0 ? (
            <section>
              <SectionTitle>Areas</SectionTitle>
              {archivedAreas.map((a) => (
                <div key={a.id} className="archive-row">
                  <span>{a.name}</span>
                  <button className="button ghost small" onClick={() => void unarchive("area", a.id)}>
                    Restore
                  </button>
                </div>
              ))}
            </section>
          ) : null}
          {archivedGoals.length > 0 ? (
            <section>
              <SectionTitle>Goals</SectionTitle>
              {archivedGoals.map((g) => (
                <div key={g.id} className="archive-row">
                  <button className="link-inline" onClick={() => navigate({ kind: "goal", id: g.id })}>
                    {g.title}
                  </button>
                  <button className="button ghost small" onClick={() => void unarchive("goal", g.id)}>
                    Restore
                  </button>
                </div>
              ))}
            </section>
          ) : null}
          {archivedProjects.length > 0 ? (
            <section>
              <SectionTitle>Projects</SectionTitle>
              {archivedProjects.map((p) => (
                <div key={p.id} className="archive-row">
                  <button className="link-inline" onClick={() => navigate({ kind: "project", id: p.id })}>
                    {p.title}
                  </button>
                  <button className="button ghost small" onClick={() => void unarchive("project", p.id)}>
                    Restore
                  </button>
                </div>
              ))}
            </section>
          ) : null}
          {archivedTasks.length > 0 ? (
            <section>
              <SectionTitle>Tasks</SectionTitle>
              {archivedTasks.slice(0, 100).map((t) => (
                <div key={t.id} className="archive-row">
                  <span>{t.title}</span>
                  <button className="button ghost small" onClick={() => void unarchive("task", t.id)}>
                    Restore
                  </button>
                </div>
              ))}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
