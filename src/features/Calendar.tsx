import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../db";
import type { Task } from "../models/types";
import { useQuery, useStore } from "../state/store";
import { dateDropHandler, taskDragStart, TASK_DRAG_TYPE } from "../components/TaskRow";
import {
  formatMonthYear,
  monthGridWeeks,
  parseISO,
  todayISO,
  weekdayShort,
} from "../utils/date";

type ToggleKey = "tasks" | "deadlines" | "projects" | "habits";

export function CalendarPage() {
  const { bumpData, openTaskDetail, navigate } = useStore();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    tasks: true,
    deadlines: true,
    projects: true,
    habits: false,
  });

  const weeks = useMemo(() => monthGridWeeks(year, month), [year, month]);
  const from = weeks[0][0];
  const to = weeks[weeks.length - 1][6];

  const { data: scheduled } = useQuery(
    () => api.task.list({ scheduledFrom: from, scheduledTo: to, excludeStatuses: ["cancelled"] }),
    [from, to],
  );
  const { data: due } = useQuery(
    () => api.task.list({ dueFrom: from, dueTo: to, excludeStatuses: ["cancelled"] }),
    [from, to],
  );
  const { data: projects } = useQuery(() => api.project.list({}), []);
  const { data: habitEntries } = useQuery(() => api.habit.entries(from, to), [from, to]);

  const scheduledByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of scheduled ?? []) {
      if (!t.scheduledDate || t.status === "completed") continue;
      const list = map.get(t.scheduledDate) ?? [];
      list.push(t);
      map.set(t.scheduledDate, list);
    }
    return map;
  }, [scheduled]);

  const dueByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of due ?? []) {
      if (!t.dueDate || t.status === "completed") continue;
      const list = map.get(t.dueDate) ?? [];
      list.push(t);
      map.set(t.dueDate, list);
    }
    return map;
  }, [due]);

  const habitDays = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of habitEntries ?? []) {
      if (e.completed) map.set(e.date, (map.get(e.date) ?? 0) + 1);
    }
    return map;
  }, [habitEntries]);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const reschedule = async (taskId: string, date: string) => {
    await api.task.update(taskId, { scheduledDate: date });
    bumpData();
  };

  const today = todayISO();

  return (
    <div className="page wide">
      <header className="page-header with-action">
        <div>
          <h1>{formatMonthYear(year, month)}</h1>
          <p className="page-subtitle">Drag a task to another day to reschedule it.</p>
        </div>
        <div className="header-actions">
          <div className="chip-group">
            {(
              [
                ["tasks", "Tasks"],
                ["deadlines", "Deadlines"],
                ["projects", "Projects"],
                ["habits", "Habits"],
              ] as [ToggleKey, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                className={`chip${toggles[key] ? " active" : ""}`}
                onClick={() => setToggles((prev) => ({ ...prev, [key]: !prev[key] }))}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="chip-group">
            <button className="icon-button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={16} />
            </button>
            <button
              className="chip"
              onClick={() => {
                const d = new Date();
                setYear(d.getFullYear());
                setMonth(d.getMonth());
              }}
            >
              Today
            </button>
            <button className="icon-button" onClick={() => shiftMonth(1)} aria-label="Next month">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="calendar">
        <div className="calendar-weekdays">
          {weeks[0].map((iso) => (
            <div key={iso} className="calendar-weekday">
              {weekdayShort(iso)}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} className="calendar-week">
            {week.map((iso) => {
              const inMonth = parseISO(iso).getMonth() === month;
              const scheduledItems = toggles.tasks ? (scheduledByDay.get(iso) ?? []) : [];
              const dueItems = toggles.deadlines ? (dueByDay.get(iso) ?? []) : [];
              const dayProjects = toggles.projects
                ? (projects ?? []).filter(
                    (p) =>
                      !p.archived &&
                      ((p.startDate != null && p.startDate <= iso && (p.targetDate ?? iso) >= iso) ||
                        p.targetDate === iso),
                  )
                : [];
              const habitCount = toggles.habits ? (habitDays.get(iso) ?? 0) : 0;
              const isWeekend = [5, 6].includes((parseISO(iso).getDay() + 6) % 7);
              return (
                <div
                  key={iso}
                  className={`calendar-day${inMonth ? "" : " outside"}${iso === today ? " today" : ""}${isWeekend ? " weekend" : ""}`}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes(TASK_DRAG_TYPE)) e.preventDefault();
                  }}
                  onDrop={(e) => dateDropHandler(e, iso, (id, date) => void reschedule(id, date))}
                >
                  <div className="calendar-day-number">{parseISO(iso).getDate()}</div>
                  <div className="calendar-day-items">
                    {scheduledItems.map((t) => (
                      <button
                        key={`s-${t.id}`}
                        className="calendar-item task"
                        draggable
                        onDragStart={(e) => taskDragStart(e, t.id)}
                        onClick={() => openTaskDetail(t.id)}
                        title={t.title}
                      >
                        {t.title}
                      </button>
                    ))}
                    {dueItems
                      .filter((t) => !scheduledItems.includes(t))
                      .map((t) => (
                        <button
                          key={`d-${t.id}`}
                          className={`calendar-item due ${t.deadlineType}`}
                          onClick={() => openTaskDetail(t.id)}
                          title={`Due: ${t.title}`}
                        >
                          {t.deadlineType === "hard" ? "◆" : "◇"} {t.title}
                        </button>
                      ))}
                    {dayProjects.map((p) => (
                      <button
                        key={`p-${p.id}`}
                        className="calendar-item project"
                        onClick={() => navigate({ kind: "project", id: p.id })}
                        title={`Project: ${p.title}`}
                      >
                        ▬ {p.title}
                      </button>
                    ))}
                    {habitCount > 0 ? (
                      <span className="calendar-habit-dots" title={`${habitCount} habits completed`}>
                        {Array.from({ length: Math.min(habitCount, 4) }, (_, i) => (
                          <span key={i} className="habit-dot" />
                        ))}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
