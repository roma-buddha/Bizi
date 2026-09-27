import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../db";
import type { Task as ApiTask } from "../models/types";

export type ThemeSetting = "light" | "dark";

export type TaskStatus = "todo" | "in_progress" | "waiting" | "done" | "cancelled";
export type Priority = "p1" | "p2" | "p3";
export type DeadlineType = "none" | "soft" | "hard";

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "waiting", "done", "cancelled"];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  waiting: "Waiting",
  done: "Done",
  cancelled: "Cancelled",
};

export const PRIORITIES: Priority[] = ["p1", "p2", "p3"];
export const PRIORITY_LABELS: Record<Priority, string> = {
  p1: "P1 · High",
  p2: "P2 · Medium",
  p3: "P3 · Low",
};

export const DEADLINE_TYPES: DeadlineType[] = ["none", "soft", "hard"];
export const DEADLINE_LABELS: Record<DeadlineType, string> = {
  none: "None",
  soft: "Soft",
  hard: "Hard",
};

export type ProjectStatus =
  | "idea"
  | "planned"
  | "active"
  | "waiting"
  | "on_hold"
  | "completed"
  | "cancelled";

export const PROJECT_STATUSES: ProjectStatus[] = [
  "idea",
  "planned",
  "active",
  "waiting",
  "on_hold",
  "completed",
  "cancelled",
];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  idea: "Idea",
  planned: "Planned",
  active: "Active",
  waiting: "Waiting",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Bucket key for tasks with no scheduled date (kept off the day cards). */
export const UNSCHEDULED = "unscheduled";

export interface DailyTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  projectId: string | null;
  areaId: string | null;
  scheduledDate: string | null;
  dueDate: string | null;
  deadlineType: DeadlineType;
  notes: string;
  archived: boolean;
}

export type ByDay = Record<string, DailyTask[]>;

/** Life area — a permanent domain of your life. */
export interface AreaItem {
  id: string;
  title: string;
  color: string;
  icon: string;
  description: string;
  notes: string;
}

/** Project — a temporary initiative with a desired outcome. */
export interface ProjectItem {
  id: string;
  title: string;
  color: string;
  icon: string;
  areaId: string | null;
  status: ProjectStatus;
  startDate: string | null;
  targetDate: string | null;
  description: string;
  notes: string;
  archived: boolean;
}

export interface AreaInput {
  title: string;
  icon?: string;
  color?: string;
  description?: string;
}

export interface ProjectInput {
  title: string;
  areaId?: string | null;
  status?: ProjectStatus;
  startDate?: string | null;
  targetDate?: string | null;
  description?: string;
  icon?: string;
  color?: string;
}

export const ITEM_COLORS = [
  "amber",
  "blue",
  "green",
  "violet",
  "rose",
  "slate",
  "teal",
  "orange",
] as const;

export const ENTITY_ICONS = [
  "briefcase",
  "flask-conical",
  "heart-pulse",
  "wallet",
  "users",
  "calendar-check",
  "graduation-cap",
  "plane",
  "home",
  "book-open",
  "dumbbell",
  "music",
  "palette",
  "code",
  "sprout",
  "compass",
] as const;

export type TaskPatch = Partial<Omit<DailyTask, "id">>;
export type AreaPatch = Partial<Omit<AreaItem, "id">>;
export type ProjectPatch = Partial<Omit<ProjectItem, "id">>;

export interface TaskRef {
  dateISO: string;
  id: string;
}

/** Sidebar tabs, added back function by function. */
export type Section = "today" | "projects" | "areas";

export const SECTION_LABELS: Record<Section, string> = {
  today: "To-Do",
  projects: "Projects",
  areas: "Areas",
};

/* ------------------------------------------------------------------ */
/* Mapping between the UI model and the backend (SQLite) model          */
/* ------------------------------------------------------------------ */

function fromApiStatus(status: ApiTask["status"]): TaskStatus {
  if (status === "completed") return "done";
  if (status === "inbox") return "todo";
  return status;
}

function toApiStatus(status: TaskStatus): ApiTask["status"] {
  if (status === "done") return "completed";
  return status;
}

