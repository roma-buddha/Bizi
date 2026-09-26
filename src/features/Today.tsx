import { CalendarPlus } from "lucide-react";
import { api } from "../db";
import { useQuery, useStore } from "../state/store";
import { addDaysISO, formatDateLong, todayISO } from "../utils/date";
import { TaskList } from "../components/TaskList";
import { SectionTitle } from "../components/ui";

export function TodayPage() {
  const { bumpData } = useStore();
  const today = todayISO();
  const { data: scheduled } = useQuery(
    () => api.task.list({ scheduledFrom: today, scheduledTo: today, excludeStatuses: ["completed", "cancelled"] }),
    [today],
  );
  const { data: dueToday } = useQuery(
    () =>
      api.task.list({
        dueFrom: today,
        dueTo: today,
        excludeStatuses: ["completed", "cancelled"],
        parentId: "none",
      }),
    [today],
  );
  const { data: overdue } = useQuery(
    () =>
      api.task.list({
        dueTo: addDaysISO(today, -1),
        dueFrom: "2000-01-01",
        excludeStatuses: ["completed", "cancelled"],
        parentId: "none",
      }),
    [today],
  );
  const { data: completed } = useQuery(
    () => api.task.list({ statuses: ["completed"], scheduledFrom: today, scheduledTo: today, parentId: "none" }),
    [today],
  );

  // Tasks due today that are not already scheduled today (avoid duplicates).
  const dueOnly = (dueToday ?? []).filter((t) => t.scheduledDate !== today);
  const overdueList = (overdue ?? []).filter((t) => t.scheduledDate !== today);
  const doneToday = (completed ?? []).filter(
    (t) => t.completedAt && t.completedAt.slice(0, 10) === today,
  );

  return (
    <div className="page">
      <header className="page-header">
        <h1>{formatDateLong(today)}</h1>
        <p className="page-subtitle">What do I need to deal with today?</p>
      </header>

      {overdueList.length > 0 ? (
        <section>
          <div className="section-head">
            <SectionTitle>Overdue</SectionTitle>
            <button
              className="button ghost small"
              onClick={() =>
                overdueList.forEach((t) => void api.task.update(t.id, { scheduledDate: today }).then(bumpData))
              }
            >
              <CalendarPlus size={14} /> Move all to today
            </button>
          </div>
          <TaskList tasks={overdueList} emptyTitle="Nothing overdue" />
        </section>
      ) : null}

      <section>
        <SectionTitle>Today</SectionTitle>
        <TaskList
          tasks={scheduled}
          emptyTitle="Nothing scheduled for today."
          emptyHint="Capture a task with the + button, or drag a task onto today in the calendar."
        />
      </section>

      {dueOnly.length > 0 ? (
        <section>
          <SectionTitle>Due today</SectionTitle>
          <TaskList tasks={dueOnly} emptyTitle="Nothing due today" />
        </section>
      ) : null}

      {doneToday.length > 0 ? (
        <section>
          <SectionTitle>Completed today</SectionTitle>
          <TaskList tasks={doneToday} emptyTitle="Nothing completed yet" />
        </section>
      ) : null}
    </div>
  );
}
