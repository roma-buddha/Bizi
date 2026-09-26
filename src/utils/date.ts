// Local-timezone date helpers. All ISO strings are "YYYY-MM-DD" in local time.

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDaysISO(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function startOfWeekISO(iso: string): string {
  const d = parseISO(iso);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function endOfWeekISO(iso: string): string {
  return addDaysISO(startOfWeekISO(iso), 6);
}

export function startOfMonthISO(year: number, monthIndex: number): string {
  return toISODate(new Date(year, monthIndex, 1));
}

export function endOfMonthISO(year: number, monthIndex: number): string {
  return toISODate(new Date(year, monthIndex + 1, 0));
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_LONG = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseISO(iso);
  const now = new Date();
  const withYear = d.getFullYear() !== now.getFullYear();
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}${withYear ? `, ${d.getFullYear()}` : ""}`;
}

export function formatDateLong(iso: string): string {
  const d = parseISO(iso);
  return `${WEEKDAYS_LONG[(d.getDay() + 6) % 7]}, ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}`;
}

export function formatMonthYear(year: number, monthIndex: number): string {
  return `${MONTHS_LONG[monthIndex]} ${year}`;
}

export function weekdayShort(iso: string): string {
  return WEEKDAYS_SHORT[(parseISO(iso).getDay() + 6) % 7];
}

export function weekdayLetter(iso: string): string {
  return weekdayShort(iso).charAt(0);
}

export function relativeDayLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const today = todayISO();
  if (iso === today) return "Today";
  if (iso === addDaysISO(today, 1)) return "Tomorrow";
  if (iso === addDaysISO(today, -1)) return "Yesterday";
  return formatDate(iso);
}

export function isPastDate(iso: string): boolean {
  return iso < todayISO();
}

export function isToday(iso: string): boolean {
  return iso === todayISO();
}

export function monthGridWeeks(year: number, monthIndex: number): string[][] {
  // Rows of ISO dates covering the displayed month grid (Mon-start weeks).
  const first = parseISO(startOfMonthISO(year, monthIndex));
  const last = parseISO(endOfMonthISO(year, monthIndex));
  const cursor = parseISO(startOfWeekISO(toISODate(first)));
  const weeks: string[][] = [];
  while (cursor <= last) {
    const week: string[] = [];
    for (let d = 0; d < 7; d += 1) {
      week.push(toISODate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function weekDates(weekStartISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(weekStartISO, i));
}