function taskFromApi(row: ApiTask, notes: string): DailyTask {
  return {
    id: row.id,
    title: row.title,
    status: fromApiStatus(row.status),
    priority: row.priority === "p4" ? "p3" : row.priority,
    projectId: row.projectId,
    areaId: row.lifeAreaId,
    scheduledDate: row.scheduledDate,
    dueDate: row.dueDate,
    deadlineType: row.deadlineType,
    notes,
    archived: row.archived,
  };
}

interface Store {
  theme: ThemeSetting;
  setTheme: (theme: ThemeSetting) => void;
  toggleTheme: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  section: Section;
  setSection: (section: Section) => void;
  /** True once the initial load from the backend has finished. */
  hydrated: boolean;
  // Daily planner state (SQLite-backed via the Bizi API).
  byDay: ByDay;
  addTask: (
    dateISO: string,
    title: string,
    link?: { projectId?: string | null; areaId?: string | null },
  ) => string;
  toggleTask: (dateISO: string, id: string) => void;
  moveTask: (sourceDate: string, targetDate: string, id: string, index?: number) => void;
  updateTask: (dateISO: string, id: string, patch: TaskPatch) => void;
  deleteTask: (dateISO: string, id: string) => void;
  projects: ProjectItem[];
  areas: AreaItem[];
  addProject: (input: ProjectInput) => string;
  addArea: (input: AreaInput) => string;
  updateProject: (id: string, patch: ProjectPatch) => void;
  updateArea: (id: string, patch: AreaPatch) => void;
  deleteProject: (id: string) => void;
  deleteArea: (id: string) => void;
  // Selected entity (project/area detail view), kept in the store so areas
  // and projects can cross-link into each other's detail pages.
  selectedProjectId: string | null;
  selectedAreaId: string | null;
  openProject: (id: string | null) => void;
  openArea: (id: string | null) => void;
  // Right detail panel.
  detail: TaskRef | null;
  openDetail: (ref: TaskRef) => void;
  closeDetail: () => void;
}

const StoreContext = createContext<Store | null>(null);

