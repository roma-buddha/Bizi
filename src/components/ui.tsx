import {
  BookOpen,
  Briefcase,
  CalendarCheck,
  Code,
  Columns2,
  Columns3,
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
  Square,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ITEM_COLORS } from "../state/store";

const ENTITY_ICON_MAP: Record<string, LucideIcon> = {
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

export function EntityIcon({ name, size = 15 }: { name: string; size?: number }) {
  const Cmp = ENTITY_ICON_MAP[name] ?? Compass;
  return <Cmp size={size} strokeWidth={1.8} aria-hidden />;
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
      {Object.keys(ENTITY_ICON_MAP).map((name) => (
        <button
          key={name}
          role="radio"
          aria-checked={value === name}
          className={`icon-option${value === name ? " active" : ""}`}
          onClick={() => onChange(name)}
          title={name}
        >
          <EntityIcon name={name} />
        </button>
      ))}
    </div>
  );
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="color-picker" role="radiogroup" aria-label="Color">
      {ITEM_COLORS.map((color) => (
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

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="section-title">{children}</h4>;
}

/* ---------------- density toggle (N cards per row) ---------------- */

export type BucketCols = 3 | 2 | 1;

/** Density preference, persisted per page. */
export function useBucketCols(storageKey: string): [BucketCols, (cols: BucketCols) => void] {
  const [cols, setCols] = useState<BucketCols>(() => {
    const saved = Number(localStorage.getItem(storageKey));
    return saved === 1 || saved === 2 ? (saved as BucketCols) : 3;
  });
  const set = (next: BucketCols) => {
    setCols(next);
    try {
      localStorage.setItem(storageKey, String(next));
    } catch {
      // storage unavailable
    }
  };
  return [cols, set];
}

const DENSITY_OPTIONS: { value: BucketCols; icon: ReactNode; label: string }[] = [
  { value: 3, icon: <Columns3 size={15} />, label: "Three per row" },
  { value: 2, icon: <Columns2 size={15} />, label: "Two per row" },
  { value: 1, icon: <Square size={15} />, label: "One per row" },
];

export function BucketDensityToggle({
  value,
  onChange,
}: {
  value: BucketCols;
  onChange: (cols: BucketCols) => void;
}) {
  return (
    <div className="chip-group" role="group" aria-label="Cards per row">
      {DENSITY_OPTIONS.map((option) => (
        <button
          key={option.value}
          className={`chip icon-chip${value === option.value ? " active" : ""}`}
          title={option.label}
          aria-label={option.label}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

/** Apply a density value to a grid element. */
export function densityStyle(cols: BucketCols): CSSProperties {
  return { "--grid-cols": cols } as CSSProperties;
}
