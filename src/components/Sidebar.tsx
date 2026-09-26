import {
  Archive,
  CalendarDays,
  CircleCheck,
  FolderKanban,
  Inbox,
  Layers,
  Map,
  Repeat,
  Settings,
  Sun,
  Target,
  type LucideIcon,
} from "lucide-react";
import { SECTIONS, useStore, type SectionId } from "../state/store";

const SECTION_ICONS: Record<SectionId, LucideIcon> = {
  today: Sun,
  inbox: Inbox,
  areas: Layers,
  goals: Target,
  projects: FolderKanban,
  todo: CircleCheck,
  calendar: CalendarDays,
  habits: Repeat,
  reviews: Map,
  archive: Archive,
  settings: Settings,
};

const NAV_GROUPS: SectionId[][] = [
  ["today", "inbox"],
  ["areas", "goals", "projects", "todo"],
  ["calendar", "habits"],
  ["reviews"],
];

export function Sidebar() {
  const { section, setSection, sidebarCollapsed, sidebarWidth, setSidebarWidth } = useStore();

  return (
    <nav className={`sidebar${sidebarCollapsed ? " collapsed" : ""}`} aria-label="Main navigation">
      {!sidebarCollapsed && (
        <div
          className="sidebar-resizer"
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          aria-valuemin={220}
          aria-valuemax={480}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            setSidebarWidth(sidebarWidth + (event.key === "ArrowRight" ? 12 : -12));
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            const move = (next: PointerEvent) => setSidebarWidth(next.clientX);
            const stop = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", stop);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", stop);
          }}
        />
      )}
      {NAV_GROUPS.map((group, i) => (
        <div key={group.join("-")} className="nav-group">
          {i > 0 && !sidebarCollapsed && <div className="nav-section" />}
          {group.map((id) => {
            const Icon = SECTION_ICONS[id];
            const label = SECTIONS.find((s) => s.id === id)?.label ?? id;
            const active = section === id;
            return (
              <button
                key={id}
                className={`nav-item${active ? " active" : ""}`}
                onClick={() => setSection(id)}
                title={sidebarCollapsed ? label : undefined}
                aria-current={active ? "page" : undefined}
              >
                <span className="nav-icon">
                  <Icon size={16} />
                </span>
                {!sidebarCollapsed && <span className="nav-label">{label}</span>}
              </button>
            );
          })}
        </div>
      ))}
      <div className="sidebar-spacer" />
      <div className="sidebar-foot">
        <Sun size={12} aria-hidden />
        {!sidebarCollapsed && <span>One life, one system</span>}
      </div>
    </nav>
  );
}