function loadTheme(): ThemeSetting {
  try {
    const saved = localStorage.getItem("bizi.theme");
    return saved === "dark" || saved === "light" ? saved : "light";
  } catch {
    return "light";
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const fire = (promise: Promise<unknown>) => {
  promise.catch(() => {
    // Backend unreachable or row missing: the optimistic local state stays.
  });
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeSetting>(loadTheme);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("bizi.sidebar") === "1",
  );
  // Same bounds and default as Lotus Notes: 220-480px, default 272px.
  const [sidebarWidth, setSidebarWidthState] = useState(() =>
    Math.min(480, Math.max(220, Number(localStorage.getItem("bizi.sidebar-width")) || 272)),
  );
  const [section, setSection] = useState<Section>("today");
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);
  const [byDay, setByDay] = useState<ByDay>({});
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [areas, setAreas] = useState<AreaItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskRef | null>(null);

  // Initial load from the backend (SQLite in the app, browser DB in dev).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [taskRows, projectRows, areaRows] = await Promise.all([
        api.task.list({ includeArchived: true, excludeStatuses: [] }),
        api.project.list({ includeArchived: true }),
        api.area.list(true),
      ]);
      if (cancelled) return;
      const [taskNotes, projectNotes, areaNotes] = await Promise.all([
        Promise.all(taskRows.map((t) => api.note.get("task", t.id))),
        Promise.all(projectRows.map((p) => api.note.get("project", p.id))),
        Promise.all(areaRows.map((a) => api.note.get("area", a.id))),
      ]);
      if (cancelled) return;

      const buckets: ByDay = {};
      taskRows.forEach((row, i) => {
        const task = taskFromApi(row, taskNotes[i]?.content ?? "");
        const key = row.scheduledDate ?? UNSCHEDULED;
        (buckets[key] ??= []).push(task);
      });

      setByDay(buckets);
      setProjects(
        projectRows.map((row, i) => ({
          id: row.id,
          title: row.title,
          color: row.color || "slate",
          icon: row.icon || "briefcase",
          areaId: row.lifeAreaId,
          status: row.status,
          startDate: row.startDate,
          targetDate: row.targetDate,
          description: row.description,
          notes: projectNotes[i]?.content ?? "",
          archived: row.archived,
        })),
      );
      setAreas(
        areaRows.map((row, i) => ({
          id: row.id,
          title: row.name,
          color: row.color || "amber",
          icon: row.icon || "compass",
          description: row.description,
          notes: areaNotes[i]?.content ?? "",
        })),
      );
      hydratedRef.current = true;
      setHydrated(true);
    };
    fire(load());
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((next: ThemeSetting) => {
    setThemeState(next);
    try {
      localStorage.setItem("bizi.theme", next);
    } catch {
      // storage unavailable
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeSetting = prev === "light" ? "dark" : "light";
      try {
        localStorage.setItem("bizi.theme", next);
      } catch {
        // storage unavailable
      }
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      try {
        localStorage.setItem("bizi.sidebar", prev ? "0" : "1");
      } catch {
        // storage unavailable
      }
      return !prev;
    });
  }, []);

  const setSidebarWidth = useCallback((width: number) => {
    const clamped = Math.min(480, Math.max(220, Math.round(width)));
    setSidebarWidthState(clamped);
    try {
      localStorage.setItem("bizi.sidebar-width", String(clamped));
    } catch {
      // storage unavailable
    }
  }, []);

  const addTask = useCallback(
    (dateISO: string, title: string, link?: { projectId?: string | null; areaId?: string | null }): string => {
      const trimmed = title.trim();
      if (!trimmed) return "";
      const id = newId();
      const task: DailyTask = {
        id,
        title: trimmed,
        status: "todo",
        priority: "p3",
        projectId: link?.projectId ?? null,
        areaId: link?.areaId ?? null,
        scheduledDate: dateISO,
        dueDate: null,
        deadlineType: "none",
        notes: "",
        archived: false,
      };
      setByDay((prev) => ({ ...prev, [dateISO]: [...(prev[dateISO] ?? []), task] }));
      fire(
        api.task
          .create({
            title: trimmed,
            status: "todo",
            priority: "p3",
            projectId: link?.projectId ?? null,
            lifeAreaId: link?.areaId ?? null,
            scheduledDate: dateISO,
          })
          .then((created) => {
            if (created.id !== id) {
              setByDay((prev) => {
                const bucket = prev[dateISO] ?? [];
                return {
                  ...prev,
                  [dateISO]: bucket.map((t) => (t.id === id ? { ...t, id: created.id } : t)),
                };
              });
              setDetail((prev) =>
                prev && prev.id === id ? { dateISO: prev.dateISO, id: created.id } : prev,
              );
            }
          }),
      );
      return id;
    },
    [],
  );

  const toggleTask = useCallback((dateISO: string, id: string) => {
    setByDay((prev) => ({
      ...prev,
      [dateISO]: (prev[dateISO] ?? []).map((t) => {
        if (t.id !== id) return t;
        const status: TaskStatus = t.status === "done" ? "todo" : "done";
        if (hydratedRef.current) fire(api.task.update(id, { status: toApiStatus(status) }));
        return { ...t, status };
      }),
    }));
  }, []);

  const moveTask = useCallback((sourceDate: string, targetDate: string, id: string, index?: number) => {
    setByDay((prev) => {
      const found = (prev[sourceDate] ?? []).find((t) => t.id === id);
      if (!found) return prev;
      // The planner bucket tracks the scheduled day.
      const task = sourceDate === targetDate ? found : { ...found, scheduledDate: targetDate };
      const sourceList = (prev[sourceDate] ?? []).filter((t) => t.id !== id);
      const targetList = sourceDate === targetDate ? sourceList : [...(prev[targetDate] ?? [])];
      const at = index == null ? targetList.length : Math.min(index, targetList.length);
      targetList.splice(at, 0, task);
      return { ...prev, [sourceDate]: sourceList, [targetDate]: targetList };
    });
    if (sourceDate !== targetDate && hydratedRef.current) {
      fire(api.task.update(id, { scheduledDate: targetDate }));
    }
  }, []);

  const updateTask = useCallback((dateISO: string, id: string, patch: TaskPatch) => {
    if ("title" in patch && !patch.title?.trim()) return;
    // Changing Scheduled to another day moves the task to that day's card.
    const targetDate = "scheduledDate" in patch ? (patch.scheduledDate ?? undefined) : undefined;
    setByDay((prev) => {
      const task = (prev[dateISO] ?? []).find((t) => t.id === id);
      if (!task) return prev;
      if (targetDate && targetDate !== dateISO) {
        const moved = { ...task, ...patch };
        return {
          ...prev,
          [dateISO]: (prev[dateISO] ?? []).filter((t) => t.id !== id),
          [targetDate]: [...(prev[targetDate] ?? []), moved],
        };
      }
      return {
        ...prev,
        [dateISO]: (prev[dateISO] ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
      };
    });
    if (targetDate && targetDate !== dateISO) {
      setDetail((prev) =>
        prev && prev.id === id && prev.dateISO === dateISO ? { dateISO: targetDate, id } : prev,
      );
    }
    if (!hydratedRef.current) return;
    const apiPatch: Record<string, unknown> = {};
    if (patch.title !== undefined) apiPatch.title = patch.title;
    if (patch.status !== undefined) apiPatch.status = toApiStatus(patch.status);
    if (patch.priority !== undefined) apiPatch.priority = patch.priority;
    if (patch.projectId !== undefined) apiPatch.projectId = patch.projectId;
    if (patch.areaId !== undefined) apiPatch.lifeAreaId = patch.areaId;
    if (patch.scheduledDate !== undefined) apiPatch.scheduledDate = patch.scheduledDate;
    if (patch.dueDate !== undefined) apiPatch.dueDate = patch.dueDate;
    if (patch.deadlineType !== undefined) apiPatch.deadlineType = patch.deadlineType;
    if (patch.archived !== undefined) apiPatch.archived = patch.archived;
    if (Object.keys(apiPatch).length > 0) fire(api.task.update(id, apiPatch));
    if (patch.notes !== undefined) fire(api.note.save("task", id, patch.notes));
  }, []);

  const deleteTask = useCallback((dateISO: string, id: string) => {
    setByDay((prev) => ({
      ...prev,
      [dateISO]: (prev[dateISO] ?? []).filter((t) => t.id !== id),
    }));
    if (hydratedRef.current) fire(api.task.remove(id));
  }, []);

  const addProject = useCallback((input: ProjectInput): string => {
    const id = newId();
    const item: ProjectItem = {
      id,
      title: input.title,
      color: input.color ?? ITEM_COLORS[0],
      icon: input.icon ?? "briefcase",
      areaId: input.areaId ?? null,
      status: input.status ?? "planned",
      startDate: input.startDate ?? null,
      targetDate: input.targetDate ?? null,
      description: input.description ?? "",
      notes: "",
      archived: false,
    };
    setProjects((prev) => [...prev, item]);
    fire(
      api.project
        .create({
          title: input.title,
          icon: item.icon,
          color: item.color,
          lifeAreaId: item.areaId,
          status: item.status,
          startDate: item.startDate,
          targetDate: item.targetDate,
          description: item.description,
        })
        .then((created) => {
          if (created.id === id) return;
          // The backend minted its own id: remap references.
          setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, id: created.id } : p)));
          setByDay((prev) => {
            const out: ByDay = {};
            for (const [day, tasks] of Object.entries(prev)) {
              out[day] = tasks.map((t) =>
                t.projectId === id ? { ...t, projectId: created.id } : t,
              );
            }
            return out;
          });
          setSelectedProjectId((prev) => (prev === id ? created.id : prev));
        }),
    );
    return id;
  }, []);

  const addArea = useCallback((input: AreaInput): string => {
    const id = newId();
    const item: AreaItem = {
      id,
      title: input.title,
      color: input.color ?? "amber",
      icon: input.icon ?? "compass",
      description: input.description ?? "",
      notes: "",
    };
    setAreas((prev) => [...prev, item]);
    fire(
      api.area
        .create({
          name: input.title,
          icon: item.icon,
          color: item.color,
          description: item.description,
        })
        .then((created) => {
          if (created.id === id) return;
          setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, id: created.id } : a)));
          setByDay((prev) => {
            const out: ByDay = {};
            for (const [day, tasks] of Object.entries(prev)) {
              out[day] = tasks.map((t) => (t.areaId === id ? { ...t, areaId: created.id } : t));
            }
            return out;
          });
          setProjects((prev) =>
            prev.map((p) => (p.areaId === id ? { ...p, areaId: created.id } : p)),
          );
          setSelectedAreaId((prev) => (prev === id ? created.id : prev));
        }),
    );
    return id;
  }, []);

  const updateProject = useCallback((id: string, patch: ProjectPatch) => {
    if ("title" in patch && !patch.title?.trim()) return;
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    if (!hydratedRef.current) return;
    const apiPatch: Record<string, unknown> = {};
    if (patch.title !== undefined) apiPatch.title = patch.title;
    if (patch.description !== undefined) apiPatch.description = patch.description;
    if (patch.areaId !== undefined) apiPatch.lifeAreaId = patch.areaId;
    if (patch.status !== undefined) apiPatch.status = patch.status;
    if (patch.icon !== undefined) apiPatch.icon = patch.icon;
    if (patch.color !== undefined) apiPatch.color = patch.color;
    if (patch.startDate !== undefined) apiPatch.startDate = patch.startDate;
    if (patch.targetDate !== undefined) apiPatch.targetDate = patch.targetDate;
    if (patch.archived !== undefined) apiPatch.archived = patch.archived;
    if (Object.keys(apiPatch).length > 0) fire(api.project.update(id, apiPatch));
    if (patch.notes !== undefined) fire(api.note.save("project", id, patch.notes));
  }, []);

  const updateArea = useCallback((id: string, patch: AreaPatch) => {
    if ("title" in patch && !patch.title?.trim()) return;
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    if (!hydratedRef.current) return;
    const apiPatch: Record<string, unknown> = {};
    if (patch.title !== undefined) apiPatch.name = patch.title;
    if (patch.description !== undefined) apiPatch.description = patch.description;
    if (patch.icon !== undefined) apiPatch.icon = patch.icon;
    if (patch.color !== undefined) apiPatch.color = patch.color;
    if (Object.keys(apiPatch).length > 0) fire(api.area.update(id, apiPatch));
    if (patch.notes !== undefined) fire(api.note.save("area", id, patch.notes));
  }, []);

  /** Deleting unlinks the item from every task that references it. */
  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setSelectedProjectId((prev) => (prev === id ? null : prev));
    setByDay((prev) => {
      const out: ByDay = {};
      for (const [day, tasks] of Object.entries(prev)) {
        out[day] = tasks.map((t) => (t.projectId === id ? { ...t, projectId: null } : t));
      }
      return out;
    });
    if (hydratedRef.current) fire(api.project.remove(id));
  }, []);

  const deleteArea = useCallback((id: string) => {
    setAreas((prev) => prev.filter((a) => a.id !== id));
    setSelectedAreaId((prev) => (prev === id ? null : prev));
    setByDay((prev) => {
      const out: ByDay = {};
      for (const [day, tasks] of Object.entries(prev)) {
        out[day] = tasks.map((t) => (t.areaId === id ? { ...t, areaId: null } : t));
      }
      return out;
    });
    setProjects((prev) => prev.map((p) => (p.areaId === id ? { ...p, areaId: null } : p)));
    if (hydratedRef.current) fire(api.area.remove(id));
  }, []);

  const openProject = useCallback((id: string | null) => setSelectedProjectId(id), []);
  const openArea = useCallback((id: string | null) => setSelectedAreaId(id), []);

  const openDetail = useCallback((ref: TaskRef) => setDetail(ref), []);
  const closeDetail = useCallback(() => setDetail(null), []);

  const value = useMemo<Store>(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      sidebarCollapsed,
      toggleSidebar,
      sidebarWidth,
      setSidebarWidth,
      section,
      setSection,
      hydrated,
      byDay,
      addTask,
      toggleTask,
      moveTask,
      updateTask,
      deleteTask,
      projects,
      areas,
      addProject,
      addArea,
      updateProject,
      updateArea,
      deleteProject,
      deleteArea,
      selectedProjectId,
      selectedAreaId,
      openProject,
      openArea,
      detail,
      openDetail,
      closeDetail,
    }),
    [
      theme,
      setTheme,
      toggleTheme,
      sidebarCollapsed,
      toggleSidebar,
      sidebarWidth,
      setSidebarWidth,
      section,
      setSection,
      hydrated,
      byDay,
      addTask,
      toggleTask,
      moveTask,
      updateTask,
      deleteTask,
      projects,
      areas,
      addProject,
      addArea,
      updateProject,
      updateArea,
      deleteProject,
      deleteArea,
      selectedProjectId,
      selectedAreaId,
      openProject,
      openArea,
      detail,
      openDetail,
      closeDetail,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}
