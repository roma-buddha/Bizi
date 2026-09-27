import { useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { TaskDetailPanel } from "./components/TaskDetailPanel";
import { TopBar } from "./components/TopBar";
import { AreasPage, ProjectsPage } from "./features/Entities";
import { PlannerPage } from "./features/Planner";
import { useStore } from "./state/store";

export default function App() {
  const { section, sidebarWidth } = useStore();

  useEffect(() => {
    document.title = "Bizi";
  }, []);

  return (
    <div className="app" style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}>
      <TopBar />
      <div className="app-body">
        <Sidebar />
        <main className="main">
          {section === "today" ? <PlannerPage /> : null}
          {section === "projects" ? <ProjectsPage /> : null}
          {section === "areas" ? <AreasPage /> : null}
        </main>
        <TaskDetailPanel />
      </div>
    </div>
  );
}
