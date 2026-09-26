import type { Project, Task } from "../models/types";

export function clampProgress(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function projectProgress(project: Project, tasks: Task[]): number {
  if (project.progressMode === "manual") return clampProgress(project.manualProgress);
  const relevant = tasks.filter((t) => t.projectId === project.id);
  if (relevant.length === 0) return 0;
  const done = relevant.filter((t) => t.status === "completed").length;
  return clampProgress((done / relevant.length) * 100);
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return "";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
