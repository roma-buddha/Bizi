import { useEffect, useState } from "react";
import { addDaysISO, numericDate, todayISO, weekdayLabel } from "../utils/date";

export interface DailyTask {
  id: string;
  title: string;
  done: boolean;
}

const STORAGE_KEY = "bizi.daily-tasks.v1";
const DAYS_AHEAD = 7;

type ByDay = Record<string, DailyTask[]>;

function load(): ByDay {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ByDay;
  } catch {
    // corrupted or unavailable storage
  }
  return {};
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function PlannerPage() {
  const [byDay, setByDay] = useState<ByDay>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(byDay));
    } catch {
      // storage unavailable
    }
  }, [byDay]);

  const add = (dateISO: string, title: string) => {
    setByDay((prev) => ({
      ...prev,
      [dateISO]: [...(prev[dateISO] ?? []), { id: newId(), title, done: false }],
    }));
  };

  const toggle = (dateISO: string, id: string) => {
    setByDay((prev) => ({
      ...prev,
      [dateISO]: (prev[dateISO] ?? []).map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    }));
  };

  const today = todayISO();
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDaysISO(today, i));

  return (
    <div className="page">
      {days.map((day) => (
        <DayCard key={day} dateISO={day} tasks={byDay[day] ?? []} onAdd={add} onToggle={toggle} />
      ))}
    </div>
  );
}

function DayCard({
  dateISO,
  tasks,
  onAdd,
  onToggle,
}: {
  dateISO: string;
  tasks: DailyTask[];
  onAdd: (dateISO: string, title: string) => void;
  onToggle: (dateISO: string, id: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAdd(dateISO, trimmed);
    setDraft("");
  };

  return (
    <section className="agenda-card" aria-label={weekdayLabel(dateISO)}>
      <div className="agenda-head">
        <span className="agenda-weekday">{weekdayLabel(dateISO)}</span>
        <span className="agenda-date">{numericDate(dateISO)}</span>
      </div>
      <div className="agenda-body">
        <div className="agenda-rows">
          {tasks.map((task) => (
            <div key={task.id} className={`agenda-row${task.done ? " completed" : ""}`}>
              <input
                type="checkbox"
                className="task-checkbox"
                checked={task.done}
                aria-label={task.done ? "Mark as not done" : "Mark as done"}
                onChange={() => onToggle(dateISO, task.id)}
              />
              <span className="agenda-title">{task.title}</span>
            </div>
          ))}
          <div className="agenda-row agenda-add">
            <span className="agenda-checkbox-spacer" aria-hidden />
            <input
              className="agenda-add-input"
              placeholder="Add…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              onBlur={submit}
              aria-label={`Add task to ${weekdayLabel(dateISO)}`}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
