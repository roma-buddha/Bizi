import {
  BookOpen,
  Briefcase,
  CalendarCheck,
  Code,
  Compass,
  Dumbbell,
  FlaskConical,
  GraduationCap,
  HeartPulse,
  Home,
  Music,
  Palette,
  Plane,
  Sprout,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AreaColor, Priority, ProjectStatus, TaskStatus } from "../models/types";
import { PRIORITY_LABELS, PROJECT_STATUS_LABELS, TASK_STATUS_LABELS } from "../models/types";

const AREA_ICON_MAP: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  "flask-conical": FlaskConical,
  "heart-pulse": HeartPulse,
  wallet: Wallet,
  users: Users,
  "calendar-check": CalendarCheck,
  "graduation-cap": GraduationCap,
  plane: Plane,
  home: Home,
  "book-open": BookOpen,
  dumbbell: Dumbbell,
  music: Music,
  palette: Palette,
  code: Code,
  sprout: Sprout,
  compass: Compass,
};

export function AreaIcon({ name, size = 15 }: { name: string; size?: number }) {
  const Cmp = AREA_ICON_MAP[name] ?? Compass;
  return <Cmp size={size} strokeWidth={1.8} aria-hidden />;
}

export function AreaDot({ color, size = 8 }: { color: string; size?: number }) {
  return <span className="area-dot" style={{ width: size, height: size }} data-color={color} />;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "p3") return null; // normal is the default, stay quiet
  return (
    <span className={`badge priority-${priority}`} title={priority === "p1" ? "Urgent" : "High"}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function DeadlineBadge({ type, date }: { type: "hard" | "soft" | "none"; date?: string | null }) {
  if (type === "none" || !date) return null;
  return (
    <span className={`badge deadline-${type}`}>
      {type === "hard" ? "Hard" : "Soft"} {date}
    </span>
  );
}

export function StatusBadge({ status, kind }: { status: TaskStatus | ProjectStatus; kind: "task" | "project" }) {
  const label =
    kind === "task"
      ? TASK_STATUS_LABELS[status as TaskStatus]
      : PROJECT_STATUS_LABELS[status as ProjectStatus];
  return <span className={`badge status-${status}`}>{label}</span>;
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <span className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <span className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {hint ? <p className="empty-hint">{hint}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          className={`tab${active === tab.id ? " active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  width,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { width } : undefined} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const style = {
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - items.length * 32 - 16),
  };
  return (
    <div className="context-menu" style={style} ref={ref} role="menu">
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          className={`context-menu-item${item.danger ? " danger" : ""}`}
          onClick={() => {
            onClose();
            item.onClick();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="field-input"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) onEnter();
        }}
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select className="field-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="field-input"
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </label>
  );
}

export function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="icon-picker" role="radiogroup" aria-label="Icon">
      {Object.keys(AREA_ICON_MAP).map((name) => (
        <button
          key={name}
          role="radio"
          aria-checked={value === name}
          className={`icon-option${value === name ? " active" : ""}`}
          onClick={() => onChange(name)}
          title={name}
        >
          <AreaIcon name={name} />
        </button>
      ))}
    </div>
  );
}

export function ColorPicker({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (value: string) => void;
  colors: readonly AreaColor[];
}) {
  return (
    <div className="color-picker" role="radiogroup" aria-label="Color">
      {colors.map((color) => (
        <button
          key={color}
          role="radio"
          aria-checked={value === color}
          className={`color-option${value === color ? " active" : ""}`}
          data-color={color}
          onClick={() => onChange(color)}
          title={color}
        />
      ))}
    </div>
  );
}

export function useConfirm(): (message: string) => boolean {
  return (message: string) => window.confirm(message);
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="section-title">{children}</h4>;
}

export function Spinner() {
  return <div className="spinner" aria-label="Loading" />;
}

export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
