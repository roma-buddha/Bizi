import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../db";
import type { SearchResults } from "../models/types";
import { TASK_STATUS_LABELS, GOAL_STATUS_LABELS, PROJECT_STATUS_LABELS } from "../models/types";
import { useStore, type Route } from "../state/store";
import { useDebounced } from "./ui";

interface PaletteItem {
  key: string;
  group: "Actions" | "Tasks" | "Projects" | "Goals" | "Areas" | "Notes";
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, navigate, setQuickAddOpen } = useStore();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<SearchResults | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounced(query, 120);

  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setIndex(0);
      setResults(null);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [paletteOpen]);

  useEffect(() => {
    if (!paletteOpen || !debounced.trim()) {
      setResults(null);
      return;
    }
    let cancelled = false;
    api.search
      .all(debounced)
      .then((r) => {
        if (!cancelled) setResults(r);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [debounced, paletteOpen]);

  const go = (route: Route) => {
    setPaletteOpen(false);
    navigate(route);
  };

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [];
    const q = query.trim().toLowerCase();
    const actions: PaletteItem[] = [
      { key: "a-add-task", group: "Actions", label: "Add Task", run: () => { setPaletteOpen(false); setQuickAddOpen(true); } },
      { key: "a-today", group: "Actions", label: "Go to Today", run: () => go({ kind: "today" }) },
      { key: "a-inbox", group: "Actions", label: "Go to Inbox", run: () => go({ kind: "inbox" }) },
      { key: "a-process", group: "Actions", label: "Process Inbox", run: () => go({ kind: "inbox" }) },
      { key: "a-calendar", group: "Actions", label: "Go to Calendar", run: () => go({ kind: "calendar" }) },
      { key: "a-projects", group: "Actions", label: "Go to Projects", run: () => go({ kind: "projects" }) },
      { key: "a-areas", group: "Actions", label: "Go to Areas", run: () => go({ kind: "areas" }) },
      { key: "a-goals", group: "Actions", label: "Go to Goals", run: () => go({ kind: "goals" }) },
      { key: "a-reviews", group: "Actions", label: "Go to Reviews", run: () => go({ kind: "reviews" }) },
    ];
    for (const action of actions) {
      if (!q || action.label.toLowerCase().includes(q)) list.push(action);
    }
    if (results) {
      for (const t of results.tasks)
        list.push({
          key: `t-${t.id}`,
          group: "Tasks",
          label: t.title,
          hint: TASK_STATUS_LABELS[t.status as keyof typeof TASK_STATUS_LABELS] ?? t.status,
          run: () => go({ kind: "todo" }),
        });
      for (const p of results.projects)
        list.push({
          key: `p-${p.id}`,
          group: "Projects",
          label: p.title,
          hint: PROJECT_STATUS_LABELS[p.status as keyof typeof PROJECT_STATUS_LABELS] ?? p.status,
          run: () => go({ kind: "project", id: p.id }),
        });
      for (const g of results.goals)
        list.push({
          key: `g-${g.id}`,
          group: "Goals",
          label: g.title,
          hint: GOAL_STATUS_LABELS[g.status as keyof typeof GOAL_STATUS_LABELS] ?? g.status,
          run: () => go({ kind: "goal", id: g.id }),
        });
      for (const a of results.areas)
        list.push({ key: `a-${a.id}`, group: "Areas", label: a.title, run: () => go({ kind: "area", id: a.id }) });
      for (const n of results.notes)
        list.push({
          key: `n-${n.entityId}-${n.title.length}`,
          group: "Notes",
          label: n.title.trim().split("\n")[0] || "(empty note)",
          hint: n.entityType,
          run: () => go({ kind: "todo" }),
        });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, results]);

  useEffect(() => setIndex(0), [items.length]);

  useEffect(() => {
    if (!paletteOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPaletteOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = items[index];
        if (item) item.run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, items, index, setPaletteOpen]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!paletteOpen) return null;

  let lastGroup = "";

  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setPaletteOpen(false)}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search or type a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="palette-list" ref={listRef} role="listbox">
          {items.length === 0 ? <div className="palette-empty">No results</div> : null}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.key}>
                {header ? <div className="palette-group">{header}</div> : null}
                <button
                  data-index={i}
                  role="option"
                  aria-selected={i === index}
                  className={`palette-item${i === index ? " active" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={item.run}
                >
                  <span className="palette-label">{item.label}</span>
                  {item.hint ? <span className="palette-hint">{item.hint}</span> : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
