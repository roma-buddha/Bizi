import { daysFor, pageDays, type ViewMode } from "../utils/planner";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import {
  useStore,
  UNSCHEDULED,
  type TaskRef,
  type DailyTask,
} from "../state/store";
import { numericDate, todayISO, weekdayLabel } from "../utils/date";

const VIEW_KEY = "bizi.planner-view";
const DRAG_TYPE = "application/x-bizi-daily-task";

const VIEW_MODES = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "twoYears", label: "2 Years" },
] as const;

const EMPTY_TASKS: DailyTask[] = [];

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

export function PlannerPage() {
  const { byDay, toggleTask, moveTask, addTask, openDetail, updateTask } =
    useStore();
  const [view, setView] = useState<ViewMode>(loadView);
  const [page, setPage] = useState(0);
  const [archived, setArchived] = useState(false);
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
    setPage(0);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // storage unavailable
    }
  };

  const allDays = useMemo(() => daysFor(view, today), [view, today]);
  const longRange = view === "year" || view === "twoYears";
  const days = longRange ? pageDays(allDays, page) : allDays;
  const special = archived
    ? Object.entries(byDay).flatMap(([dateISO, tasks]) =>
        tasks.filter((t) => t.archived).map((task) => ({ task, dateISO })),
      )
    : (byDay[UNSCHEDULED] ?? [])
        .filter(
          (t) => !t.archived && t.status !== "done" && t.status !== "cancelled",
        )
        .map((task) => ({ task, dateISO: UNSCHEDULED }));

  // Tasks assigned to days before today that were never marked done;
  // they are collected into the Unfulfilled bucket and hidden from
  // their original (past) day cards, which keep only completed history.
  const unfulfilled = Object.entries(byDay)
    .filter(([date]) => date < today)
    .flatMap(([dateISO, tasks]) =>
      tasks
        .filter(
          (t) => t.status !== "done" && t.status !== "cancelled" && !t.archived,
        )
        .map((task) => ({ task, dateISO })),
    )
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  return (
    <div className="page">
      <div className="planner-toolbar">
        <ViewMenu value={view} onChange={changeView} />
        <button
          className="button small ghost"
          onClick={() => setArchived(!archived)}
        >
          {archived ? "Show active tasks" : "Archived tasks"}
        </button>
        {longRange && !archived ? (
          <div className="planner-pages">
            <button
              className="button small"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </button>
            <span>
              {numericDate(days[0])} – {numericDate(days[days.length - 1])}
            </span>
            <button
              className="button small"
              disabled={(page + 1) * 60 >= allDays.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
      {special.length > 0 || archived ? (
        <section
          className="agenda-card"
          aria-label={archived ? "Archived tasks" : "Unscheduled tasks"}
        >
          <div className="agenda-head">
            <span className="agenda-weekday">
              {archived ? "Archived tasks" : "Unscheduled"}
            </span>
          </div>
          <div className="agenda-body">
            <div className="agenda-rows">
              {special.map(({ task, dateISO }) => (
                <div key={task.id}>
                  <TaskRow
                    task={task}
                    sourceDate={dateISO}
                    onToggle={toggleTask}
                    onOpen={openDetail}
                    onDropBefore={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onDragOverRow={(event) => event.preventDefault()}
                  />
                  {archived ? (
                    <button
                      className="button small"
                      onClick={() => {
                        void updateTask(dateISO, task.id, { archived: false });
                      }}
                    >
                      Restore
                    </button>
                  ) : null}
                </div>
              ))}
              {archived && !special.length ? <p>No archived tasks.</p> : null}
            </div>
          </div>
        </section>
      ) : null}
      {!archived && unfulfilled.length > 0 ? (
        <section
          className="agenda-card agenda-unfulfilled"
          aria-label="Unfulfilled tasks"
        >
          <div className="agenda-head">
            <span className="agenda-weekday">Unfulfilled</span>
            <span className="agenda-date">
              {unfulfilled.length} task{unfulfilled.length === 1 ? "" : "s"}{" "}
              carried over
            </span>
          </div>
          <div className="agenda-body">
            <div className="agenda-rows">
              {unfulfilled.map(({ task, dateISO }) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  sourceDate={dateISO}
                  onToggle={toggleTask}
                  onOpen={openDetail}
                  onDropBefore={(e) => e.preventDefault()}
                  onDragOverRow={(e) => e.preventDefault()}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}
      {!archived &&
        days.map((day) => (
          <DayCard
            key={`${view}:${day}`}
            dateISO={day}
            isPast={day < today}
            isToday={day === today}
            tasks={byDay[day] ?? EMPTY_TASKS}
            onMove={moveTask}
            onAdd={addTask}
            onToggle={toggleTask}
            onOpen={openDetail}
          />
        ))}
    </div>
  );
}

function ViewMenu({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
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
              <span className="view-menu-check">
                {mode.id === value ? <Check size={13} /> : null}
              </span>
              {mode.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const DayCard = memo(function DayCard({
  dateISO,
  isPast,
  isToday,
  tasks,
  onMove,
  onAdd,
  onToggle,
  onOpen,
}: {
  dateISO: string;
  isPast: boolean;
  isToday: boolean;
  tasks: DailyTask[];
  onMove: (
    sourceDate: string,
    targetDate: string,
    id: string,
    index?: number,
  ) => Promise<boolean>;
  onAdd: (dateISO: string, title: string) => Promise<string | null>;
  onToggle: (dateISO: string, id: string) => Promise<boolean>;
  onOpen: (ref: TaskRef) => void;
}) {
  const [draft, setDraft] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const depth = useRef(0);
  const cardRef = useRef<HTMLElement>(null);

  // Keep the current date visible when the card mounts (view changes
  // remount day cards because the day list changes).
  useEffect(() => {
    if (isToday) cardRef.current?.scrollIntoView({ block: "nearest" });
  }, [isToday]);

  const submitting = useRef(false);
  const submit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || submitting.current) return;
    submitting.current = true;
    try {
      if (await onAdd(dateISO, trimmed))
        setDraft((previous) => (previous === trimmed ? "" : previous));
    } finally {
      submitting.current = false;
    }
  };

  const acceptDrop = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: DragEvent, index?: number) => {
    e.preventDefault();
    e.stopPropagation();
    depth.current = 0;
    setDropActive(false);
    const payload = readPayload(e);
    if (!payload) return;
    const before =
      index === undefined
        ? undefined
        : tasks
            .filter((t) => !t.archived)
            .filter((t) => t.id !== payload.id)
            .findIndex((t) => t.id === visibleTasks[index]?.id);
    void onMove(
      payload.sourceDate,
      dateISO,
      payload.id,
      before === -1 ? undefined : before,
    );
  };

  // Past days keep only completed history; open tasks moved to the bucket.
  // Archived tasks are hidden everywhere in the planner.
  const visibleTasks = (
    isPast ? tasks.filter((t) => t.status === "done") : tasks
  ).filter((t) => !t.archived);

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
              onToggle={onToggle}
              onOpen={onOpen}
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
});

const TaskRow = memo(function TaskRow({
  task,
  sourceDate,
  onToggle,
  onOpen,
  onDropBefore,
  onDragOverRow,
}: {
  task: DailyTask;
  sourceDate: string;
  onToggle: (dateISO: string, id: string) => Promise<boolean>;
  onOpen: (ref: TaskRef) => void;
  onDropBefore: (e: DragEvent) => void;
  onDragOverRow: (e: DragEvent) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const done = task.status === "done";

  return (
    <div
      className={`agenda-row${done ? " completed" : ""}${dragging ? " dragging" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(
          DRAG_TYPE,
          JSON.stringify({ id: task.id, sourceDate }),
        );
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
        onChange={() => {
          void onToggle(sourceDate, task.id);
        }}
      />
      <button
        className="agenda-title"
        onClick={() => onOpen({ dateISO: sourceDate, id: task.id })}
      >
        {task.title}
      </button>
    </div>
  );
});
