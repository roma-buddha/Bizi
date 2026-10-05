import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserApi } from "./browser";

let values: Map<string, string>;
let storage: {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  values = new Map();
  storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
  vi.stubGlobal("localStorage", storage);
});

describe("browser persistence", () => {
  it("creates completed records and goal-to-project links atomically", async () => {
    const api = createBrowserApi();
    const project = await api.project.create({
      title: "project",
      status: "completed",
      archived: true,
    });
    const goal = await api.goal.create({
      title: "goal",
      projectIds: [project.id],
    });
    expect(
      (await api.project.list({ includeArchived: true })).find(
        (p) => p.id === project.id,
      )?.goalIds,
    ).toEqual([goal.id]);
    expect(project.completedAt).toBeTruthy();
    expect(project.archived).toBe(true);
    const task = await api.task.create({ title: "done", status: "completed" });
    expect(task.completedAt).toBeTruthy();
  });
  it("reports corrupt stored data without replacing it with sample data", async () => {
    values.set("bizi.db.v1", "{broken");
    const api = createBrowserApi();
    await expect(api.snapshot()).rejects.toThrow("preserved");
    expect(values.get("bizi.db.v1")).toBe("{broken");
  });
  it("links persisted IDs and keeps manual order after reopening", async () => {
    const api = createBrowserApi();
    const project = await api.project.create({ title: "project" });
    const a = await api.task.create({
      title: "a",
      projectId: project.id,
      scheduledDate: "2030-01-01",
      dueDate: "2030-01-03",
    });
    const b = await api.task.create({
      title: "b",
      scheduledDate: "2030-01-01",
    });
    await api.task.move(b.id, "2030-01-01", a.id);
    await api.task.update(b.id, { scheduledDate: "2030-01-01" });
    const reopened = createBrowserApi();
    expect(
      (await reopened.snapshot()).tasks
        .filter((t) => t.scheduledDate === "2030-01-01")
        .map((t) => t.id),
    ).toEqual([b.id, a.id]);
    await reopened.task.update(a.id, { scheduledDate: null });
    expect(await reopened.task.get(a.id)).toMatchObject({
      scheduledDate: null,
      dueDate: "2030-01-03",
      projectId: project.id,
    });
  });

  it("rejects invalid references and values without changing existing relationships", async () => {
    const api = createBrowserApi(),
      goal = await api.goal.create({ title: "goal" });
    const project = await api.project.create({
      title: "project",
      goalIds: [goal.id],
    });
    await expect(
      api.project.update(project.id, { goalIds: ["missing"] }),
    ).rejects.toThrow();
    expect(
      (await api.snapshot()).projects.find((p) => p.id === project.id)?.goalIds,
    ).toEqual([goal.id]);
    await expect(api.task.create({ title: " " })).rejects.toThrow();
    await expect(
      api.task.create({ title: "bad date", dueDate: "2026-02-30" }),
    ).rejects.toThrow();
    await expect(
      api.task.create({ title: "negative", estimatedMinutes: -1 }),
    ).rejects.toThrow();
    await expect(
      api.task.create({ title: "temp ID", projectId: "temporary-id" }),
    ).rejects.toThrow();
  });

  it("rolls back in-memory changes when storage rejects a write", async () => {
    const api = createBrowserApi(),
      task = await api.task.create({ title: "original" });
    storage.setItem.mockImplementationOnce(() => {
      throw new Error("Storage full");
    });
    await expect(
      api.task.update(task.id, { title: "changed" }),
    ).rejects.toThrow("Storage full");
    expect((await api.task.get(task.id))?.title).toBe("original");
    expect((await createBrowserApi().task.get(task.id))?.title).toBe(
      "original",
    );
  });

  it("returns more than 500 records in one snapshot and preserves archives", async () => {
    const api = createBrowserApi();
    const data = await api.snapshot();
    const template = data.tasks[0];
    values.set(
      "bizi.db.v1",
      JSON.stringify({
        ...data,
        goals: [],
        habits: [],
        habitEntries: [],
        reviews: [],
        tasks: Array.from({ length: 510 }, (_, index) => ({
          ...template,
          id: `task-${index}`,
          sortOrder: index,
          archived: index === 0,
        })),
      }),
    );
    const populated = createBrowserApi();
    expect((await populated.snapshot()).tasks).toHaveLength(510);
    await populated.task.update("task-0", { archived: false });
    expect((await createBrowserApi().task.get("task-0"))?.archived).toBe(false);
    expect(
      await populated.task.list({ includeArchived: true, excludeStatuses: [] }),
    ).toHaveLength(500);
  });
});
