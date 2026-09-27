// Browser fallback driver: mirrors the Tauri/SQLite API over localStorage so
// the full UI is usable in a plain browser during development and preview.
// The Tauri desktop build always uses the real SQLite backend.

import type {
  AreaInput,
  AreaPatch,
  EntityType,
  Goal,
  GoalInput,
  GoalPatch,
  Habit,
  HabitEntry,
  HabitPatch,
  LifeArea,
  Note,
  Project,
  ProjectFilter,
  ProjectInput,
  ProjectPatch,
  Review,
  ReviewContent,
  ReviewStats,
  ReviewType,
  SearchResults,
  Task,
  TaskCounts,
  TaskFilter,
  TaskInput,
  TaskPatch,
} from "../models/types";
import type { BiziApi } from "./index";
import { addDaysISO, todayISO } from "../utils/date";

interface DB {
  areas: LifeArea[];
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  habits: Habit[];
  habitEntries: HabitEntry[];
  reviews: Review[];
  notes: Note[];
}

const STORAGE_KEY = "bizi.db.v1";

function uid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

const PRIORITY_RANK: Record<string, number> = { p1: 1, p2: 2, p3: 3, p4: 4 };

function sortTasks(rows: Task[]): Task[] {
  return [...rows].sort((a, b) => {
    const aDone = a.status === "completed" || a.status === "cancelled" ? 1 : 0;
    const bDone = b.status === "completed" || b.status === "cancelled" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const aNull = a.scheduledDate ? 0 : 1;
    const bNull = b.scheduledDate ? 0 : 1;
    if (aNull !== bNull) return aNull - bNull;
    if (a.scheduledDate && b.scheduledDate && a.scheduledDate !== b.scheduledDate)
      return a.scheduledDate < b.scheduledDate ? -1 : 1;
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

function seedDB(): DB {
  const t = todayISO();
  const iso = (d: number) => addDaysISO(t, d);
  const ts = now();
  const mk = {
    area(name: string, icon: string, color: string, sortOrder: number): LifeArea {
      return { id: uid(), name, description: "", icon, color, sortOrder, createdAt: ts, updatedAt: ts, archived: false };
    },
  };

  const business = mk.area("Business", "briefcase", "amber", 0);
  const research = mk.area("Research", "flask-conical", "blue", 1);
  const health = mk.area("Health", "heart-pulse", "green", 2);
  const finances = mk.area("Finances", "wallet", "violet", 3);
  const relationships = mk.area("Relationships", "users", "rose", 4);
  const lifeOrg = mk.area("Life Organization", "calendar-check", "slate", 5);
  const areas = [business, research, health, finances, relationships, lifeOrg];

  const goal = (
    title: string,
    area: LifeArea,
    status: Goal["status"],
    priority: Goal["priority"],
    target: string,
  ): Goal => ({
    id: uid(),
    title,
    description: "",
    lifeAreaId: area.id,
    status,
    priority,
    startDate: t,
    targetDate: target,
    progressMode: "auto",
    manualProgress: 0,
    createdAt: ts,
    updatedAt: ts,
    completedAt: null,
    archived: false,
    areaName: area.name,
    projectIds: [],
  });

  const gFin = goal("Financial Independence", business, "active", "p1", iso(730));
  const gRes = goal("Publish High-Quality Research", research, "active", "p2", iso(365));
  const gFit = goal("Improve Fitness", health, "active", "p3", iso(180));
  const gNet = goal("Build an International Research Network", research, "planned", "p3", iso(540));
  const gCit = goal("Obtain Spanish Citizenship", finances, "on_hold", "p4", iso(900));
  gFin.projectIds = []; // linked after projects exist
  const goals = [gFin, gRes, gFit, gNet, gCit];

  const project = (
    title: string,
    area: LifeArea,
    status: Project["status"],
    priority: Project["priority"],
    target: string,
  ): Project => ({
    id: uid(),
    title,
    description: "",
    lifeAreaId: area.id,
    status,
    priority,
    icon: "briefcase",
    color: area.color,
    startDate: t,
    targetDate: target,
    progressMode: "auto",
    manualProgress: 0,
    createdAt: ts,
    updatedAt: ts,
    completedAt: null,
    archived: false,
    areaName: area.name,
    goalIds: [],
    openTasks: 0,
    totalTasks: 0,
  });

  const pSci = project("SciMaps", business, "active", "p1", iso(120));
  const pRev = project("Human-AI Interaction Review", research, "active", "p2", iso(60));
  const pWeb = project("Personal Website Redesign", business, "planned", "p3", iso(45));
  gFin.projectIds.push(pSci.id);
  gRes.projectIds.push(pRev.id);
  pSci.goalIds.push(gFin.id);
  pRev.goalIds.push(gRes.id);
  const projects = [pSci, pRev, pWeb];

  const task = (
    title: string,
    status: Task["status"],
    area: LifeArea | null,
    proj: Project | null,
    scheduled: string | null,
    due: string | null,
    deadline: Task["deadlineType"],
    priority: Task["priority"],
    completedDaysAgo: number | null = null,
  ): Task => ({
    id: uid(),
    title,
    description: "",
    status,
    lifeAreaId: area?.id ?? null,
    projectId: proj?.id ?? null,
    scheduledDate: scheduled,
    dueDate: due,
    deadlineType: deadline,
    priority,
    estimatedMinutes: null,
    actualMinutes: null,
    recurrenceRule: null,
    parentTaskId: null,
    createdAt: ts,
    updatedAt: ts,
    completedAt: completedDaysAgo != null ? iso(-completedDaysAgo) : null,
    archived: false,
    areaName: area?.name ?? null,
    projectName: proj?.title ?? null,
    goalIds: [],
  });

  const tasks: Task[] = [];
  const add = (x: Task) => {
    tasks.push(x);
    return x;
  };

  const tOnboard = add(task("Improve onboarding", "todo", business, pSci, t, iso(14), "soft", "p2"));
  add(task("Fix profile statistics", "todo", business, pSci, t, t, "hard", "p1"));
  add(task("Design pricing page", "todo", business, pSci, iso(2), iso(10), "soft", "p2"));
  add(task("Implement OpenAlex connection", "completed", business, pSci, iso(-6), iso(-4), "soft", "p2", 4));
  const tReview = add(task("Review 10 papers", "in_progress", research, pRev, t, iso(7), "soft", "p2"));
  add(task("Update search strategy", "todo", research, pRev, iso(1), null, "none", "p3"));
  add(task("Draft methodology section", "todo", research, pRev, iso(3), iso(21), "hard", "p1"));
  add(task("Book dentist appointment", "todo", health, null, t, iso(30), "soft", "p3"));
  add(task("Go to gym", "todo", health, null, t, null, "none", "p3"));
  add(task("Review quarterly budget", "todo", finances, null, iso(5), iso(12), "soft", "p3"));
  add(task("Submit conference paper", "waiting", research, null, iso(4), iso(14), "hard", "p1"));
  add(task("Renew passport", "todo", finances, null, null, iso(-2), "hard", "p1"));
  add(task("File tax documents", "completed", finances, null, iso(-9), iso(-7), "hard", "p2", 7));
  add(task("Water the plants", "completed", health, null, iso(-1), null, "none", "p4", 1));
  const sub = add(task("Sketch new onboarding screens", "todo", business, pSci, iso(1), null, "none", "p3"));
  sub.parentTaskId = tOnboard.id;
  add(task("Collect user feedback on current onboarding", "completed", business, pSci, iso(-3), null, "none", "p3", 2));
  add(task("Look into new laptop", "inbox", null, null, null, null, "none", "p3"));
  add(task("Idea: weekly planning template", "inbox", null, null, null, null, "none", "p4"));
  add(task("Ask Anna about the conference hotel", "inbox", null, null, null, null, "none", "p3"));
  tReview.goalIds.push(gRes.id);
  tOnboard.goalIds.push(gFin.id);

  const habit = (name: string, area: LifeArea, frequencyType: Habit["frequencyType"], frequencyRule: string): Habit => ({
    id: uid(),
    name,
    lifeAreaId: area.id,
    frequencyType,
    frequencyRule,
    startDate: t,
    status: "active",
    createdAt: ts,
    areaName: area.name,
  });
  const habits = [
    habit("Gym", health, "daily", ""),
    habit("Read 20 pages", research, "daily", ""),
    habit("Walk", health, "weekly", "3"),
    habit("Meditation", health, "weekdays", ""),
  ];
  const habitEntries: HabitEntry[] = [];
  for (const h of habits) {
    for (let back = 0; back < 14; back += 1) {
      habitEntries.push({
        habitId: h.id,
        date: iso(-back),
        completed: (back + h.name.length) % 3 !== 0,
        value: null,
      });
    }
  }

  const notes: Note[] = [
    {
      id: uid(),
      entityType: "project",
      entityId: pWeb.id,
      content: "Goals for the redesign:\n\n- Cleaner landing page\n- Better mobile layout\n- Add a changelog section",
      updatedAt: ts,
    },
  ];

  return { areas, goals, projects, tasks, habits, habitEntries, reviews: [], notes };
}

function load(): DB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw) as DB);
  } catch {
    // corrupted storage: reseed
  }
  // First run after the point0 merge: adopt data stored by the planner branch.
  const imported = importLegacyPlannerData();
  if (imported) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
    return imported;
  }
  const db = seedDB();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  return db;
}

