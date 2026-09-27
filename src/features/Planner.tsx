import { useEffect, useRef, useState, type DragEvent } from "react";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import { useStore, type DailyTask } from "../state/store";
import { addDaysISO, numericDate, todayISO, weekdayLabel } from "../utils/date";

const VIEW_KEY = "bizi.planner-view";
const DRAG_TYPE = "application/x-bizi-daily-task";

const VIEW_MODES = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "twoYears", label: "2 Years" },
] as const;

type ViewMode = (typeof VIEW_MODES)[number]["id"];

function loadView(): ViewMode {
  const saved = localStorage.getItem(VIEW_KEY);
  return (VIEW_MODES.some((m) => m.id === saved) ? saved : "week") as ViewMode;
}

interface DragPayload {
  id: string;
  sourceDate: string;
}

function readPayload(e: DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    return raw ? (JSON.parse(raw) as DragPayload) : null;
  } catch {
    return null;
  }
}

/** The days to show for a view mode. Month shows the full calendar month;
 *  Week starts on Monday of the current week. */
function daysFor(mode: ViewMode, today: string): string[] {
  const [y, m] = today.split("-");
  let start = today;
  let end: string;
  if (mode === "day") {
    end = today;
  } else if (mode === "week") {
    const d = new Date(today + "T00:00:00");
    const sinceMonday = (d.getDay() + 6) % 7; // Monday = 0
    start = addDaysISO(today, -sinceMonday);
    end = addDaysISO(start, 6);
  } else if (mode === "month") {
    const last = new Date(Number(y), Number(m), 0).getDate();
    start = `${y}-${m}-01`;
    end = `${y}-${m}-${String(last).padStart(2, "0")}`;
  } else if (mode === "year") {
    end = `${y}-12-31`;
  } else {
    end = addDaysISO(today, 730);
  }
  const out: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDaysISO(cursor, 1)) {
    out.push(cursor);
  }
  return out;
}

