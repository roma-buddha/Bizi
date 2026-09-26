import {
  Archive,
  CalendarDays,
  CircleCheck,
  Flag,
  FolderKanban,
  Inbox,
  Layers,
  Map,
  Repeat,
  Settings,
  Sun,
  Target,
} from "lucide-react";
import type { ReactNode } from "react";
import { api } from "../db";
import { useQuery, useStore, type Route } from "../state/store";

interface NavEntry {
  route: Route;
  label: string;
  icon: ReactNode;
  badge?: number;
}

function NavButton({ entry, active }: { entry: NavEntry; active: boolean }) {
  const { navigate, sidebarCollapsed } = useStore();
  return (
    <button
      className={`nav-item${active ? " active" : ""}`}
      onClick={() => navigate(entry.route)}
      title={sidebarCollapsed ? entry.label : undefined}
      aria-current={active ? "page" : undefined}
    >
      <span className="nav-icon">{entry.icon}</span>
      {!sidebarCollapsed && <span className="nav-label">{entry.label}</span>}
      {!sidebarCollapsed && entry.badge != null && entry.badge > 0 ? (
        <span className="nav-badge">{entry.badge}</span>
      ) : null}
    </button>
  );
}

export function Sidebar() {
  const { route, sidebarCollapsed } = useStore();
  const { data: counts } = useQuery(() => api.task.counts(), []);

  const isActive = (kind: Route["kind"]) => route.kind === kind;

  const main: NavEntry[] = [
    { route: { kind: "today" }, label: "Today", icon: <Sun size={16} />, badge: counts?.today },
    { route: { kind: "inbox" }, label: "Inbox", icon: <Inbox size={16} />, badge: counts?.inbox },
  ];
  const planning: NavEntry[] = [
    { route: { kind: "areas" }, label: "Areas", icon: <Layers size={16} /> },
    { route: { kind: "goals" }, label: "Goals", icon: <Target size={16} /> },
    { route: { kind: "projects" }, label: "Projects", icon: <FolderKanban size={16} /> },
    { route: { kind: "todo" }, label: "To-Do", icon: <CircleCheck size={16} /> },
  ];
  const time: NavEntry[] = [
    { route: { kind: "calendar" }, label: "Calendar", icon: <CalendarDays size={16} /> },
    { route: { kind: "habits" }, label: "Habits", icon: <Repeat size={16} /> },
  ];
  const reflection: NavEntry[] = [{ route: { kind: "reviews" }, label: "Reviews", icon: <Map size={16} /> }];

  return (
    <nav className={`sidebar${sidebarCollapsed ? " collapsed" : ""}`} aria-label="Main navigation">
      {!sidebarCollapsed && (
        <div className="nav-group">
          {main.map((entry) => (
            <NavButton key={entry.label} entry={entry} active={isActive(entry.route.kind)} />
          ))}
        </div>
      )}
      {sidebarCollapsed &&
        main.map((entry) => <NavButton key={entry.label} entry={entry} active={isActive(entry.route.kind)} />)}

      {!sidebarCollapsed && <div className="nav-section">Planning</div>}
      {planning.map((entry) => (
        <NavButton key={entry.label} entry={entry} active={isActive(entry.route.kind)} />
      ))}

      {!sidebarCollapsed && <div className="nav-section">Time</div>}
      {time.map((entry) => (
        <NavButton key={entry.label} entry={entry} active={isActive(entry.route.kind)} />
      ))}

      {!sidebarCollapsed && <div className="nav-section">Reflection</div>}
      {reflection.map((entry) => (
        <NavButton key={entry.label} entry={entry} active={isActive(entry.route.kind)} />
      ))}

      <div className="sidebar-spacer" />
      <NavButton
        entry={{ route: { kind: "archive" }, label: "Archive", icon: <Archive size={16} /> }}
        active={isActive("archive")}
      />
      <NavButton
        entry={{ route: { kind: "settings" }, label: "Settings", icon: <Settings size={16} /> }}
        active={isActive("settings")}
      />
      <div className="sidebar-foot">
        <Flag size={12} aria-hidden />
        {!sidebarCollapsed && <span>One life, one system</span>}
      </div>
    </nav>
  );
}
