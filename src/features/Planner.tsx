import { useEffect, useRef, useState, type DragEvent } from "react";
import { addDaysISO, numericDate, todayISO, weekdayLabel } from "../utils/date";

export interface DailyTask {
  id: string;
  title: string;
  done: boolean;
}

const STORAGE_KEY = "bizi.daily-tasks.v1";
const DAYS_AHEAD = 7;
const DRAG_TYPE = "application/x-bizi-daily-task";

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

  const today = todayISO();
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDaysISO(today, i));

  return (
    <div className="page">
      {days.map((day) => (
        <DayCard key={day} dateISO={day} tasks={byDay[day] ?? []} onAdd={add} onToggle={toggle} onMove={move} />
      ))}
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
