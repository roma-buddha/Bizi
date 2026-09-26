export type ID = string;

export type Priority = "p1" | "p2" | "p3" | "p4";
export type DeadlineType = "hard" | "soft" | "none";
export type TaskStatus = "inbox" | "todo" | "in_progress" | "waiting" | "completed" | "cancelled";
export type GoalStatus = "planned" | "active" | "on_hold" | "completed" | "abandoned";
export type ProjectStatus =
  | "idea"
  | "planned"
  | "active"
  | "waiting"
  | "on_hold"
  | "completed"
  | "cancelled";
export type ProgressMode = "auto" | "manual";
export type ReviewType = "weekly" | "monthly" | "annual";
export type EntityType = "area" | "goal" | "project" | "task" | "review";
export type ThemeSetting = "light" | "dark" | "system";
export type HabitStatus = "active" | "paused";
export type FrequencyType = "daily" | "weekdays" | "weekly" | "custom";

export const PRIORITIES: Priority[] = ["p1", "p2", "p3", "p4"];
export const PRIORITY_LABELS: Record<Priority, string> = {
  p1: "P1",
  p2: "P2",
  p3: "P3",
  p4: "P4",
};
export const PRIORITY_NAMES: Record<Priority, string> = {
  p1: "Urgent",
  p2: "High",
  p3: "Normal",
  p4: "Low",
};

export const TASK_STATUSES: TaskStatus[] = [
  "inbox",
  "todo",
  "in_progress",
  "waiting",
  "completed",
  "cancelled",
];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "Inbox",
  todo: "To Do",
  in_progress: "In Progress",
  waiting: "Waiting",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const GOAL_STATUSES: GoalStatus[] = ["planned", "active", "on_hold", "completed", "abandoned"];
export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  planned: "Planned",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  abandoned: "Abandoned",
};

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

export const DEADLINE_TYPES: DeadlineType[] = ["none", "soft", "hard"];
export const DEADLINE_LABELS: Record<DeadlineType, string> = {
  hard: "Hard deadline",
  soft: "Soft target",
  none: "No deadline",
};

export const REVIEW_TYPES: ReviewType[] = ["weekly", "monthly", "annual"];

export const AREA_COLORS = [
  "amber",
  "blue",
  "green",
  "violet",
  "rose",
  "slate",
  "teal",
  "orange",
] as const;
export type AreaColor = (typeof AREA_COLORS)[number];

export const AREA_ICONS = [
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
export type AreaIcon = (typeof AREA_ICONS)[number];

export interface LifeArea {
  id: ID;
  name: string;
  description: string;
  icon: string;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface Goal {
  id: ID;
  title: string;
  description: string;
  lifeAreaId: ID | null;
  status: GoalStatus;
  priority: Priority;
  startDate: string | null;
  targetDate: string | null;
  progressMode: ProgressMode;
  manualProgress: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archived: boolean;
  areaName: string | null;
  projectIds: ID[];
}

export interface Project {
  id: ID;
  title: string;
  description: string;
  lifeAreaId: ID | null;
  status: ProjectStatus;
  priority: Priority;
  startDate: string | null;
  targetDate: string | null;
  progressMode: ProgressMode;
  manualProgress: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archived: boolean;
  areaName: string | null;
  goalIds: ID[];
  openTasks: number;
  totalTasks: number;
}

export interface Task {
  id: ID;
  title: string;
  description: string;
  status: TaskStatus;
  lifeAreaId: ID | null;
  projectId: ID | null;
  scheduledDate: string | null;
  dueDate: string | null;
  deadlineType: DeadlineType;
  priority: Priority;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  recurrenceRule: string | null;
  parentTaskId: ID | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archived: boolean;
  areaName: string | null;
  projectName: string | null;
  goalIds: ID[];
}

export interface Habit {
  id: ID;
  name: string;
  lifeAreaId: ID | null;
  frequencyType: FrequencyType;
  frequencyRule: string;
  startDate: string | null;
  status: HabitStatus;
  createdAt: string;
  areaName: string | null;
}

export interface HabitEntry {
  habitId: ID;
  date: string;
  completed: boolean;
  value: number | null;
}

export interface ReviewContent {
  wentWell: string;
  notWell: string;
  focusNext: string;
  stopDoing: string;
  topPriorities: string;
}

export const EMPTY_REVIEW: ReviewContent = {
  wentWell: "",
  notWell: "",
  focusNext: "",
  stopDoing: "",
  topPriorities: "",
};

export interface Review {
  id: ID;
  reviewType: ReviewType;
  periodStart: string;
  periodEnd: string;
  content: ReviewContent;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: ID;
  entityType: EntityType;
  entityId: ID;
  content: string;
  updatedAt: string;
}

export interface SearchHit {
  id: ID;
  title: string;
  status?: string;
}

export interface NoteSearchHit {
  entityType: EntityType;
  entityId: ID;
  title: string;
}

export interface SearchResults {
  tasks: SearchHit[];
  projects: SearchHit[];
  goals: SearchHit[];
  areas: SearchHit[];
  notes: NoteSearchHit[];
}

export interface ReviewStats {
  completed: SearchHit[];
  completedCount: number;
  overdue: { id: ID; title: string; dueDate: string | null }[];
  movedCount: number;
  workedProjects: SearchHit[];
  neglectedProjects: SearchHit[];
  upcomingHard: { id: ID; title: string; dueDate: string | null }[];
  activeGoals: number;
  habits: { completed: number; total: number };
}

export interface TaskCounts {
  today: number;
  overdue: number;
  inbox: number;
  waiting: number;
}

export interface TaskFilter {
  statuses?: TaskStatus[];
  excludeStatuses?: TaskStatus[];
  areaId?: ID;
  projectId?: ID;
  goalId?: ID;
  priority?: Priority;
  deadlineType?: DeadlineType;
  scheduledFrom?: string;
  scheduledTo?: string;
  dueFrom?: string;
  dueTo?: string;
  parentId?: ID | "none";
  includeArchived?: boolean;
  q?: string;
  limit?: number;
}

export interface ProjectFilter {
  includeArchived?: boolean;
  areaId?: ID;
  statuses?: ProjectStatus[];
  goalId?: ID;
  q?: string;
}

export type AreaInput = Partial<Omit<LifeArea, "id" | "createdAt" | "updatedAt">> & { name: string };
export type GoalInput = Partial<Omit<Goal, "id" | "createdAt" | "updatedAt" | "areaName">> & {
  title: string;
};
export type ProjectInput = Partial<Omit<Project, "id" | "createdAt" | "updatedAt" | "areaName" | "openTasks" | "totalTasks">> & {
  title: string;
};
export type TaskInput = Partial<Omit<Task, "id" | "createdAt" | "updatedAt" | "areaName" | "projectName">> & {
  title: string;
};

export type AreaPatch = Partial<Omit<LifeArea, "id" | "createdAt" | "updatedAt">>;
export type GoalPatch = Partial<Omit<Goal, "id" | "createdAt" | "updatedAt" | "areaName">>;
export type ProjectPatch = Partial<Omit<Project, "id" | "createdAt" | "updatedAt" | "areaName" | "openTasks" | "totalTasks">>;
export type TaskPatch = Partial<Omit<Task, "id" | "createdAt" | "updatedAt" | "areaName" | "projectName">>;
export type HabitPatch = Partial<Omit<Habit, "id" | "createdAt" | "areaName">>;
