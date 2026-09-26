import { useMemo } from "react";
import type { LifeArea, Project } from "../models/types";
import { useStore } from "../state/store";
import { todayISO } from "../utils/date";

const DAY_MS = 86_400_000;

const AREA_COLORS: Record<string, string> = {
  amber: "var(--area-amber)",
  blue: "var(--area-blue)",
  green: "var(--area-green)",
  violet: "var(--area-violet)",
  rose: "var(--area-rose)",
  slate: "var(--area-slate)",
  teal: "var(--area-teal)",
  orange: "var(--area-orange)",
};

function progressOf(p: Project): number {
  if (p.progressMode === "manual") return p.manualProgress;
  if (p.totalTasks === 0) return 0;
  return Math.round(((p.totalTasks - p.openTasks) / p.totalTasks) * 100);
}

function parseDate(iso: string): number {
  return new Date(iso + "T00:00:00").getTime();
}

function addDays(ts: number, days: number): number {
  return ts + days * DAY_MS;
}

function monthLabel(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

interface MonthCell {
  label: string;
  start: number;
  days: number;
}

export function ProjectsGantt({
  projects,
  areas,
}: {
  projects: Project[];
  areas: LifeArea[];
}) {
  const { navigate } = useStore();
  const today = todayISO();

  const dated = useMemo(
    () =>
      projects
        .filter((p) => p.startDate != null || p.targetDate != null)
        .sort((a, b) => (a.startDate ?? a.targetDate!).localeCompare(b.startDate ?? b.targetDate!)),
    [projects],
  );
  const undated = projects.filter((p) => p.startDate == null && p.targetDate == null);

  const range = useMemo(() => {
    if (dated.length === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const p of dated) {
      min = Math.min(min, parseDate(p.startDate ?? p.targetDate!));
      max = Math.max(max, parseDate(p.targetDate ?? p.startDate!));
    }
    const start = addDays(min, -7);
    const end = addDays(max, 14);
    return { start, end, totalDays: Math.round((end - start) / DAY_MS) };
  }, [dated]);

  const months = useMemo<MonthCell[]>(() => {
    if (!range) return [];
    const cells: MonthCell[] = [];
    let cursor = new Date(range.start);
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    if (cursor.getTime() < range.start) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    while (cursor.getTime() < range.end) {
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const cellStart = Math.max(cursor.getTime(), range.start);
      const cellEnd = Math.min(next.getTime(), range.end);
      cells.push({
        label: monthLabel(cursor.getTime()),
        start: cellStart,
        days: Math.max(1, Math.round((cellEnd - cellStart) / DAY_MS)),
      });
      cursor = next;
    }
    return cells;
  }, [range]);

  if (dated.length === 0) {
    return (
      <div className="gantt-empty">
        <p className="muted">No projects with dates to chart yet.</p>
        {undated.length > 0 ? (
          <p className="muted">
            {undated.length} project{undated.length === 1 ? "" : "s"} without start or target dates.
          </p>
        ) : null}
      </div>
    );
  }

  const pct = (ts: number) => ((ts - range!.start) / DAY_MS / range!.totalDays) * 100;
  const todayPct = pct(parseDate(today));

  const barColor = (p: Project): string => {
    if (p.status === "completed") return "var(--done)";
    if (p.status === "cancelled" || p.status === "on_hold") return "var(--ink-faint)";
    const area = areas.find((a) => a.id === p.lifeAreaId);
    return area ? (AREA_COLORS[area.color] ?? "var(--accent)") : "var(--accent)";
  };

  return (
    <div className="gantt">
      <div className="gantt-names" aria-hidden>
        <div className="gantt-head-spacer" />
        {dated.map((p) => (
          <div key={p.id} className="gantt-name-row">
            <button className="gantt-name" onClick={() => navigate({ kind: "project", id: p.id })}>
              {p.title}
            </button>
            <span className="gantt-name-meta">{p.openTasks} open</span>
          </div>
        ))}
        {undated.length > 0 ? (
          <div className="gantt-name-row gantt-undated-label">
            <span className="muted">No dates ({undated.length})</span>
          </div>
        ) : null}
      </div>

      <div className="gantt-scroll">
        <div className="gantt-chart" style={{ width: `${Math.max(100, range!.totalDays * 24)}%` }}>
          <div className="gantt-months">
            {months.map((m, i) => (
              <div
                key={i}
                className="gantt-month"
                style={{ width: `${(m.days / range!.totalDays) * 100}%` }}
              >
                {m.label}
              </div>
            ))}
          </div>

          <div className="gantt-rows">
            {dated.map((p) => {
              const start = parseDate(p.startDate ?? p.targetDate!);
              const end = parseDate(p.targetDate ?? p.startDate!);
              const left = pct(Math.min(start, end));
              const width = Math.max(0.8, pct(Math.max(start, end)) - left);
              const progress = progressOf(p);
              return (
                <div key={p.id} className="gantt-row">
                  <button
                    className="gantt-bar"
                    style={{ left: `${left}%`, width: `${width}%`, background: barColor(p) }}
                    onClick={() => navigate({ kind: "project", id: p.id })}
                    title={`${p.title} — ${p.startDate ?? "?"} → ${p.targetDate ?? "?"}`}
                  >
                    <span className="gantt-bar-fill" style={{ width: `${progress}%` }} />
                    <span className="gantt-bar-label">
                      {p.startDate ?? "?"}
                      {" → "}
                      {p.targetDate ?? "?"}
                    </span>
                  </button>
                </div>
              );
            })}
            {undated.length > 0 ? (
              <div className="gantt-row gantt-undated">
                {undated.map((p) => (
                  <button
                    key={p.id}
                    className="gantt-chip"
                    onClick={() => navigate({ kind: "project", id: p.id })}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="gantt-today" style={{ left: `${todayPct}%` }} title={`Today · ${today}`} />
        </div>
      </div>
    </div>
  );
}
