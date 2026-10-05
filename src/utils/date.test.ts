import { afterEach, expect, it } from "vitest";
import { fromLocalDateTime, isValidISODate, toLocalDateTime } from "./date";
import { daysFor, pageDays } from "./planner";

const originalTimezone = process.env.TZ;
afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

it("validates real calendar dates", () => {
  expect(isValidISODate("2024-02-29")).toBe(true);
  expect(isValidISODate("2026-02-30")).toBe(false);
  expect(isValidISODate("2026-2-01")).toBe(false);
  expect(fromLocalDateTime("2026-02-30T12:00")).toBe(null);
});

it("round-trips local time in Madrid, UTC and a negative-offset timezone", () => {
  for (const timezone of ["Europe/Madrid", "UTC", "America/New_York"]) {
    process.env.TZ = timezone;
    for (const input of [
      "1990-07-10T12:00",
      "2026-01-01T00:05",
      "2026-10-25T12:00",
    ]) {
      const saved = fromLocalDateTime(input);
      expect(saved).not.toBeNull();
      expect(toLocalDateTime(saved)).toBe(input);
    }
  }
});

it("pages long ranges into at most 60 dates without losing any dates", () => {
  const days = daysFor("twoYears", "2026-10-05"),
    pages = [];
  for (let page = 0; page < Math.ceil(days.length / 60); page++) {
    const dates = pageDays(days, page);
    expect(dates.length).toBeLessThanOrEqual(60);
    pages.push(...dates);
  }
  expect(pages).toEqual(days);
  expect(daysFor("week", "2026-10-05")).toHaveLength(7);
  expect(daysFor("month", "2026-10-05")).toHaveLength(31);
});
