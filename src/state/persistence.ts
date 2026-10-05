/** Serializes writes and only publishes snapshots newer than every queued write. */
export class PersistenceCoordinator<T> {
  private tail: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private pending = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private waiters: { resolve: () => void; reject: (error: unknown) => void }[] =
    [];

  constructor(
    private read: () => Promise<T>,
    private publish: (value: T) => void,
    private report: (error: unknown) => void,
    private busy: (pending: number) => void,
  ) {}

  refresh(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    this.generation++;
    const result = new Promise<void>((resolve, reject) =>
      this.waiters.push({ resolve, reject }),
    );
    this.schedule();
    return result;
  }

  private schedule() {
    if (this.stopped || this.pending) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.load();
    }, 50);
  }

  private async load() {
    const generation = this.generation;
    try {
      const value = await this.read();
      if (this.stopped || this.pending || generation !== this.generation)
        return;
      this.publish(value);
      this.busy(0);
      this.waiters.splice(0).forEach((w) => w.resolve());
    } catch (error) {
      if (this.stopped || this.pending || generation !== this.generation)
        return;
      this.report(error);
      this.busy(0);
      this.waiters.splice(0).forEach((w) => w.reject(error));
    }
  }

  async mutate<R>(write: () => Promise<R>): Promise<R> {
    if (this.stopped) throw new Error("Editor is closed");
    this.pending++;
    this.generation++;
    clearTimeout(this.timer);
    this.busy(this.pending);
    const operation = this.tail.then(write);
    this.tail = operation.catch(() => undefined);
    let result: R;
    try {
      result = await operation;
    } catch (error) {
      this.report(error);
      throw error;
    } finally {
      this.pending--;
      // Keep controls locked until the confirmed snapshot is published.
      this.busy(this.pending || 1);
      this.schedule();
    }
    // The write is confirmed even if the following read fails. Reporting the
    // read error must not make creation look failed and invite duplicate rows.
    await this.refresh().catch(() => undefined);
    return result;
  }

  dispose() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.waiters.splice(0).forEach((w) => w.resolve());
  }
}

export class DraftRegistry {
  private entries = new Map<string, () => Promise<boolean>>();
  register(key: string, flush: () => Promise<boolean>) {
    this.entries.set(key, flush);
    return () => {
      if (this.entries.get(key) === flush) this.entries.delete(key);
    };
  }
  async flush(): Promise<boolean> {
    const results = await Promise.all(
      [...this.entries.values()].map((flush) => flush()),
    );
    return results.every(Boolean);
  }
}
