import { useEffect, useRef, useState } from "react";
import { api } from "../db";
import type { Priority, Project } from "../models/types";
import { PRIORITIES, PRIORITY_NAMES } from "../models/types";
import { useQuery, useStore } from "../state/store";
import { addDaysISO, todayISO } from "../utils/date";

type DateChoice = "none" | "today" | "tomorrow" | "date";

export function QuickAdd() {
  const { quickAddOpen, setQuickAddOpen, bumpData, navigate } = useStore();
  const [title, setTitle] = useState("");
  const [dateChoice, setDateChoice] = useState<DateChoice>("none");
  const [date, setDate] = useState(todayISO());
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<Priority>("p3");
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: projects } = useQuery<Project[]>(() => api.project.list({ statuses: ["active", "planned", "waiting"] }), []);

  useEffect(() => {
    if (quickAddOpen) {
      setTitle("");
      setDateChoice("none");
      setProjectId("");
      setPriority("p3");
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [quickAddOpen]);

  if (!quickAddOpen) return null;

  const scheduledDate =
    dateChoice === "today" ? todayISO() : dateChoice === "tomorrow" ? addDaysISO(todayISO(), 1) : dateChoice === "date" ? date : null;

  const create = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await api.task.create({
      title: trimmed,
      status: "todo",
      projectId: projectId || null,
      scheduledDate,
      priority,
    });
    bumpData();
    setQuickAddOpen(false);
    navigate({ kind: "today" });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setQuickAddOpen(false)}>
      <div className="quick-add" role="dialog" aria-label="Quick add task">
        <input
          ref={inputRef}
          className="quick-add-input"
          placeholder="Task title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void create();
            if (e.key === "Escape") setQuickAddOpen(false);
          }}
        />
        <div className="quick-add-chips">
          <div className="chip-group" role="radiogroup" aria-label="Schedule">
            {(
              [
                ["none", "No date"],
                ["today", "Today"],
                ["tomorrow", "Tomorrow"],
                ["date", "Pick"],
              ] as [DateChoice, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                role="radio"
                aria-checked={dateChoice === value}
                className={`chip${dateChoice === value ? " active" : ""}`}
                onClick={() => setDateChoice(value)}
              >
                {label}
              </button>
            ))}
            {dateChoice === "date" ? (
              <input
                type="date"
                className="chip-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            ) : null}
          </div>
          <select
            className="chip-select"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label="Project"
          >
            <option value="">No project</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <select
            className="chip-select"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            aria-label="Priority"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.toUpperCase()} · {PRIORITY_NAMES[p]}
              </option>
            ))}
          </select>
          <div className="quick-add-actions">
            <button className="button ghost" onClick={() => setQuickAddOpen(false)}>
              Cancel
            </button>
            <button className="button primary" disabled={!title.trim()} onClick={() => void create()}>
              Add task
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
