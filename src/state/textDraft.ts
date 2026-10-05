/** Keeps a failed draft editable and drains edits made while a save is in flight. */
export class TextDraft {
  value: string;
  saved: string;
  failed = false;
  saving = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flight: Promise<boolean> | undefined;

  constructor(
    value: string,
    public save: (value: string) => Promise<boolean>,
    private notify: () => void,
  ) {
    this.value = value;
    this.saved = value;
  }
  get dirty() {
    return this.value !== this.saved;
  }
  sync(value: string) {
    if (!this.dirty && !this.saving) {
      this.value = value;
      this.saved = value;
      this.notify();
    }
  }
  change(value: string) {
    this.value = value;
    this.failed = false;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, 400);
    this.notify();
  }
  flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.flight) return this.flight;
    this.flight = this.drain().finally(() => {
      this.flight = undefined;
    });
    return this.flight;
  }
  private async drain() {
    while (this.dirty) {
      const value = this.value;
      this.saving = true;
      this.notify();
      let ok = false;
      try {
        ok = await this.save(value);
      } catch {
        /* Keep the draft for retry. */
      }
      this.saving = false;
      if (!ok) {
        this.failed = true;
        this.notify();
        return false;
      }
      this.saved = value;
      this.failed = false;
      this.notify();
    }
    return true;
  }
  dispose() {
    clearTimeout(this.timer);
  }
}
