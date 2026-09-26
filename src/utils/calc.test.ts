import { describe, expect, it } from "vitest";
import type { Project, Task } from "../models/types";
import { clampProgress, formatMinutes, projectProgress } from "./calc";

function task(partial: Partial<Task>): Task {
  return {
    id: "t",
    title: "Task",
    description: "",
    status: "todo",
    lifeAreaId: null,
    projectId: null,
    scheduledDate: null,
    dueDate: null,
    deadlineType: "none",
    priority: "p3",
    estimatedMinutes: null,
    actualMinutes: null,
    recurrenceRule: null,
    parentTaskId: null,
    createdAt: "",
    updatedAt: "",
    completedAt: null,
    archived: false,
    areaName: null,
    projectName: null,
    goalIds: [],
    ...partial,
  };
}

function project(partial: Partial<Project>): Project {
  return {
    id: "p",
    title: "Project",
    description: "",
    lifeAreaId: null,
    status: "active",
    priority: "p3",
    startDate: null,
    targetDate: null,
    progressMode: "auto",
    manualProgress: 0,
    createdAt: "",
    updatedAt: "",
    completedAt: null,
    archived: false,
    areaName: null,
    goalIds: [],
    openTasks: 0,
    totalTasks: 0,
    ...partial,
  };
}

describe("calc utilities", () => {
  it("clamps progress to 0-100", () => {
    expect(clampProgress(-5)).toBe(0);
    expect(clampProgress(140)).toBe(100);
    expect(clampProgress(42.6)).toBe(43);
    expect(clampProgress(NaN)).toBe(0);
  });

  it("computes automatic project progress from tasks", () => {
    const p = project({ id: "p1", progressMode: "auto" });
    const tasks = [
      task({ projectId: "p1", status: "completed" }),
      task({ projectId: "p1", status: "todo" }),
      task({ projectId: "p1", status: "in_progress" }),
      task({ projectId: "other", status: "completed" }),
    ];
    expect(projectProgress(p, tasks)).toBe(33);
  });

  it("uses manual progress when set", () => {
    const p = project({ id: "p1", progressMode: "manual", manualProgress: 60 });
    expect(projectProgress(p, [])).toBe(60);
  });

  it("ignores cancelled tasks in automatic progress", () => {
    const p = project({ id: "p1", progressMode: "auto" });
    const tasks = [
      task({ projectId: "p1", status: "completed" }),
      task({ projectId: "p1", status: "cancelled" }),
    ];
    expect(projectProgress(p, tasks)).toBe(50);
  });

  it("formats minutes", () => {
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(90)).toBe("1h 30m");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatMinutes(null)).toBe("");
  });
});
