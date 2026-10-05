import { afterEach, describe, expect, it, vi } from "vitest";
import { DraftRegistry, PersistenceCoordinator } from "./persistence";
import { TextDraft } from "./textDraft";

afterEach(() => vi.useRealTimers());

describe("persistence", () => {
  it("keeps conflicting controls busy until the confirmed snapshot arrives", async () => {
    vi.useFakeTimers();
    let resolveRead!: (value: number) => void;
    const busy = vi.fn();
    const coordinator = new PersistenceCoordinator(
      () =>
        new Promise<number>((resolve) => {
          resolveRead = resolve;
        }),
      vi.fn(),
      vi.fn(),
      busy,
    );
    const write = coordinator.mutate(async () => "saved");
    await vi.advanceTimersByTimeAsync(50);
    expect(busy).toHaveBeenLastCalledWith(1);
    resolveRead(1);
    expect(await write).toBe("saved");
    expect(busy).toHaveBeenLastCalledWith(0);
    coordinator.dispose();
  });
  it("returns the persisted creation ID even if refreshing afterward fails", async () => {
    vi.useFakeTimers();
    const report = vi.fn();
    const coordinator = new PersistenceCoordinator(
      vi.fn().mockRejectedValue(new Error("reload failed")),
      vi.fn(),
      report,
      vi.fn(),
    );
    const creation = coordinator.mutate(async () => "saved-id");
    await vi.advanceTimersByTimeAsync(50);
    expect(await creation).toBe("saved-id");
    expect(report).toHaveBeenCalled();
    coordinator.dispose();
  });
  it("coalesces refreshes into one snapshot", async () => {
    vi.useFakeTimers();
    const read = vi.fn(async () => 1),
      publish = vi.fn();
    const coordinator = new PersistenceCoordinator(
      read,
      publish,
      vi.fn(),
      vi.fn(),
    );
    const promises = [
      coordinator.refresh(),
      coordinator.refresh(),
      coordinator.refresh(),
    ];
    await vi.advanceTimersByTimeAsync(50);
    await Promise.all(promises);
    expect(read).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(1);
    coordinator.dispose();
  });

  it("discards old responses and defers publication until queued writes finish", async () => {
    vi.useFakeTimers();
    let resolveOld!: (value: number) => void;
    const read = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValue(2);
    const publish = vi.fn(),
      coordinator = new PersistenceCoordinator<number>(
        read,
        publish,
        vi.fn(),
        vi.fn(),
      );
    const first = coordinator.refresh();
    await vi.advanceTimersByTimeAsync(50);
    const order: number[] = [];
    const a = coordinator.mutate(async () => {
      order.push(1);
      return "persisted-id";
    });
    const b = coordinator.mutate(async () => {
      order.push(2);
    });
    resolveOld(1);
    await vi.advanceTimersByTimeAsync(50);
    await Promise.all([first, a, b]);
    expect(order).toEqual([1, 2]);
    expect(publish.mock.calls).toEqual([[2]]);
    coordinator.dispose();
  });

  it("reports rejected writes and permits retrying failed loading", async () => {
    vi.useFakeTimers();
    const report = vi.fn(),
      publish = vi.fn();
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(3);
    const coordinator = new PersistenceCoordinator<number>(
      read,
      publish,
      report,
      vi.fn(),
    );
    const failed = coordinator.refresh().catch((error) => error.message);
    await vi.advanceTimersByTimeAsync(50);
    expect(await failed).toBe("offline");
    await expect(
      coordinator.mutate(async () => {
        throw new Error("write failed");
      }),
    ).rejects.toThrow("write failed");
    expect(publish).not.toHaveBeenCalled();
    const retry = coordinator.refresh();
    await vi.advanceTimersByTimeAsync(50);
    await retry;
    expect(publish).toHaveBeenCalledWith(3);
    coordinator.dispose();
  });
});

describe("draft saving", () => {
  it("debounces edits and flushes the last text immediately", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => true),
      draft = new TextDraft("old", save, vi.fn());
    draft.change("a");
    draft.change("last");
    await vi.advanceTimersByTimeAsync(399);
    expect(save).not.toHaveBeenCalled();
    await draft.flush();
    expect(save).toHaveBeenCalledExactlyOnceWith("last");
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("retains failed text and blocks navigation until retry succeeds", async () => {
    const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const draft = new TextDraft("old", save, vi.fn()),
      registry = new DraftRegistry();
    registry.register("task:title", () => draft.flush());
    draft.change("new");
    expect(await registry.flush()).toBe(false);
    draft.sync("old");
    expect(draft.value).toBe("new");
    expect(draft.failed).toBe(true);
    expect(await registry.flush()).toBe(true);
    expect(draft.dirty).toBe(false);
  });

  it("saves changes made while another save is in flight", async () => {
    let finish!: (value: boolean) => void;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(true);
    const draft = new TextDraft("old", save, vi.fn());
    draft.change("first");
    const flushing = draft.flush();
    draft.change("last");
    finish(true);
    expect(await flushing).toBe(true);
    expect(save.mock.calls).toEqual([["first"], ["last"]]);
    draft.dispose();
  });
});
