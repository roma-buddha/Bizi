import { invoke } from "@tauri-apps/api/core";
import type {
  WorkspaceSnapshot,
  AreaInput,
  AreaPatch,
  EntityType,
  Goal,
  GoalInput,
  GoalPatch,
  Habit,
  HabitEntry,
  LifeArea,
  Note,
  Priority,
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
import type { HabitPatch } from "../models/types";
import { createBrowserApi } from "./browser";

export interface BiziApi {
  snapshot(): Promise<WorkspaceSnapshot>;
  bridge: {
    status(): Promise<BridgeStatus>;
    setEnabled(enabled: boolean): Promise<BridgeStatus>;
    setPort(port: number): Promise<BridgeStatus>;
    regenToken(): Promise<string>;
    getToken(): Promise<string>;
    log(): Promise<string[]>;
  };
  area: {
    list(includeArchived?: boolean): Promise<LifeArea[]>;
    create(input: AreaInput): Promise<LifeArea>;
    update(id: string, patch: AreaPatch): Promise<void>;
    remove(id: string): Promise<void>;
  };
  goal: {
    list(includeArchived?: boolean): Promise<Goal[]>;
    create(input: GoalInput): Promise<Goal>;
    update(id: string, patch: GoalPatch): Promise<void>;
    remove(id: string): Promise<void>;
  };
  project: {
    list(filter?: ProjectFilter): Promise<Project[]>;
    create(input: ProjectInput): Promise<Project>;
    update(id: string, patch: ProjectPatch): Promise<void>;
    remove(id: string): Promise<void>;
  };
  task: {
    move(
      id: string,
      scheduledDate: string | null,
      beforeId: string | null,
    ): Promise<void>;
    list(filter?: TaskFilter): Promise<Task[]>;
    get(id: string): Promise<Task | null>;
    counts(): Promise<TaskCounts>;
    create(input: TaskInput): Promise<Task>;
    update(id: string, patch: TaskPatch): Promise<void>;
    remove(id: string): Promise<void>;
    setComplete(id: string, completed: boolean): Promise<void>;
  };
  habit: {
    list(): Promise<Habit[]>;
    create(input: Partial<Habit> & { name: string }): Promise<Habit>;
    update(id: string, patch: HabitPatch): Promise<void>;
    remove(id: string): Promise<void>;
    entries(from: string, to: string): Promise<HabitEntry[]>;
    toggle(
      habitId: string,
      date: string,
      completed: boolean,
      value?: number | null,
    ): Promise<void>;
  };
  review: {
    list(type?: ReviewType): Promise<Review[]>;
    get(type: ReviewType, periodStart: string): Promise<Review | null>;
    save(
      type: ReviewType,
      periodStart: string,
      periodEnd: string,
      content: ReviewContent,
    ): Promise<void>;
    stats(from: string, to: string): Promise<ReviewStats>;
  };
  note: {
    get(entityType: EntityType, entityId: string): Promise<Note | null>;
    save(
      entityType: EntityType,
      entityId: string,
      content: string,
    ): Promise<void>;
  };
  search: {
    all(q: string): Promise<SearchResults>;
  };
  app: {
    dataDir(): Promise<string>;
  };
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface BridgeStatus {
  enabled: boolean;
  port: number;
  actualPort: number | null;
  running: boolean;
}

const tauriApi: BiziApi = {
  snapshot: () => invoke<WorkspaceSnapshot>("workspace_snapshot"),
  bridge: {
    status: () => invoke<BridgeStatus>("bridge_status"),
    setEnabled: (enabled) =>
      invoke<BridgeStatus>("bridge_set_enabled", { enabled }),
    setPort: (port) => invoke<BridgeStatus>("bridge_set_port", { port }),
    regenToken: () => invoke<string>("bridge_regen_token"),
    getToken: () => invoke<string>("bridge_get_token"),
    log: () => invoke<string[]>("bridge_log"),
  },
  area: {
    list: (includeArchived) =>
      invoke<LifeArea[]>("area_list", { includeArchived }),
    create: (input) => invoke<LifeArea>("area_create", { input }),
    update: (id, patch) => invoke<void>("area_update", { id, patch }),
    remove: (id) => invoke<void>("area_delete", { id }),
  },
  goal: {
    list: (includeArchived) => invoke<Goal[]>("goal_list", { includeArchived }),
    create: (input) => invoke<Goal>("goal_create", { input }),
    update: (id, patch) => invoke<void>("goal_update", { id, patch }),
    remove: (id) => invoke<void>("goal_delete", { id }),
  },
  project: {
    list: (filter) =>
      invoke<Project[]>("project_list", { filter: filter ?? {} }),
    create: (input) => invoke<Project>("project_create", { input }),
    update: (id, patch) => invoke<void>("project_update", { id, patch }),
    remove: (id) => invoke<void>("project_delete", { id }),
  },
  task: {
    move: (id, scheduledDate, beforeId) =>
      invoke<void>("task_move", { id, scheduledDate, beforeId }),
    list: (filter) => invoke<Task[]>("task_list", { filter: filter ?? {} }),
    get: (id) => invoke<Task | null>("task_get", { id }),
    counts: () => invoke<TaskCounts>("task_counts"),
    create: (input) => invoke<Task>("task_create", { input }),
    update: (id, patch) => invoke<void>("task_update", { id, patch }),
    remove: (id) => invoke<void>("task_delete", { id }),
    setComplete: (id, completed) =>
      invoke<void>("task_set_complete", { id, completed }),
  },
  habit: {
    list: () => invoke<Habit[]>("habit_list"),
    create: (input) => invoke<Habit>("habit_create", { input }),
    update: (id, patch) => invoke<void>("habit_update", { id, patch }),
    remove: (id) => invoke<void>("habit_delete", { id }),
    entries: (from, to) => invoke<HabitEntry[]>("habit_entries", { from, to }),
    toggle: (habitId, date, completed, value) =>
      invoke<void>("habit_toggle", { habitId, date, completed, value }),
  },
  review: {
    list: (type) => invoke<Review[]>("review_list", { reviewType: type }),
    get: (type, periodStart) =>
      invoke<Review | null>("review_get", { reviewType: type, periodStart }),
    save: (type, periodStart, periodEnd, content) =>
      invoke<void>("review_save", {
        reviewType: type,
        periodStart,
        periodEnd,
        content,
      }),
    stats: (from, to) => invoke<ReviewStats>("review_stats", { from, to }),
  },
  note: {
    get: (entityType, entityId) =>
      invoke<Note | null>("note_get", { entityType, entityId }),
    save: (entityType, entityId, content) =>
      invoke<void>("note_save", { entityType, entityId, content }),
  },
  search: {
    all: (q) => invoke<SearchResults>("search_all", { q }),
  },
  app: {
    dataDir: () => invoke<string>("app_data_dir"),
  },
};

export const api: BiziApi = isTauriRuntime() ? tauriApi : createBrowserApi();

export type { Priority };
