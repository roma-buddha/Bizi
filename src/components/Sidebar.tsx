import { useStore } from "../state/store";

/** Bare sidebar panel: navigation items are added back function by function. */
export function Sidebar() {
  const { sidebarCollapsed, sidebarWidth, setSidebarWidth } = useStore();

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
    </nav>
  );
}
