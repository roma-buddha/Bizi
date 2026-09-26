import { useState } from "react";
import { api } from "../db";
import type { Task } from "../models/types";
import { useQuery, useStore } from "../state/store";
import { todayISO } from "../utils/date";
import { TaskList } from "../components/TaskList";
import { Modal } from "../components/ui";

export function InboxPage() {
  const { bumpData } = useStore();
  const [draft, setDraft] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);
  const { data: items } = useQuery(
    () => api.task.list({ statuses: ["inbox"], excludeStatuses: [], parentId: "none" }),
    [],
  );

  const add = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    await api.task.create({ title: trimmed, status: "inbox" });
    setDraft("");
    bumpData();
  };

  const removeItem = async (id: string) => {
    if (window.confirm("Delete this inbox item?")) {
      await api.task.remove(id);
      bumpData();
    }
  };

  const activeItems = items ?? [];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Inbox</h1>
        <p className="page-subtitle">Capture first. Classify later.</p>
      </header>

      <div className="inbox-capture">
        <input
          className="inbox-input"
          placeholder="Capture a task, idea, reminder, note…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
        />
        <button className="button primary" disabled={!draft.trim()} onClick={() => void add()}>
          Capture
        </button>
      </div>

      <TaskList
        tasks={items}
        emptyTitle="Inbox is empty."
        emptyHint="Anything on your mind goes here — no project, area, or date required."
      />

      {activeItems.length > 0 ? (
        <div className="inbox-actions-bar">
          <button className="button ghost" onClick={() => setProcessing(activeItems[0].id)}>
            Process inbox ({activeItems.length})
          </button>
        </div>
      ) : null}

      {processing ? (
        <ProcessDialog
          itemId={processing}
          items={activeItems}
          onNext={(nextId) => setProcessing(nextId)}
          onClose={() => setProcessing(null)}
          onDelete={(id) => void removeItem(id)}
        />
      ) : null}
    </div>
  );
}

function ProcessDialog({
  itemId,
  items,
  onNext,
  onClose,
  onDelete,
}: {
  itemId: string;
  items: Task[];
  onNext: (nextId: string | null) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const { bumpData, navigate } = useStore();
  const item = items.find((t) => t.id === itemId);
  const index = items.findIndex((t) => t.id === itemId);

  if (!item) {
    onClose();
    return null;
  }

  const next = () => {
    const remaining = items.filter((t) => t.id !== itemId);
    onNext(remaining.length > 0 ? remaining[Math.min(index, remaining.length - 1)].id : null);
    bumpData();
  };

  const asTask = async () => {
    await api.task.update(item.id, { status: "todo", scheduledDate: todayISO() });
    next();
  };
  const asProject = async () => {
    await api.project.create({ title: item.title, status: "planned" });
    await api.task.remove(item.id);
    next();
  };
  const asGoal = async () => {
    await api.goal.create({ title: item.title, status: "planned" });
    await api.task.remove(item.id);
    next();
  };

  return (
    <Modal title={`Process: ${item.title}`} onClose={onClose} width={440}>
      <p className="dialog-hint">
        Item {index + 1} of {items.length}. What is this?
      </p>
      <div className="process-actions">
        <button className="button primary" onClick={() => void asTask()}>
          Convert to Task (scheduled today)
        </button>
        <button className="button ghost" onClick={() => void asProject()}>
          Convert to Project
        </button>
        <button className="button ghost" onClick={() => void asGoal()}>
          Convert to Goal
        </button>
        <button
          className="button ghost"
          onClick={() => {
            onClose();
            navigate({ kind: "todo" });
          }}
        >
          Leave for later
        </button>
        <button
          className="button danger"
          onClick={() => {
            onDelete(item.id);
            next();
          }}
        >
          Delete
        </button>
      </div>
    </Modal>
  );
}
