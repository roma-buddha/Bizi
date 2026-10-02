import { FolderKanban, Hourglass, Layers, Sun } from "lucide-react";
import { SECTION_LABELS, useStore, type Section } from "../state/store";

const NAV_ITEMS: { id: Section; icon: typeof Sun }[] = [
  { id: "today", icon: Sun },
  { id: "projects", icon: FolderKanban },
  { id: "areas", icon: Layers },
  { id: "life", icon: Hourglass },
];

/** Sidebar panel: tabs are added back function by function. */
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
      <div className="nav-group">
        {NAV_ITEMS.map(({ id, icon: Icon }) => {
          const label = SECTION_LABELS[id];
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
    </nav>
  );
}
