import { addDaysISO } from "./date";

export type ViewMode = "day" | "week" | "month" | "year" | "twoYears";
export function daysFor(mode: ViewMode, today: string): string[] {
  const [y, m] = today.split("-");
  let start = today,
    end = today;
  if (mode === "week") {
    start = addDaysISO(
      today,
      -((new Date(today + "T00:00:00").getDay() + 6) % 7),
    );
    end = addDaysISO(start, 6);
  } else if (mode === "month") {
    start = `${y}-${m}-01`;
    end = `${y}-${m}-${new Date(Number(y), Number(m), 0).getDate()}`;
  } else if (mode === "year") end = `${y}-12-31`;
  else if (mode === "twoYears") end = addDaysISO(today, 730);
  const result: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDaysISO(cursor, 1))
    result.push(cursor);
  return result;
}

export function pageDays(days: string[], page: number): string[] {
  return days.slice(
    Math.max(0, Math.min(page, Math.ceil(days.length / 60) - 1)) * 60,
    (Math.max(0, Math.min(page, Math.ceil(days.length / 60) - 1)) + 1) * 60,
  );
}
