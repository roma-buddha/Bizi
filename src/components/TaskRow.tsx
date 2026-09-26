import type { DragEvent } from "react";
import type { Task } from "../models/types";
import { relativeDayLabel, todayISO } from "../utils/date";
import { DeadlineBadge, PriorityBadge } from "./ui";

export const TASK_DRAG_TYPE = "application/x-bizi-task";

export function taskDragStart(e: DragEvent, taskId: string) {
  e.dataTransfer.setData(TASK_DRAG_TYPE, taskId);
  e.dataTransfer.effectAllowed = "move";
}

export function dateDropHandler(e: DragEvent, iso: string, onDropTask: (taskId: string, date: string) => void) {
  const taskId = e.dataTransfer.getData(TASK_DRAG_TYPE);
  if (taskId) {
    e.preventDefault();
    onDropTask(taskId, iso);
  }
}

export function TaskRow({
  task,
  onToggleComplete,
  onOpen,
  onContextMenu,
  draggable = true,
}: {
  task: Task;
  onToggleComplete: (task: Task) => void;
  onOpen: (task: Task) => void;
  onContextMenu?: (task: Task, x: number, y: number) => void;
  draggable?: boolean;
}) {
  const completed = task.status === "completed";
  const overdue =
    !completed && task.dueDate != null && task.dueDate < todayISO() && task.status !== "cancelled";

  return (
    <div
      className={`task-row${completed ? " completed" : ""}`}
      draggable={draggable && !completed}
      onDragStart={(e) => taskDragStart(e, task.id)}
      onClick={() => onOpen(task)}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.preventDefault();
          onContextMenu(task, e.clientX, e.clientY);
        }
      }}
    >
      <input
        type="checkbox"
        className="task-checkbox"
        checked={completed}
        aria-label={completed ? "Mark as not completed" : "Mark as completed"}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggleComplete(task)}
      />
      <div className="task-main">
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          {task.projectName ? <span className="task-project">{task.projectName}</span> : null}
          {task.areaName ? (
            <span className="task-area">
              {task.projectName ? <span className="meta-sep">·</span> : null}
              {task.areaName}
            </span>
          ) : null}
        </span>
      </div>
      <div className="task-side">
        <PriorityBadge priority={task.priority} />
        {task.deadlineType !== "none" && task.dueDate ? (
          <DeadlineBadge type={task.deadlineType} date={relativeDayLabel(task.dueDate)} />
        ) : task.scheduledDate ? (
          <span className="task-date">{relativeDayLabel(task.scheduledDate)}</span>
        ) : null}
        {overdue && task.deadlineType === "none" ? (
          <span className="badge overdue">Overdue · {relativeDayLabel(task.dueDate)}</span>
        ) : null}
      </div>
    </div>
  );
}
