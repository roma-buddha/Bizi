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
import { listen } from "@tauri-apps/api/event";
import { api } from "../db";
import { PersistenceCoordinator, DraftRegistry } from "./persistence";
import type { WorkspaceSnapshot } from "../models/types";
import type { Task as ApiTask } from "../models/types";
import { isTauriRuntime } from "../runtime";

export type ThemeSetting = "light" | "dark";

export type TaskStatus =
  "todo" | "in_progress" | "waiting" | "done" | "cancelled";
export type Priority = "p1" | "p2" | "p3";
export type DeadlineType = "none" | "soft" | "hard";

export const TASK_STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "waiting",
  "done",
  "cancelled",
];
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
export type Section = "today" | "projects" | "areas" | "life";

export const SECTION_LABELS: Record<Section, string> = {
  today: "To-Do",
  projects: "Projects",
  areas: "Areas",
  life: "Life",
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
  pending: number;
  error: string | null;
  reportError: (reason: unknown) => void;
  dismissError: () => void;
  retryLoad: () => void;
  flushDrafts: () => Promise<boolean>;
  registerDraft: (key: string, flush: () => Promise<boolean>) => () => void;
  // Daily planner state (SQLite-backed via the Bizi API).
  byDay: ByDay;
  addTask: (
    dateISO: string,
    title: string,
    link?: { projectId?: string | null; areaId?: string | null },
  ) => Promise<string | null>;
  toggleTask: (dateISO: string, id: string) => Promise<boolean>;
  moveTask: (
    sourceDate: string,
    targetDate: string,
    id: string,
    index?: number,
  ) => Promise<boolean>;
  updateTask: (
    dateISO: string,
    id: string,
    patch: TaskPatch,
  ) => Promise<boolean>;
  deleteTask: (dateISO: string, id: string) => Promise<boolean>;
  projects: ProjectItem[];
  areas: AreaItem[];
  addProject: (input: ProjectInput) => Promise<string | null>;
  addArea: (input: AreaInput) => Promise<string | null>;
  updateProject: (id: string, patch: ProjectPatch) => Promise<boolean>;
  updateArea: (id: string, patch: AreaPatch) => Promise<boolean>;
  deleteProject: (id: string) => Promise<boolean>;
  deleteArea: (id: string) => Promise<boolean>;
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeSetting>(loadTheme);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("bizi.sidebar") === "1",
  );
  // Same bounds and default as Lotus Notes: 220-480px, default 272px.
  const [sidebarWidth, setSidebarWidthState] = useState(() =>
    Math.min(
      480,
      Math.max(220, Number(localStorage.getItem("bizi.sidebar-width")) || 272),
    ),
  );
  const [section, setSectionState] = useState<Section>("today");
  const [hydrated, setHydrated] = useState(false);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const drafts = useMemo(() => new DraftRegistry(), []);
  const flushDrafts = useCallback(() => drafts.flush(), [drafts]);
  const registerDraft = useCallback(
    (key: string, flush: () => Promise<boolean>) => drafts.register(key, flush),
    [drafts],
  );
  const dismissError = useCallback(() => setError(null), []);
  const report = useCallback(
    (reason: unknown) =>
      setError(reason instanceof Error ? reason.message : String(reason)),
    [],
  );
  const [byDay, setByDay] = useState<ByDay>({});
  const byDayRef = useRef(byDay);
  useEffect(() => {
    byDayRef.current = byDay;
  }, [byDay]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [areas, setAreas] = useState<AreaItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskRef | null>(null);

  const publish = useCallback((snapshot: WorkspaceSnapshot) => {
    const notes = new Map(
      snapshot.notes.map((n) => [n.entityType + ":" + n.entityId, n.content]),
    );
    const buckets: ByDay = {};
    for (const row of snapshot.tasks)
      (buckets[row.scheduledDate ?? UNSCHEDULED] ??= []).push(
        taskFromApi(row, notes.get("task:" + row.id) ?? ""),
      );
    setByDay((previous) => {
      for (const [date, tasks] of Object.entries(buckets)) {
        const old = previous[date];
        if (old && JSON.stringify(old) === JSON.stringify(tasks))
          buckets[date] = old;
      }
      return buckets;
    });
    setProjects(
      snapshot.projects.map((row) => ({
        id: row.id,
        title: row.title,
        color: row.color || "slate",
        icon: row.icon || "briefcase",
        areaId: row.lifeAreaId,
        status: row.status,
        startDate: row.startDate,
        targetDate: row.targetDate,
        description: row.description,
        notes: notes.get("project:" + row.id) ?? "",
        archived: row.archived,
      })),
    );
    setAreas(
      snapshot.areas
        .filter((a) => !a.archived)
        .map((row) => ({
          id: row.id,
          title: row.name,
          color: row.color || "amber",
          icon: row.icon || "compass",
          description: row.description,
          notes: notes.get("area:" + row.id) ?? "",
        })),
    );
    setDetail((previous) => {
      if (!previous) return null;
      const row = snapshot.tasks.find((t) => t.id === previous.id);
      return row
        ? { dateISO: row.scheduledDate ?? UNSCHEDULED, id: row.id }
        : null;
    });
    setHydrated(true);
  }, []);
  const [coordinator, setCoordinator] =
    useState<PersistenceCoordinator<WorkspaceSnapshot> | null>(null);
  useEffect(() => {
    const next = new PersistenceCoordinator(
      api.snapshot,
      publish,
      report,
      setPending,
    );
    setCoordinator(next);
    void next.refresh().catch(() => undefined);
    let unlisten: (() => void) | undefined;
    let disposed = false;
    if (isTauriRuntime()) {
      listen("bizi://data-changed", () => {
        void next.refresh().catch(() => undefined);
      })
        .then((fn) => {
          if (disposed) fn();
          else unlisten = fn;
        })
        .catch(report);
    }
    return () => {
      disposed = true;
      unlisten?.();
      next.dispose();
    };
  }, [publish, report]);
  const retryLoad = useCallback(() => {
    void coordinator
      ?.refresh()
      .then(() => setError(null))
      .catch(() => undefined);
  }, [coordinator]);
  const run = useCallback(
    async <T,>(write: () => Promise<T>): Promise<T | null> => {
      if (!hydrated || !coordinator) {
        report(new Error("Wait for data to load before editing"));
        return null;
      }
      try {
        return await coordinator.mutate(write);
      } catch {
        return null;
      }
    },
    [coordinator, hydrated, report],
  );

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
    async (
      dateISO: string,
      title: string,
      link?: { projectId?: string | null; areaId?: string | null },
    ) => {
      const result = await run(() =>
        api.task.create({
          title: title.trim(),
          status: "todo",
          priority: "p3",
          scheduledDate: dateISO === UNSCHEDULED ? null : dateISO,
          projectId: link?.projectId ?? null,
          lifeAreaId: link?.areaId ?? null,
        }),
      );
      return result?.id ?? null;
    },
    [run],
  );
  const toggleTask = useCallback(
    async (dateISO: string, id: string) => {
      const task = byDayRef.current[dateISO]?.find((t) => t.id === id);
      if (!task) return false;
      return (
        (await run(async () => {
          await api.task.setComplete(id, task.status !== "done");
          return true;
        })) ?? false
      );
    },
    [run],
  );
  const moveTask = useCallback(
    async (
      _sourceDate: string,
      targetDate: string,
      id: string,
      index?: number,
    ) => {
      const before =
        index === undefined
          ? null
          : ((byDayRef.current[targetDate] ?? []).filter(
              (t) => !t.archived && t.id !== id,
            )[index]?.id ?? null);
      return (
        (await run(async () => {
          await api.task.move(
            id,
            targetDate === UNSCHEDULED ? null : targetDate,
            before,
          );
          return true;
        })) ?? false
      );
    },
    [run],
  );
  const updateTask = useCallback(
    async (_dateISO: string, id: string, patch: TaskPatch) => {
      const changes: Record<string, unknown> = {};
      for (const key of [
        "title",
        "priority",
        "scheduledDate",
        "dueDate",
        "deadlineType",
        "archived",
      ] as const)
        if (patch[key] !== undefined) changes[key] = patch[key];
      if (patch.status !== undefined)
        changes.status = toApiStatus(patch.status);
      if (patch.projectId !== undefined) changes.projectId = patch.projectId;
      if (patch.areaId !== undefined) changes.lifeAreaId = patch.areaId;
      return (
        (await run(async () => {
          if (Object.keys(changes).length) await api.task.update(id, changes);
          if (patch.notes !== undefined)
            await api.note.save("task", id, patch.notes);
          return true;
        })) ?? false
      );
    },
    [run],
  );
  const deleteTask = useCallback(
    async (_dateISO: string, id: string) =>
      (await run(async () => {
        await api.task.remove(id);
        return true;
      })) ?? false,
    [run],
  );
  const addProject = useCallback(
    async (input: ProjectInput) => {
      const result = await run(() =>
        api.project.create({
          title: input.title,
          icon: input.icon ?? "briefcase",
          color: input.color ?? ITEM_COLORS[0],
          lifeAreaId: input.areaId ?? null,
          status: input.status ?? "planned",
          startDate: input.startDate ?? null,
          targetDate: input.targetDate ?? null,
          description: input.description ?? "",
        }),
      );
      return result?.id ?? null;
    },
    [run],
  );
  const addArea = useCallback(
    async (input: AreaInput) => {
      const result = await run(() =>
        api.area.create({
          name: input.title,
          icon: input.icon ?? "compass",
          color: input.color ?? "amber",
          description: input.description ?? "",
        }),
      );
      return result?.id ?? null;
    },
    [run],
  );
  const updateProject = useCallback(
    async (id: string, patch: ProjectPatch) => {
      const { notes, areaId, ...rest } = patch;
      const changes = {
        ...rest,
        ...(areaId !== undefined ? { lifeAreaId: areaId } : {}),
      };
      return (
        (await run(async () => {
          if (Object.keys(changes).length)
            await api.project.update(id, changes);
          if (notes !== undefined) await api.note.save("project", id, notes);
          return true;
        })) ?? false
      );
    },
    [run],
  );
  const updateArea = useCallback(
    async (id: string, patch: AreaPatch) => {
      const { notes, title, ...rest } = patch;
      const changes = {
        ...rest,
        ...(title !== undefined ? { name: title } : {}),
      };
      return (
        (await run(async () => {
          if (Object.keys(changes).length) await api.area.update(id, changes);
          if (notes !== undefined) await api.note.save("area", id, notes);
          return true;
        })) ?? false
      );
    },
    [run],
  );
  const deleteProject = useCallback(
    async (id: string) => {
      const saved = await run(async () => {
        await api.project.remove(id);
        return true;
      });
      if (saved)
        setSelectedProjectId((previous) => (previous === id ? null : previous));
      return saved ?? false;
    },
    [run],
  );
  const deleteArea = useCallback(
    async (id: string) => {
      const saved = await run(async () => {
        await api.area.remove(id);
        return true;
      });
      if (saved)
        setSelectedAreaId((previous) => (previous === id ? null : previous));
      return saved ?? false;
    },
    [run],
  );

  const setSection = useCallback(
    (next: Section) => {
      void flushDrafts().then((ok) => {
        if (ok) setSectionState(next);
      });
    },
    [flushDrafts],
  );
  const openProject = useCallback(
    (id: string | null) => {
      void flushDrafts().then((ok) => {
        if (ok) setSelectedProjectId(id);
      });
    },
    [flushDrafts],
  );
  const openArea = useCallback(
    (id: string | null) => {
      void flushDrafts().then((ok) => {
        if (ok) setSelectedAreaId(id);
      });
    },
    [flushDrafts],
  );

  const openDetail = useCallback(
    (ref: TaskRef) => {
      void flushDrafts().then((ok) => {
        if (ok) setDetail(ref);
      });
    },
    [flushDrafts],
  );
  const closeDetail = useCallback(() => {
    void flushDrafts().then((ok) => {
      if (ok) setDetail(null);
    });
  }, [flushDrafts]);

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
      pending,
      error,
      reportError: report,
      dismissError,
      retryLoad,
      flushDrafts,
      registerDraft,
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
      pending,
      error,
      report,
      dismissError,
      retryLoad,
      flushDrafts,
      registerDraft,
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

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}
