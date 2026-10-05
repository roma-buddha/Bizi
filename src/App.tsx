import { useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { TaskDetailPanel } from "./components/TaskDetailPanel";
import { TopBar } from "./components/TopBar";
import { AreasPage, ProjectsPage } from "./features/Entities";
import { LifePage } from "./features/Life";
import { PlannerPage } from "./features/Planner";
import { useStore } from "./state/store";

export default function App() {
  const {
    section,
    sidebarWidth,
    hydrated,
    pending,
    error,
    dismissError,
    retryLoad,
  } = useStore();

  useEffect(() => {
    document.title = "Bizi";
  }, []);

  return (
    <div
      className="app"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <TopBar />
      {error ? (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button className="button small" onClick={retryLoad}>
            Reload data
          </button>
          <button className="button small ghost" onClick={dismissError}>
            Dismiss
          </button>
        </div>
      ) : null}
      <div className="app-body">
        <Sidebar />
        <main className="main" aria-busy={pending > 0}>
          {!hydrated ? (
            <p className="page" role="status">
              {error
                ? "Data could not be loaded. Use Reload data to retry."
                : "Loading data…"}
            </p>
          ) : null}
          <fieldset className="edit-fields" disabled={!hydrated || pending > 0}>
            {section === "today" ? <PlannerPage /> : null}
            {section === "projects" ? <ProjectsPage /> : null}
            {section === "areas" ? <AreasPage /> : null}
            {section === "life" ? <LifePage /> : null}
          </fieldset>
        </main>
        <TaskDetailPanel />
      </div>
    </div>
  );
}