/** Fill fields that were added after a DB was first stored. */
function normalize(db: DB): DB {
  const palette = ["amber", "blue", "green", "violet", "rose", "slate", "teal", "orange"];
  db.projects = (db.projects ?? []).map((p, i) => ({
    ...p,
    icon: p.icon ?? "briefcase",
    color: p.color ?? palette[i % palette.length],
  }));
  return db;
}

interface LegacyTask {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  projectId?: string | null;
  areaId?: string | null;
  scheduledDate?: string | null;
  dueDate?: string | null;
  deadlineType?: string;
  notes?: string;
  archived?: boolean;
  done?: boolean;
}

interface LegacyArea {
  id?: string;
  title?: string;
  color?: string;
  icon?: string;
  description?: string;
  notes?: string;
}

interface LegacyProject {
  id?: string;
  title?: string;
  color?: string;
  icon?: string;
  areaId?: string | null;
  status?: string;
  startDate?: string | null;
  targetDate?: string | null;
  description?: string;
  notes?: string;
  archived?: boolean;
}

/** Adopt point0-planner localStorage data (bizi.daily-tasks/projects/areas.v1). */
function importLegacyPlannerData(): DB | null {
  let rawTasks: string | null = null;
  let rawProjects: string | null = null;
  let rawAreas: string | null = null;
  try {
    rawTasks = localStorage.getItem("bizi.daily-tasks.v1");
    rawProjects = localStorage.getItem("bizi.projects.v1");
    rawAreas = localStorage.getItem("bizi.areas.v1");
  } catch {
    return null;
  }
  if (!rawTasks && !rawProjects && !rawAreas) return null;
  const ts = now();
  const notes: Note[] = [];
  const noteFor = (entityType: EntityType, entityId: string, content: string) => {
    if (content) notes.push({ id: uid(), entityType, entityId, content, updatedAt: ts });
  };

  const areas: LifeArea[] = [];
  try {
    const parsed = rawAreas ? (JSON.parse(rawAreas) as LegacyArea[]) : [];
    parsed.forEach((a, i) => {
      if (!a.id) return;
      areas.push({
        id: a.id,
        name: a.title ?? "Untitled",
        description: a.description ?? "",
        icon: a.icon ?? "briefcase",
        color: a.color ?? "amber",
        sortOrder: i,
        createdAt: ts,
        updatedAt: ts,
        archived: false,
      });
      noteFor("area", a.id, a.notes ?? "");
    });
  } catch {
    // ignore malformed legacy areas
  }

  const projects: Project[] = [];
  try {
    const parsed = rawProjects ? (JSON.parse(rawProjects) as LegacyProject[]) : [];
    parsed.forEach((p) => {
      if (!p.id) return;
      projects.push({
        id: p.id,
        title: p.title ?? "Untitled",
        description: p.description ?? "",
        lifeAreaId: p.areaId ?? null,
        status: (p.status as Project["status"]) ?? "planned",
        priority: "p3",
        icon: p.icon ?? "briefcase",
        color: p.color ?? "slate",
        startDate: p.startDate ?? null,
        targetDate: p.targetDate ?? null,
        progressMode: "auto",
        manualProgress: 0,
        createdAt: ts,
        updatedAt: ts,
        completedAt: null,
        archived: p.archived ?? false,
        areaName: null,
        goalIds: [],
        openTasks: 0,
        totalTasks: 0,
      });
      noteFor("project", p.id, p.notes ?? "");
    });
  } catch {
    // ignore malformed legacy projects
  }

  const statusMap: Record<string, Task["status"]> = {
    done: "completed",
    todo: "todo",
    in_progress: "in_progress",
    waiting: "waiting",
    cancelled: "cancelled",
  };
  const tasks: Task[] = [];
  try {
    const parsed = rawTasks
      ? (JSON.parse(rawTasks) as Record<string, LegacyTask[]>)
      : {};
    for (const [day, list] of Object.entries(parsed)) {
      const dayValid = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
      for (const t of list ?? []) {
        if (!t.id) continue;
        const done = t.done === true;
        tasks.push({
          id: t.id,
          title: t.title,
          description: "",
          status: statusMap[t.status ?? (done ? "done" : "todo")] ?? "todo",
          lifeAreaId: t.areaId ?? null,
          projectId: t.projectId ?? null,
          scheduledDate: t.scheduledDate ?? dayValid,
          dueDate: t.dueDate ?? null,
          deadlineType: (t.deadlineType as Task["deadlineType"]) ?? "none",
          priority: (t.priority as Task["priority"]) ?? "p3",
          estimatedMinutes: null,
          actualMinutes: null,
          recurrenceRule: null,
          parentTaskId: null,
          createdAt: ts,
          updatedAt: ts,
          completedAt: null,
          archived: t.archived ?? false,
          areaName: null,
          projectName: null,
          goalIds: [],
        });
        noteFor("task", t.id, t.notes ?? "");
      }
    }
  } catch {
    // ignore malformed legacy tasks
  }

  return { areas, goals: [], projects, tasks, habits: [], habitEntries: [], reviews: [], notes };
}

