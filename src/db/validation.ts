import { isValidISODate } from "../utils/date";

export function validateInput(
  kind: string,
  input: unknown,
  creating: boolean,
  exists: (kind: string, id: string) => boolean,
) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Expected an input object");
  const values = input as Record<string, unknown>;
  const title = kind === "area" || kind === "habit" ? "name" : "title";
  if (creating && !(title in values)) throw new Error(`Missing ${title}`);
  const statuses: Record<string, string[]> = {
    task: ["inbox", "todo", "in_progress", "waiting", "completed", "cancelled"],
    project: [
      "idea",
      "planned",
      "active",
      "waiting",
      "on_hold",
      "completed",
      "cancelled",
    ],
    goal: ["planned", "active", "on_hold", "completed", "abandoned"],
    habit: ["active", "paused"],
  };
  const enums: Record<string, string[]> = {
    status: statuses[kind] ?? [],
    priority: ["p1", "p2", "p3", "p4"],
    deadlineType: ["none", "soft", "hard"],
    progressMode: ["auto", "manual"],
    frequencyType: ["daily", "weekdays", "weekly", "custom"],
  };
  const fields: Record<string, string[]> = {
    area: ["name", "description", "icon", "color", "sortOrder", "archived"],
    goal: [
      "title",
      "description",
      "lifeAreaId",
      "status",
      "priority",
      "startDate",
      "targetDate",
      "progressMode",
      "manualProgress",
      "projectIds",
      "archived",
    ],
    project: [
      "title",
      "description",
      "lifeAreaId",
      "status",
      "priority",
      "icon",
      "color",
      "startDate",
      "targetDate",
      "progressMode",
      "manualProgress",
      "goalIds",
      "archived",
    ],
    task: [
      "title",
      "description",
      "status",
      "lifeAreaId",
      "projectId",
      "scheduledDate",
      "dueDate",
      "deadlineType",
      "priority",
      "estimatedMinutes",
      "actualMinutes",
      "recurrenceRule",
      "parentTaskId",
      "goalIds",
      "archived",
    ],
    habit: [
      "name",
      "lifeAreaId",
      "frequencyType",
      "frequencyRule",
      "startDate",
      "status",
    ],
  };
  for (const [key, value] of Object.entries(values)) {
    if (!(fields[kind] ?? []).includes(key))
      throw new Error(`Unsupported field: ${key}`);
    if (value === undefined) continue;
    if (key === "title" || key === "name") {
      if (typeof value !== "string" || !value.trim())
        throw new Error(`${key} must be nonempty text`);
      values[key] = value.trim();
    } else if (
      ["description", "icon", "color", "frequencyRule"].includes(key)
    ) {
      if (typeof value !== "string") throw new Error(`${key} must be text`);
    } else if (key === "recurrenceRule") {
      if (value !== null && typeof value !== "string")
        throw new Error(`${key} must be text or null`);
    } else if (key in enums) {
      if (typeof value !== "string" || !enums[key].includes(value))
        throw new Error(`Unsupported ${key}`);
    } else if (
      ["scheduledDate", "dueDate", "startDate", "targetDate"].includes(key)
    ) {
      if (value !== null && !isValidISODate(value))
        throw new Error(`${key} must be a real YYYY-MM-DD date`);
    } else if (["lifeAreaId", "projectId", "parentTaskId"].includes(key)) {
      const entity =
        key === "lifeAreaId"
          ? "area"
          : key === "projectId"
            ? "project"
            : "task";
      if (
        value !== null &&
        (typeof value !== "string" || !exists(entity, value))
      )
        throw new Error(`Invalid ${key}`);
    } else if (key === "goalIds" || key === "projectIds") {
      if (
        !Array.isArray(value) ||
        value.some(
          (id) =>
            typeof id !== "string" ||
            !exists(key === "goalIds" ? "goal" : "project", id),
        )
      )
        throw new Error(`Invalid ${key}`);
    } else if (
      [
        "estimatedMinutes",
        "actualMinutes",
        "manualProgress",
        "sortOrder",
      ].includes(key)
    ) {
      if (
        value === null &&
        (key === "estimatedMinutes" || key === "actualMinutes")
      )
        continue;
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 0 ||
        (key === "manualProgress" && value > 100)
      )
        throw new Error(`Invalid ${key}`);
      if (key === "sortOrder" && kind !== "area")
        throw new Error("Use task movement to change order");
    } else if (key === "archived") {
      if (typeof value !== "boolean")
        throw new Error("archived must be boolean");
    } else throw new Error(`Unsupported field: ${key}`);
  }
}