export function PlannerPage() {
  const { byDay, toggleTask, moveTask } = useStore();
  const [view, setView] = useState<ViewMode>(loadView);
  // Live date: re-reads the system clock so "today" is always real,
  // even if the app stays open overnight.
  const [today, setToday] = useState(todayISO);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = todayISO();
      setToday((prev) => (prev === now ? prev : now));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const changeView = (next: ViewMode) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // storage unavailable
    }
  };

  const days = daysFor(view, today);

  // Tasks assigned to days before today that were never marked done;
  // they are collected into the Unfulfilled bucket and hidden from
  // their original (past) day cards, which keep only completed history.
  const unfulfilled = Object.entries(byDay)
    .filter(([date]) => date < today)
    .flatMap(([dateISO, tasks]) =>
      tasks
        .filter((t) => t.status !== "done" && t.status !== "cancelled" && !t.archived)
        .map((task) => ({ task, dateISO })),
    )
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  return (
    <div className="page">
      <div className="planner-toolbar">
        <ViewMenu value={view} onChange={changeView} />
      </div>
      {unfulfilled.length > 0 ? (
        <section className="agenda-card agenda-unfulfilled" aria-label="Unfulfilled tasks">
          <div className="agenda-head">
            <span className="agenda-weekday">Unfulfilled</span>
            <span className="agenda-date">
              {unfulfilled.length} task{unfulfilled.length === 1 ? "" : "s"} carried over
            </span>
          </div>
          <div className="agenda-body">
            <div className="agenda-rows">
              {unfulfilled.map(({ task, dateISO }) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  sourceDate={dateISO}
                  onToggle={() => toggleTask(dateISO, task.id)}
                  onDropBefore={(e) => e.preventDefault()}
                  onDragOverRow={(e) => e.preventDefault()}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}
      {days.map((day) => (
        <DayCard
          key={`${view}:${day}`}
          dateISO={day}
          isPast={day < today}
          isToday={day === today}
          tasks={byDay[day] ?? []}
          onMove={moveTask}
        />
      ))}
    </div>
  );
}

function ViewMenu({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = VIEW_MODES.find((m) => m.id === value) ?? VIEW_MODES[1];

  return (
    <div className="view-menu" ref={ref}>
      <button
        className="view-menu-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <CalendarRange size={14} aria-hidden />
        <span>{current.label}</span>
        <ChevronDown size={13} aria-hidden />
      </button>
      {open ? (
        <div className="view-menu-pop" role="menu" aria-label="Planner view">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode.id}
              role="menuitemradio"
              aria-checked={mode.id === value}
              className={`view-menu-item${mode.id === value ? " active" : ""}`}
              onClick={() => {
                onChange(mode.id);
                setOpen(false);
              }}
            >
              <span className="view-menu-check">{mode.id === value ? <Check size={13} /> : null}</span>
              {mode.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DayCard({
  dateISO,
  isPast,
  isToday,
  tasks,
  onMove,
}: {
  dateISO: string;
  isPast: boolean;
  isToday: boolean;
  tasks: DailyTask[];
  onMove: (sourceDate: string, targetDate: string, id: string, index?: number) => void;
}) {
  const { addTask, toggleTask } = useStore();
  const [draft, setDraft] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const depth = useRef(0);
  const cardRef = useRef<HTMLElement>(null);

  // Keep the current date visible when the card mounts (view changes
  // remount day cards because the day list changes).
  useEffect(() => {
    if (isToday) cardRef.current?.scrollIntoView({ block: "nearest" });
  }, [isToday]);

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    addTask(dateISO, trimmed);
    setDraft("");
  };

  const acceptDrop = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: DragEvent, index?: number) => {
    e.preventDefault();
    depth.current = 0;
    setDropActive(false);
    const payload = readPayload(e);
    if (!payload) return;
    onMove(payload.sourceDate, dateISO, payload.id, index);
  };

  // Past days keep only completed history; open tasks moved to the bucket.
  // Archived tasks are hidden everywhere in the planner.
  const visibleTasks = (isPast ? tasks.filter((t) => t.status === "done") : tasks).filter((t) => !t.archived);

  return (
    <section
      ref={cardRef}
      className={`agenda-card${dropActive ? " drop-target" : ""}${isToday ? " agenda-today" : ""}`}
      aria-label={weekdayLabel(dateISO)}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        depth.current++;
        setDropActive(true);
      }}
      onDragLeave={() => {
        depth.current--;
        if (depth.current <= 0) {
          depth.current = 0;
          setDropActive(false);
        }
      }}
      onDragOver={acceptDrop}
      onDrop={(e) => handleDrop(e)}
    >
      <div className="agenda-head">
        <span className="agenda-weekday">{weekdayLabel(dateISO)}</span>
        <span className="agenda-date">{numericDate(dateISO)}</span>
      </div>
      <div className="agenda-body">
        <div className="agenda-rows">
          {visibleTasks.map((task, index) => (
            <TaskRow
              key={task.id}
              task={task}
              sourceDate={dateISO}
              onToggle={() => toggleTask(dateISO, task.id)}
              onDropBefore={(e) => handleDrop(e, index)}
              onDragOverRow={acceptDrop}
            />
          ))}
          {!isPast ? (
            <div
              className="agenda-row agenda-add"
              onDragOver={acceptDrop}
              onDrop={(e) => handleDrop(e, visibleTasks.length)}
            >
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
          ) : null}
        </div>
      </div>
    </section>
  );
}

function TaskRow({
  task,
  sourceDate,
  onToggle,
  onDropBefore,
  onDragOverRow,
}: {
  task: DailyTask;
  sourceDate: string;
  onToggle: () => void;
  onDropBefore: (e: DragEvent) => void;
  onDragOverRow: (e: DragEvent) => void;
}) {
  const { openDetail } = useStore();
  const [dragging, setDragging] = useState(false);
  const done = task.status === "done";

  return (
    <div
      className={`agenda-row${done ? " completed" : ""}${dragging ? " dragging" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ id: task.id, sourceDate }));
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onDragOver={onDragOverRow}
      onDrop={onDropBefore}
    >
      <input
        type="checkbox"
        className="task-checkbox"
        checked={done}
        aria-label={done ? "Mark as not done" : "Mark as done"}
        onChange={onToggle}
      />
      <button className="agenda-title" onClick={() => openDetail({ dateISO: sourceDate, id: task.id })}>
        {task.title}
      </button>
    </div>
  );
}