export function createBrowserApi(): BiziApi {
  const db = load();
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(db));

  const areaById = (id: string | null | undefined): LifeArea | undefined =>
    db.areas.find((a) => a.id === id);
  const enrichTask = (t: Task): Task => ({
    ...t,
    areaName: areaById(t.lifeAreaId)?.name ?? null,
    projectName: db.projects.find((p) => p.id === t.projectId)?.title ?? null,
  });

  const refreshProjectCounts = () => {
    for (const p of db.projects) {
      const tasks = db.tasks.filter((t) => t.projectId === p.id);
      p.totalTasks = tasks.length;
      p.openTasks = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length;
    }
  };

  return {
    area: {
      list: async (includeArchived = false) =>
        db.areas
          .filter((a) => includeArchived || !a.archived)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
      create: async (input: AreaInput) => {
        const item: LifeArea = {
          id: uid(),
          name: input.name,
          description: input.description ?? "",
          icon: input.icon ?? "",
          color: input.color ?? "",
          sortOrder: input.sortOrder ?? db.areas.length,
          createdAt: now(),
          updatedAt: now(),
          archived: false,
        };
        db.areas.push(item);
        save();
        return item;
      },
      update: async (id, patch: AreaPatch) => {
        const item = db.areas.find((a) => a.id === id);
        if (!item) throw new Error("area not found");
        Object.assign(item, patch, { updatedAt: now() });
        save();
      },
      remove: async (id) => {
        db.areas = db.areas.filter((a) => a.id !== id);
        save();
      },
    },
    goal: {
      list: async (includeArchived = false) =>
        db.goals
          .filter((g) => includeArchived || !g.archived)
          .map((g) => ({
            ...g,
            areaName: areaById(g.lifeAreaId)?.name ?? null,
            projectIds: db.projects.filter((p) => p.goalIds.includes(g.id)).map((p) => p.id),
          }))
          .sort((a, b) => {
            const ac = a.status === "completed" ? 1 : 0;
            const bc = b.status === "completed" ? 1 : 0;
            if (ac !== bc) return ac - bc;
            if (!!a.targetDate !== !!b.targetDate) return a.targetDate ? -1 : 1;
            return (a.targetDate ?? "").localeCompare(b.targetDate ?? "");
          }),
      create: async (input: GoalInput) => {
        const item: Goal = {
          id: uid(),
          title: input.title,
          description: input.description ?? "",
          lifeAreaId: input.lifeAreaId ?? null,
          status: input.status ?? "planned",
          priority: input.priority ?? "p3",
          startDate: input.startDate ?? null,
          targetDate: input.targetDate ?? null,
          progressMode: input.progressMode ?? "manual",
          manualProgress: input.manualProgress ?? 0,
          createdAt: now(),
          updatedAt: now(),
          completedAt: null,
          archived: false,
          areaName: areaById(input.lifeAreaId)?.name ?? null,
          projectIds: input.projectIds ?? [],
        };
        db.goals.push(item);
        save();
        return item;
      },
      update: async (id, patch: GoalPatch) => {
        const item = db.goals.find((g) => g.id === id);
        if (!item) throw new Error("goal not found");
        const { projectIds, status, ...rest } = patch;
        Object.assign(item, rest, { updatedAt: now() });
        if (status !== undefined) {
          item.status = status;
          item.completedAt = status === "completed" ? now() : null;
        }
        if (projectIds) {
          for (const p of db.projects) {
            const has = p.goalIds.includes(id);
            const should = projectIds.includes(p.id);
            if (has && !should) p.goalIds = p.goalIds.filter((g) => g !== id);
            if (!has && should) p.goalIds.push(id);
          }
          item.projectIds = projectIds;
        }
        save();
      },
      remove: async (id) => {
        db.goals = db.goals.filter((g) => g.id !== id);
        for (const p of db.projects) p.goalIds = p.goalIds.filter((g) => g !== id);
        save();
      },
    },
    project: {
      list: async (filter: ProjectFilter = {}) => {
        refreshProjectCounts();
        let rows = db.projects.filter((p) => filter.includeArchived || !p.archived);
        if (filter.areaId) rows = rows.filter((p) => p.lifeAreaId === filter.areaId);
        if (filter.statuses?.length) rows = rows.filter((p) => filter.statuses!.includes(p.status));
        if (filter.goalId) rows = rows.filter((p) => p.goalIds.includes(filter.goalId!));
        if (filter.q) {
          const q = filter.q.toLowerCase();
          rows = rows.filter((p) => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
        }
        return rows
          .map((p) => ({ ...p, areaName: areaById(p.lifeAreaId)?.name ?? null }))
          .sort((a, b) => {
            const ac = a.status === "completed" ? 1 : 0;
            const bc = b.status === "completed" ? 1 : 0;
            if (ac !== bc) return ac - bc;
            if (!!a.targetDate !== !!b.targetDate) return a.targetDate ? -1 : 1;
            return (a.targetDate ?? "").localeCompare(b.targetDate ?? "");
          });
      },
      create: async (input: ProjectInput) => {
        const item: Project = {
          id: uid(),
          title: input.title,
          description: input.description ?? "",
          lifeAreaId: input.lifeAreaId ?? null,
          status: input.status ?? "planned",
          priority: input.priority ?? "p3",
          icon: input.icon ?? "briefcase",
          color: input.color ?? "slate",
          startDate: input.startDate ?? null,
          targetDate: input.targetDate ?? null,
          progressMode: input.progressMode ?? "auto",
          manualProgress: input.manualProgress ?? 0,
          createdAt: now(),
          updatedAt: now(),
          completedAt: null,
          archived: false,
          areaName: areaById(input.lifeAreaId)?.name ?? null,
          goalIds: input.goalIds ?? [],
          openTasks: 0,
          totalTasks: 0,
        };
        db.projects.push(item);
        save();
        return item;
      },
      update: async (id, patch: ProjectPatch) => {
        const item = db.projects.find((p) => p.id === id);
        if (!item) throw new Error("project not found");
        const { goalIds, status, ...rest } = patch;
        Object.assign(item, rest, { updatedAt: now() });
        if (status !== undefined) {
          item.status = status;
          item.completedAt = status === "completed" ? now() : null;
        }
        if (goalIds) item.goalIds = goalIds;
        save();
      },
      remove: async (id) => {
        db.projects = db.projects.filter((p) => p.id !== id);
        save();
      },
    },
    task: {
      list: async (filter: TaskFilter = {}) => {
        let rows = [...db.tasks];        if (filter.statuses?.length) rows = rows.filter((t) => filter.statuses!.includes(t.status));
        const excluded = filter.excludeStatuses ?? ["completed", "cancelled"];
        if (excluded.length) rows = rows.filter((t) => !excluded.includes(t.status));
        if (filter.areaId) rows = rows.filter((t) => t.lifeAreaId === filter.areaId);
        if (filter.projectId) rows = rows.filter((t) => t.projectId === filter.projectId);
        if (filter.goalId) rows = rows.filter((t) => t.goalIds.includes(filter.goalId!));
        if (filter.priority) rows = rows.filter((t) => t.priority === filter.priority);
        if (filter.deadlineType) rows = rows.filter((t) => t.deadlineType === filter.deadlineType);
        if (filter.scheduledFrom) rows = rows.filter((t) => t.scheduledDate && t.scheduledDate >= filter.scheduledFrom!);
        if (filter.scheduledTo) rows = rows.filter((t) => t.scheduledDate && t.scheduledDate <= filter.scheduledTo!);
        if (filter.dueFrom) rows = rows.filter((t) => t.dueDate && t.dueDate >= filter.dueFrom!);
        if (filter.dueTo) rows = rows.filter((t) => t.dueDate && t.dueDate <= filter.dueTo!);
        if (filter.parentId === "none") rows = rows.filter((t) => t.parentTaskId === null);
        else if (filter.parentId) rows = rows.filter((t) => t.parentTaskId === filter.parentId);
        if (!filter.includeArchived) rows = rows.filter((t) => !t.archived);
        if (filter.q) {
          const q = filter.q.toLowerCase();
          rows = rows.filter((t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
        }
        rows = sortTasks(rows).map(enrichTask);
        return filter.limit ? rows.slice(0, filter.limit) : rows;
      },
      get: async (id) => {
        const item = db.tasks.find((t) => t.id === id);
        return item ? enrichTask(item) : null;
      },
      counts: async (): Promise<TaskCounts> => {
        const t = todayISO();
        const active = db.tasks.filter((x) => x.status !== "completed" && x.status !== "cancelled" && !x.archived);
        return {
          today: active.filter((x) => x.scheduledDate === t || x.dueDate === t).length,
          overdue: active.filter((x) => x.dueDate != null && x.dueDate < t).length,
          inbox: db.tasks.filter((x) => x.status === "inbox" && !x.archived).length,
          waiting: db.tasks.filter((x) => x.status === "waiting" && !x.archived).length,
        };
      },
      create: async (input: TaskInput) => {
        const item: Task = {
          id: uid(),
          title: input.title,
          description: input.description ?? "",
          status: input.status ?? "todo",
          lifeAreaId: input.lifeAreaId ?? null,
          projectId: input.projectId ?? null,
          scheduledDate: input.scheduledDate ?? null,
          dueDate: input.dueDate ?? null,
          deadlineType: input.deadlineType ?? "none",
          priority: input.priority ?? "p3",
          estimatedMinutes: input.estimatedMinutes ?? null,
          actualMinutes: input.actualMinutes ?? null,
          recurrenceRule: input.recurrenceRule ?? null,
          parentTaskId: input.parentTaskId ?? null,
          createdAt: now(),
          updatedAt: now(),
          completedAt: null,
          archived: false,
          areaName: null,
          projectName: null,
          goalIds: input.goalIds ?? [],
        };
        db.tasks.push(item);
        save();
        return enrichTask(item);
      },
      update: async (id, patch: TaskPatch) => {
        const item = db.tasks.find((t) => t.id === id);
        if (!item) throw new Error("task not found");
        const { goalIds, status, ...rest } = patch;
        Object.assign(item, rest, { updatedAt: now() });
        if (status !== undefined) {
          item.status = status;
          item.completedAt = status === "completed" ? now() : null;
        }
        if (goalIds) item.goalIds = goalIds;
        save();
      },
      remove: async (id) => {
        db.tasks = db.tasks.filter((t) => t.id !== id && t.parentTaskId !== id);
        save();
      },
      setComplete: async (id, completed) => {
        const item = db.tasks.find((t) => t.id === id);
        if (!item) throw new Error("task not found");
        item.status = completed ? "completed" : "todo";
        item.completedAt = completed ? now() : null;
        item.updatedAt = now();
        save();
      },
    },
    habit: {
      list: async () =>
        db.habits.map((h) => ({ ...h, areaName: areaById(h.lifeAreaId)?.name ?? null })),
      create: async (input: Partial<Habit> & { name: string }) => {
        const item: Habit = {
          id: uid(),
          name: input.name,
          lifeAreaId: input.lifeAreaId ?? null,
          frequencyType: input.frequencyType ?? "daily",
          frequencyRule: input.frequencyRule ?? "",
          startDate: input.startDate ?? todayISO(),
          status: input.status ?? "active",
          createdAt: now(),
          areaName: areaById(input.lifeAreaId)?.name ?? null,
        };
        db.habits.push(item);
        save();
        return item;
      },
      update: async (id, patch: HabitPatch) => {
        const item = db.habits.find((h) => h.id === id);
        if (!item) throw new Error("habit not found");
        Object.assign(item, patch);
        save();
      },
      remove: async (id) => {
        db.habits = db.habits.filter((h) => h.id !== id);
        db.habitEntries = db.habitEntries.filter((e) => e.habitId !== id);
        save();
      },
      entries: async (from, to) =>
        db.habitEntries.filter((e) => e.date >= from && e.date <= to),
      toggle: async (habitId, date, completed, value = null) => {
        const existing = db.habitEntries.find((e) => e.habitId === habitId && e.date === date);
        if (existing) {
          existing.completed = completed;
          existing.value = value;
        } else {
          db.habitEntries.push({ habitId, date, completed, value });
        }
        save();
      },
    },
    review: {
      list: async (type?: ReviewType) =>
        db.reviews
          .filter((r) => !type || r.reviewType === type)
          .sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1)),
      get: async (type, periodStart) =>
        db.reviews.find((r) => r.reviewType === type && r.periodStart === periodStart) ?? null,
      save: async (type, periodStart, periodEnd, content: ReviewContent) => {
        const existing = db.reviews.find((r) => r.reviewType === type && r.periodStart === periodStart);
        if (existing) {
          existing.periodEnd = periodEnd;
          existing.content = content;
          existing.updatedAt = now();
        } else {
          db.reviews.push({
            id: uid(),
            reviewType: type,
            periodStart,
            periodEnd,
            content,
            createdAt: now(),
            updatedAt: now(),
          });
        }
        save();
      },
      stats: async (from, to): Promise<ReviewStats> => {
        const t = todayISO();
        const completed = db.tasks.filter(
          (x) => x.status === "completed" && x.completedAt && x.completedAt.slice(0, 10) >= from && x.completedAt.slice(0, 10) <= to,
        );
        const active = db.tasks.filter((x) => x.status !== "completed" && x.status !== "cancelled" && !x.archived);
        const touchedProjectIds = new Set(
          db.tasks
            .filter((x) => x.updatedAt.slice(0, 10) >= from && x.updatedAt.slice(0, 10) <= to && x.projectId)
            .map((x) => x.projectId as string),
        );
        const entries = db.habitEntries.filter((e) => e.date >= from && e.date <= to);
        return {
          completed: completed.map((x) => ({ id: x.id, title: x.title })),
          completedCount: completed.length,
          overdue: active
            .filter((x) => x.dueDate != null && x.dueDate < t)
            .map((x) => ({ id: x.id, title: x.title, dueDate: x.dueDate })),
          movedCount: db.tasks.filter((x) => x.updatedAt.slice(0, 10) >= from && x.updatedAt.slice(0, 10) <= to).length,
          workedProjects: db.projects.filter((p) => touchedProjectIds.has(p.id)).map((p) => ({ id: p.id, title: p.title })),
          neglectedProjects: db.projects
            .filter((p) => p.status === "active" && !p.archived && !touchedProjectIds.has(p.id))
            .map((p) => ({ id: p.id, title: p.title })),
          upcomingHard: active
            .filter((x) => x.deadlineType === "hard" && x.dueDate != null && x.dueDate >= t)
            .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
            .slice(0, 10)
            .map((x) => ({ id: x.id, title: x.title, dueDate: x.dueDate })),
          activeGoals: db.goals.filter((g) => g.status === "active" && !g.archived).length,
          habits: {
            completed: entries.filter((e) => e.completed).length,
            total: entries.length,
          },
        };
      },
    },
    note: {
      get: async (entityType: EntityType, entityId) =>
        db.notes.find((n) => n.entityType === entityType && n.entityId === entityId) ?? null,
      save: async (entityType, entityId, content) => {
        const existing = db.notes.find((n) => n.entityType === entityType && n.entityId === entityId);
        if (existing) {
          existing.content = content;
          existing.updatedAt = now();
        } else {
          db.notes.push({ id: uid(), entityType, entityId, content, updatedAt: now() });
        }
        save();
      },
    },
    search: {
      all: async (q): Promise<SearchResults> => {
        const needle = q.trim().toLowerCase();
        if (!needle) return { tasks: [], projects: [], goals: [], areas: [], notes: [] };
        const hit = (x: { id: string; title: string; status?: string }) => ({ id: x.id, title: x.title, status: x.status });
        return {
          tasks: db.tasks
            .filter((t) => !t.archived && (t.title.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle)))
            .slice(0, 20)
            .map((t) => hit({ id: t.id, title: t.title, status: t.status })),
          projects: db.projects
            .filter((p) => !p.archived && (p.title.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle)))
            .slice(0, 20)
            .map((p) => hit({ id: p.id, title: p.title, status: p.status })),
          goals: db.goals
            .filter((g) => !g.archived && (g.title.toLowerCase().includes(needle) || g.description.toLowerCase().includes(needle)))
            .slice(0, 20)
            .map((g) => hit({ id: g.id, title: g.title, status: g.status })),
          areas: db.areas
            .filter((a) => a.name.toLowerCase().includes(needle) || a.description.toLowerCase().includes(needle))
            .slice(0, 20)
            .map((a) => ({ id: a.id, title: a.name })),
          notes: db.notes
            .filter((n) => n.content.toLowerCase().includes(needle))
            .slice(0, 20)
            .map((n) => ({ entityType: n.entityType, entityId: n.entityId, title: n.content.slice(0, 120) })),
        };
      },
    },
    app: {
      dataDir: async () => "Browser preview (data in localStorage)",
    },
  };
}
