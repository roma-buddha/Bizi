import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  endOfWeekISO,
  formatDate,
  isPastDate,
  monthGridWeeks,
  parseISO,
  relativeDayLabel,
  startOfWeekISO,
  toISODate,
  todayISO,
  weekdayShort,
} from "./date";

describe("date utilities", () => {
  it("formats local ISO dates", () => {
    expect(toISODate(new Date(2026, 8, 26))).toBe("2026-09-26");
    expect(parseISO("2026-09-26").getDate()).toBe(26);
  });

  it("adds days across month boundaries", () => {
    expect(addDaysISO("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysISO("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("computes Monday-start weeks", () => {
    // 2026-09-26 is a Saturday
    expect(startOfWeekISO("2026-09-26")).toBe("2026-09-21");
    expect(endOfWeekISO("2026-09-26")).toBe("2026-09-27");
    expect(weekdayShort("2026-09-21")).toBe("Mon");
    expect(weekdayShort("2026-09-27")).toBe("Sun");
  });

  it("labels relative days", () => {
    const today = todayISO();
    expect(relativeDayLabel(today)).toBe("Today");
    expect(relativeDayLabel(addDaysISO(today, 1))).toBe("Tomorrow");
    expect(relativeDayLabel(addDaysISO(today, -1))).toBe("Yesterday");
  });

  it("detects past dates", () => {
    expect(isPastDate(addDaysISO(todayISO(), -1))).toBe(true);
    expect(isPastDate(addDaysISO(todayISO(), 1))).toBe(false);
  });

  it("builds month grids starting Monday and covering the month", () => {
    const weeks = monthGridWeeks(2026, 8); // September 2026
    expect(weeks[0][0]).toBe("2026-08-31"); // Monday before Sep 1 (Tue)
    const all = weeks.flat();
    expect(all).toContain("2026-09-01");
    expect(all).toContain("2026-09-30");
    expect(all[all.length - 1] >= "2026-09-30").toBe(true);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("formats dates without year for the current year", () => {
    const d = new Date();
    expect(formatDate(toISODate(d))).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});
