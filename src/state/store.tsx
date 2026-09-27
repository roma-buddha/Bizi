import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeSetting = "light" | "dark";

export type TaskStatus = "todo" | "in_progress" | "waiting" | "done";
export type Priority = "p1" | "p2" | "p3";
export type DeadlineType = "none" | "soft" | "hard";

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "waiting", "done"];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  waiting: "Waiting",
  done: "Done",
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

export interface NamedItem {
  id: string;
  title: string;
  color: string;
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

export type TaskPatch = Partial<Omit<DailyTask, "id">>;

const TASKS_KEY = "bizi.daily-tasks.v1";
const PROJECTS_KEY = "bizi.projects.v1";
const AREAS_KEY = "bizi.areas.v1";

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
  // Daily planner state (localStorage-backed until the data layer lands).
  byDay: ByDay;
  addTask: (dateISO: string, title: string) => void;
  toggleTask: (dateISO: string, id: string) => void;
  moveTask: (sourceDate: string, targetDate: string, id: string, index?: number) => void;
  updateTask: (dateISO: string, id: string, patch: TaskPatch) => void;
  deleteTask: (dateISO: string, id: string) => void;
  projects: NamedItem[];
  areas: NamedItem[];
  addProject: (title: string) => string;
  addArea: (title: string) => string;
  renameProject: (id: string, title: string) => void;
  renameArea: (id: string, title: string) => void;
  deleteProject: (id: string) => void;
  deleteArea: (id: string) => void;
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

/** Migrate legacy {id,title,done} tasks to the full shape. */
function migrateTask(raw: Partial<DailyTask> & { id: string; title: string }): DailyTask {
  const legacy = raw as Partial<DailyTask> & { id: string; title: string; done?: boolean };
  const status: TaskStatus = raw.status ?? (legacy.done === true ? "done" : "todo");
  return {
    id: raw.id,
    title: raw.title,
    status,
    priority: raw.priority ?? "p3",
    projectId: raw.projectId ?? null,
    areaId: raw.areaId ?? null,
    scheduledDate: raw.scheduledDate ?? null,
    dueDate: raw.dueDate ?? null,
    deadlineType: raw.deadlineType ?? "none",
    notes: raw.notes ?? "",
    archived: raw.archived ?? false,
  };
}

function loadTasks(): ByDay {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<DailyTask>[]>;
    const out: ByDay = {};
    for (const [day, tasks] of Object.entries(parsed)) {
      out[day] = (tasks ?? []).map((t) => migrateTask(t as Partial<DailyTask> & { id: string; title: string }));
    }
    return out;
  } catch {
    return {};
  }
}

function loadNamed(key: string): NamedItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<NamedItem>[];
    // Assign colors to items stored before colors existed.
    return parsed.map((item, i) => ({
      id: item.id ?? newId(),
      title: item.title ?? "Untitled",
      color: item.color ?? ITEM_COLORS[i % ITEM_COLORS.length],
    }));
  } catch {
    // corrupted or unavailable storage
  }
  return [];
}

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
  const [byDay, setByDay] = useState<ByDay>(loadTasks);
  const [projects, setProjects] = useState<NamedItem[]>(() => loadNamed(PROJECTS_KEY));
  const [areas, setAreas] = useState<NamedItem[]>(() => loadNamed(AREAS_KEY));
  const [detail, setDetail] = useState<TaskRef | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(TASKS_KEY, JSON.stringify(byDay));
    } catch {
      // storage unavailable
    }
  }, [byDay]);

  useEffect(() => {
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    } catch {
      // storage unavailable
    }
  }, [projects]);

  useEffect(() => {
    try {
      localStorage.setItem(AREAS_KEY, JSON.stringify(areas));
    } catch {
      // storage unavailable
    }
  }, [areas]);

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

  const addTask = useCallback((dateISO: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const task: DailyTask = {
      id: newId(),
      title: trimmed,
      status: "todo",
      priority: "p3",
      projectId: null,
      areaId: null,
      scheduledDate: null,
      dueDate: null,
      deadlineType: "none",
      notes: "",
      archived: false,
    };
    setByDay((prev) => ({ ...prev, [dateISO]: [...(prev[dateISO] ?? []), task] }));
  }, []);

  const toggleTask = useCallback((dateISO: string, id: string) => {
    setByDay((prev) => ({
      ...prev,
      [dateISO]: (prev[dateISO] ?? []).map((t) =>
        t.id === id ? { ...t, status: t.status === "done" ? "todo" : "done" } : t,
      ),
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
  }, []);

  const deleteTask = useCallback((dateISO: string, id: string) => {
    setByDay((prev) => ({
      ...prev,
      [dateISO]: (prev[dateISO] ?? []).filter((t) => t.id !== id),
    }));
  }, []);

  const addProject = useCallback((title: string): string => {
    const id = newId();
    setProjects((prev) => [
      ...prev,
      { id, title, color: ITEM_COLORS[prev.length % ITEM_COLORS.length] },
    ]);
    return id;
  }, []);

  const addArea = useCallback((title: string): string => {
    const id = newId();
    setAreas((prev) => [...prev, { id, title, color: ITEM_COLORS[prev.length % ITEM_COLORS.length] }]);
    return id;
  }, []);

  const renameProject = useCallback((id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, title: trimmed } : p)));
  }, []);

  const renameArea = useCallback((id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, title: trimmed } : a)));
  }, []);

  /** Deleting unlinks the item from every task that references it. */
  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setByDay((prev) => {
      const out: ByDay = {};
      for (const [day, tasks] of Object.entries(prev)) {
        out[day] = tasks.map((t) => (t.projectId === id ? { ...t, projectId: null } : t));
      }
      return out;
    });
  }, []);

  const deleteArea = useCallback((id: string) => {
    setAreas((prev) => prev.filter((a) => a.id !== id));
    setByDay((prev) => {
      const out: ByDay = {};
      for (const [day, tasks] of Object.entries(prev)) {
        out[day] = tasks.map((t) => (t.areaId === id ? { ...t, areaId: null } : t));
      }
      return out;
    });
  }, []);

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
      renameProject,
      renameArea,
      deleteProject,
      deleteArea,
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
      renameProject,
      renameArea,
      deleteProject,
      deleteArea,
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
