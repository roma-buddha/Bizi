import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../db";
import type { Priority, TaskStatus } from "../models/types";
import {
  PRIORITIES,
  PRIORITY_NAMES,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from "../models/types";
import { useQuery } from "../state/store";
import { todayISO } from "../utils/date";
import { TaskList } from "../components/TaskList";

type QuickFilter = "all" | "today" | "upcoming" | "overdue" | "waiting" | "completed";

const QUICK_FILTERS: { id: QuickFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "overdue", label: "Overdue" },
  { id: "waiting", label: "Waiting" },
  { id: "completed", label: "Completed" },
];

type SortKey = "scheduled" | "due" | "priority" | "created" | "project";

export function TodoPage() {
  const [quick, setQuick] = useState<QuickFilter>("all");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "">("");
  const [areaFilter, setAreaFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("scheduled");
  const [q, setQ] = useState("");

  const { data: areas } = useQuery(() => api.area.list(), []);
  const { data: projects } = useQuery(() => api.project.list({}), []);

  const filter = useMemo(() => {
    const f: Parameters<typeof api.task.list>[0] = { excludeStatuses: [], parentId: "none" };
    switch (quick) {
      case "today": {
        const t = todayISO();
        f.scheduledFrom = t;
        f.scheduledTo = t;
        break;
      }
      case "upcoming":
        f.scheduledFrom = todayISO();
        break;
      case "overdue":
        f.dueTo = todayISO();
        f.dueFrom = "2000-01-01";
        break;
      case "waiting":
        f.statuses = ["waiting"];
        break;
      case "completed":
        f.statuses = ["completed"];
        break;
      default:
        break;
    }
    if (statusFilter) f.statuses = [statusFilter];
    if (priorityFilter) f.priority = priorityFilter;
    if (areaFilter) f.areaId = areaFilter;
    if (projectFilter) f.projectId = projectFilter;
    if (q.trim()) f.q = q.trim();
    f.limit = 1000;
    return f;
  }, [quick, statusFilter, priorityFilter, areaFilter, projectFilter, q]);

  const { data: tasks } = useQuery(() => api.task.list(filter), [filter]);

  const sorted = useMemo(() => {
    const rows = [...(tasks ?? [])];
    const cmp = (a: string | null, b: string | null) => {
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return a < b ? -1 : 1;
    };
    rows.sort((a, b) => {
      switch (sort) {
        case "scheduled":
          return cmp(a.scheduledDate, b.scheduledDate);
        case "due":
          return cmp(a.dueDate, b.dueDate);
        case "priority": {
          const rank: Record<string, number> = { p1: 1, p2: 2, p3: 3, p4: 4 };
          return rank[a.priority] - rank[b.priority];
        }
        case "created":
          return a.createdAt < b.createdAt ? 1 : -1;
        case "project":
          return (a.projectName ?? "").localeCompare(b.projectName ?? "");
      }
    });
    return rows;
  }, [tasks, sort]);

  return (
    <div className="page wide">
      <header className="page-header">
        <h1>To-Do</h1>
        <p className="page-subtitle">Every task in the system, one list.</p>
      </header>

      <div className="filter-bar">
        {QUICK_FILTERS.map((f) => (
          <button key={f.id} className={`chip${quick === f.id ? " active" : ""}`} onClick={() => setQuick(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="filter-bar secondary">
        <select className="chip-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "")} aria-label="Status">
          <option value="">All statuses</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select className="chip-select" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as Priority | "")} aria-label="Priority">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p.toUpperCase()} · {PRIORITY_NAMES[p]}
            </option>
          ))}
        </select>
        <select className="chip-select" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} aria-label="Area">
          <option value="">All areas</option>
          {areas?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select className="chip-select" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Project">
          <option value="">All projects</option>
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <select className="chip-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
          <option value="scheduled">Sort: Scheduled</option>
          <option value="due">Sort: Due</option>
          <option value="priority">Sort: Priority</option>
          <option value="created">Sort: Created</option>
          <option value="project">Sort: Project</option>
        </select>
        <span className="filter-search">
          <Search size={13} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" aria-label="Search tasks" />
        </span>
        <span className="filter-count">{sorted.length} tasks</span>
      </div>

      <TaskList
        tasks={sorted}
        emptyTitle="No tasks match these filters."
        emptyHint="Capture something with the + button or clear a filter."
      />
    </div>
  );
}
