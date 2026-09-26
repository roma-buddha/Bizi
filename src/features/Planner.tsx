import { useEffect, useRef, useState, type DragEvent } from "react";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import { addDaysISO, numericDate, todayISO, weekdayLabel } from "../utils/date";

export interface DailyTask {
  id: string;
  title: string;
  done: boolean;
}

const STORAGE_KEY = "bizi.daily-tasks.v1";
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

function loadView(): ViewMode {
  const saved = localStorage.getItem(VIEW_KEY);
  return (VIEW_MODES.some((m) => m.id === saved) ? saved : "week") as ViewMode;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  const [byDay, setByDay] = useState<ByDay>(load);
  const [view, setView] = useState<ViewMode>(loadView);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(byDay));
    } catch {
      // storage unavailable
    }
  }, [byDay]);

  const changeView = (next: ViewMode) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // storage unavailable
    }
  };

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

  /** Move a task to another day (or reorder within its day); index = insert position. */
  const move = (sourceDate: string, targetDate: string, id: string, index?: number) => {
    setByDay((prev) => {
      const task = (prev[sourceDate] ?? []).find((t) => t.id === id);
      if (!task) return prev;
      const sourceList = (prev[sourceDate] ?? []).filter((t) => t.id !== id);
      const targetList = sourceDate === targetDate ? sourceList : [...(prev[targetDate] ?? [])];
      const at = index == null ? targetList.length : Math.min(index, targetList.length);
      targetList.splice(at, 0, task);
      return { ...prev, [sourceDate]: sourceList, [targetDate]: targetList };
    });
  };

  const days = daysFor(view, todayISO());
  const firstDay = days[0];

  // Tasks assigned to days before this view that were never marked done.
  const unfulfilled = Object.entries(byDay)
    .filter(([date]) => date < firstDay)
    .flatMap(([dateISO, tasks]) => tasks.filter((t) => !t.done).map((task) => ({ task, dateISO })))
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
            <span className="agenda-date">before {numericDate(firstDay)}</span>
          </div>
          <div className="agenda-body">
            <div className="agenda-rows">
              {unfulfilled.map(({ task, dateISO }) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  sourceDate={dateISO}
                  onToggle={() => toggle(dateISO, task.id)}
                  onDropBefore={(e) => e.preventDefault()}
                  onDragOverRow={(e) => e.preventDefault()}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}
      {days.map((day) => (
        <DayCard key={day} dateISO={day} tasks={byDay[day] ?? []} onAdd={add} onToggle={toggle} onMove={move} />
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
  tasks,
  onAdd,
  onToggle,
  onMove,
}: {
  dateISO: string;
  tasks: DailyTask[];
  onAdd: (dateISO: string, title: string) => void;
  onToggle: (dateISO: string, id: string) => void;
  onMove: (sourceDate: string, targetDate: string, id: string, index?: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const depth = useRef(0);

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAdd(dateISO, trimmed);
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

  return (
    <section
      className={`agenda-card${dropActive ? " drop-target" : ""}`}
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
          {tasks.map((task, index) => (
            <TaskRow
              key={task.id}
              task={task}
              sourceDate={dateISO}
              onToggle={() => onToggle(dateISO, task.id)}
              onDropBefore={(e) => handleDrop(e, index)}
              onDragOverRow={acceptDrop}
            />
          ))}
          <div
            className="agenda-row agenda-add"
            onDragOver={acceptDrop}
            onDrop={(e) => handleDrop(e, tasks.length)}
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
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={`agenda-row${task.done ? " completed" : ""}${dragging ? " dragging" : ""}`}
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
        checked={task.done}
        aria-label={task.done ? "Mark as not done" : "Mark as done"}
        onChange={onToggle}
      />
      <span className="agenda-title">{task.title}</span>
    </div>
  );
}
