import { useEffect, useState } from "react";
import { api } from "../db";
import type { EntityType } from "../models/types";
import { useDebounced } from "./ui";

export function NoteEditor({
  entityType,
  entityId,
  placeholder = "Notes…",
}: {
  entityType: EntityType;
  entityId: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const debounced = useDebounced(value, 400);

  useEffect(() => {
    let cancelled = false;
    setValue(null);
    api.note
      .get(entityType, entityId)
      .then((note) => {
        if (!cancelled) setValue(note?.content ?? "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  useEffect(() => {
    if (debounced == null) return;
    setSaved(false);
    const id = window.setTimeout(() => {
      api.note
        .save(entityType, entityId, debounced)
        .then(() => setSaved(true))
        .catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(id);
  }, [debounced, entityType, entityId]);

  if (value == null) return null;

  return (
    <div className="note-editor">
      <textarea
        className="note-textarea"
        value={value}
        placeholder={placeholder}
        rows={8}
        onChange={(e) => setValue(e.target.value)}
      />
      <span className={`note-status${saved ? "" : " pending"}`}>{saved ? "Saved" : "Saving…"}</span>
    </div>
  );
}
