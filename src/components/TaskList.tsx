import { useState } from "react";
import { api } from "../db";
import type { Task } from "../models/types";
import { useStore } from "../state/store";
import { todayISO } from "../utils/date";
import { TaskRow } from "./TaskRow";
import { ContextMenu, EmptyState, type MenuItem } from "./ui";

export function TaskList({
  tasks,
  emptyTitle,
  emptyHint,
  action,
}: {
  tasks: Task[] | null;
  emptyTitle: string;
  emptyHint?: string;
  action?: React.ReactNode;
}) {
  const { openTaskDetail, bumpData } = useStore();
  const [menu, setMenu] = useState<{ task: Task; x: number; y: number } | null>(null);

  const toggle = async (task: Task) => {
    await api.task.setComplete(task.id, task.status !== "completed");
    bumpData();
  };

  const menuItems = (task: Task): MenuItem[] => [
    {
      label: task.status === "completed" ? "Mark as not completed" : "Complete",
      onClick: () => void toggle(task),
    },
    {
      label: "Work on today",
      onClick: () => void api.task.update(task.id, { scheduledDate: todayISO() }).then(bumpData),
    },
    {
      label: task.archived ? "Unarchive" : "Archive",
      onClick: () => void api.task.update(task.id, { archived: !task.archived }).then(bumpData),
    },
    {
      label: "Delete",
      danger: true,
      onClick: () => {
        if (window.confirm(`Delete "${task.title}" permanently?`)) {
          void api.task.remove(task.id).then(bumpData);
        }
      },
    },
  ];

  if (tasks && tasks.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} action={action} />;
  }

  return (
    <div className="task-list">
      {tasks?.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          onToggleComplete={(t) => void toggle(t)}
          onOpen={(t) => openTaskDetail(t.id)}
          onContextMenu={(t, x, y) => setMenu({ task: t, x, y })}
        />
      ))}
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.task)} onClose={() => setMenu(null)} /> : null}
    </div>
  );
}
