import { useEffect, useMemo, useRef, useState } from "react";
import { ProgressBar } from "../components/ui";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  useStore,
  type ProjectItem,
  type ProjectStatus,
} from "../state/store";
import { numericDate, todayISO } from "../utils/date";

/* ------------------------------------------------------------------ */
/* Shared stats                                                        */
/* ------------------------------------------------------------------ */

interface ProjectStats {
  total: number;
  done: number;
}

function useProjectStats(): Map<string, ProjectStats> {
  const { byDay } = useStore();
  return useMemo(() => {
    const map = new Map<string, ProjectStats>();
    for (const tasks of Object.values(byDay)) {
      for (const t of tasks) {
        if (!t.projectId || t.archived) continue;
        const entry = map.get(t.projectId) ?? { total: 0, done: 0 };
        entry.total += 1;
        if (t.status === "done") entry.done += 1;
        map.set(t.projectId, entry);
      }
    }
    return map;
  }, [byDay]);
}

function progressOf(stats: Map<string, ProjectStats>, projectId: string): number {
  const s = stats.get(projectId);
  if (!s || s.total === 0) return 0;
  return Math.round((s.done / s.total) * 100);
}

/* ------------------------------------------------------------------ */
/* Kanban board by status (drag & drop moves projects between columns) */
/* ------------------------------------------------------------------ */

/** All statuses get a board column so nothing is hidden from the board. */
const BOARD_STATUSES = PROJECT_STATUSES;

export function ProjectsBoard({ projects }: { projects: ProjectItem[] }) {
  const { updateProject, openProject, areas } = useStore();
  const stats = useProjectStats();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<ProjectStatus | null>(null);

  const areaName = (id: string | null) => areas.find((a) => a.id === id)?.title ?? null;

  const drop = (status: ProjectStatus) => {
    if (dragId) updateProject(dragId, { status });
    setDragId(null);
    setOverStatus(null);
  };

  return (
    <div className="board">
      {BOARD_STATUSES.map((status) => {
        const column = projects.filter((p) => p.status === status);
        return (
          <div
            key={status}
            className={`board-column${overStatus === status && dragId ? " drag-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (overStatus !== status) setOverStatus(status);
            }}
            onDragLeave={() => setOverStatus((prev) => (prev === status ? null : prev))}
            onDrop={(e) => {
              e.preventDefault();
              drop(status);
            }}
          >
            <div className="board-column-head">
              {PROJECT_STATUS_LABELS[status]}
              <span className="board-count">{column.length}</span>
            </div>
            {column.map((p) => (
              <button
                key={p.id}
                className="board-card"
                draggable
                onDragStart={(e) => {
                  setDragId(p.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", p.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverStatus(null);
                }}
                onClick={() => openProject(p.id)}
              >
                <span className="board-card-title">{p.title}</span>
                <span className="board-card-meta">
                  {areaName(p.areaId) ?? "No area"}
                  {p.targetDate ? ` · ${numericDate(p.targetDate)}` : ""}
                </span>
                <span className="goal-progress">
                  <ProgressBar value={progressOf(stats, p.id)} />
                </span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Gantt chart of project timelines (zoomable)                         */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;

const COLOR_VARS: Record<string, string> = {
  amber: "var(--area-amber)",
  blue: "var(--area-blue)",
  green: "var(--area-green)",
  violet: "var(--area-violet)",
  rose: "var(--area-rose)",
  slate: "var(--area-slate)",
  teal: "var(--area-teal)",
  orange: "var(--area-orange)",
};

const ZOOM_MIN = 1;
const ZOOM_MAX = 200;
const ZOOM_DEFAULT = 24;

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

export function ProjectsGantt({ projects }: { projects: ProjectItem[] }) {
  const { openProject } = useStore();
  const stats = useProjectStats();
  // null = fit the whole chart into the viewport; a number = user zoom (px/day).
  const [pxPerDay, setPxPerDay] = useState<number | null>(null);
  const today = todayISO();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewWidth, setViewWidth] = useState(0);
  const effectiveRef = useRef(ZOOM_DEFAULT);
  const zoomedRef = useRef(false);
  const pendingZoom = useRef<{ ratio: number; anchor: number; scroll: number } | null>(null);

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

  // Track the viewport width so the chart can fit without scrolling.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitPxPerDay =
    range && viewWidth > 0 ? Math.max(ZOOM_MIN, viewWidth / range.totalDays) : ZOOM_DEFAULT;
  const effectivePx = pxPerDay ?? fitPxPerDay;
  effectiveRef.current = effectivePx;
  zoomedRef.current = pxPerDay !== null;

  // Mouse-wheel zoom, anchored at the cursor position.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cur = effectiveRef.current;
      const factor = e.deltaY < 0 ? 1.25 : 1 / 1.25;
      // In fit mode, zooming out further is a no-op.
      if (factor < 1 && !zoomedRef.current) return;
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cur * factor));
      if (next === cur) return;
      const rect = el.getBoundingClientRect();
      const anchor = e.clientX - rect.left + el.scrollLeft;
      pendingZoom.current = { ratio: next / cur, anchor, scroll: el.scrollLeft };
      setPxPerDay(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // After the zoom re-render, keep the point under the cursor stationary.
  useEffect(() => {
    const el = scrollRef.current;
    const pending = pendingZoom.current;
    if (!el || !pending) return;
    pendingZoom.current = null;
    el.scrollLeft = pending.anchor * pending.ratio - (pending.anchor - pending.scroll);
  }, [pxPerDay]);

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

  const barColor = (p: ProjectItem): string => {
    if (p.status === "completed") return "var(--done)";
    if (p.status === "cancelled" || p.status === "on_hold") return "var(--ink-faint)";
    return COLOR_VARS[p.color] ?? "var(--accent)";
  };

  return (
    <div>
      <div className="gantt">
        <div className="gantt-names" aria-hidden>
          <div className="gantt-head-spacer" />
          {dated.map((p) => {
            const s = stats.get(p.id);
            return (
              <div key={p.id} className="gantt-name-row">
                <button className="gantt-name" onClick={() => openProject(p.id)}>
                  {p.title}
                </button>
                <span className="gantt-name-meta">
                  {s ? s.total - s.done : 0} open
                </span>
              </div>
            );
          })}
          {undated.length > 0 ? (
            <div className="gantt-name-row gantt-undated-label">
              <span className="muted">No dates ({undated.length})</span>
            </div>
          ) : null}
        </div>

        <div className="gantt-scroll" ref={scrollRef}>
          <div
            className="gantt-chart"
            style={{ width: `max(100%, ${range!.totalDays * effectivePx}px)` }}
          >
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
                const progress = progressOf(stats, p.id);
                return (
                  <div key={p.id} className="gantt-row">
                    <button
                      className="gantt-bar"
                      style={{ left: `${left}%`, width: `${width}%`, background: barColor(p) }}
                      onClick={() => openProject(p.id)}
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
                    <button key={p.id} className="gantt-chip" onClick={() => openProject(p.id)}>
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
    </div>
  );
}
