import { useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { SECTIONS, useStore } from "./state/store";

export default function App() {
  const { section, sidebarWidth } = useStore();
  const title = SECTIONS.find((s) => s.id === section)?.label ?? "Bizi";

  useEffect(() => {
    document.title = `${title} · Bizi`;
  }, [title]);

  return (
    <div className="app" style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}>
      <TopBar />
      <div className="app-body">
        <Sidebar />
        <main className="main">
          <div className="page">
            <header className="page-header">
              <h1>{title}</h1>
              <p className="page-subtitle">This section will be rebuilt function by function.</p>
            </header>
          </div>
        </main>
      </div>
    </div>
  );
}
