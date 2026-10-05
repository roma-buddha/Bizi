import { useEffect, useReducer, useState } from "react";
import { useStore } from "../state/store";
import { TextDraft } from "../state/textDraft";

export function DraftField({
  draftKey,
  value,
  onSave,
  multiline = false,
  className = "field-input",
  placeholder,
  rows = 4,
  autoFocus = false,
  label,
}: {
  draftKey: string;
  value: string;
  onSave: (value: string) => Promise<boolean>;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  label?: string;
}) {
  const { registerDraft } = useStore();
  const [, render] = useReducer((n) => n + 1, 0);
  const [draft] = useState(() => new TextDraft(value, onSave, render));
  useEffect(() => {
    draft.save = onSave;
  }, [draft, onSave]);
  useEffect(() => {
    draft.sync(value);
  }, [draft, value]);
  useEffect(() => {
    const unregister = registerDraft(draftKey, () => draft.flush());
    return () => {
      unregister();
      draft.dispose();
    };
  }, [draft, draftKey, registerDraft]);
  const shared = {
    className,
    value: draft.value,
    placeholder,
    autoFocus,
    "aria-label": label,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => draft.change(event.target.value),
    onBlur: () => {
      void draft.flush();
    },
  };
  return (
    <>
      {multiline ? <textarea {...shared} rows={rows} /> : <input {...shared} />}
      {draft.saving ? (
        <span className="draft-status" role="status">
          Saving…
        </span>
      ) : draft.failed ? (
        <span className="draft-status" role="alert">
          Not saved.{" "}
          <button
            className="button small"
            onClick={() => {
              void draft.flush();
            }}
          >
            Retry
          </button>
        </span>
      ) : null}
    </>
  );
}
