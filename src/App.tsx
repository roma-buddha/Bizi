import { useEffect } from "react";
import { CommandPalette } from "./components/CommandPalette";
import { QuickAdd } from "./components/QuickAdd";
import { Sidebar } from "./components/Sidebar";
import { TaskDetailPanel } from "./components/TaskDetailPanel";
import { TopBar } from "./components/TopBar";
import { AreaDetailPage, AreasPage } from "./features/Areas";
import { ArchivePage } from "./features/Archive";
import { CalendarPage } from "./features/Calendar";
import { GoalDetailPage, GoalsPage } from "./features/Goals";
import { HabitsPage } from "./features/Habits";
import { InboxPage } from "./features/Inbox";
import { ProjectDetailPage, ProjectsPage } from "./features/Projects";
import { ReviewsPage } from "./features/Reviews";
import { SettingsPage } from "./features/Settings";
import { TodayPage } from "./features/Today";
import { TodoPage } from "./features/TodoList";
import { useStore } from "./state/store";

function RouteView({ route }: { route: ReturnType<typeof useStore>["route"] }) {
  switch (route.kind) {
    case "today":
      return <TodayPage />;
    case "inbox":
      return <InboxPage />;
    case "areas":
      return <AreasPage />;
    case "area":
      return <AreaDetailPage id={route.id} />;
    case "goals":
      return <GoalsPage />;
    case "goal":
      return <GoalDetailPage id={route.id} />;
    case "projects":
      return <ProjectsPage />;
    case "project":
      return <ProjectDetailPage id={route.id} />;
    case "todo":
      return <TodoPage />;
    case "calendar":
      return <CalendarPage />;
    case "habits":
      return <HabitsPage />;
    case "reviews":
      return <ReviewsPage />;
    case "archive":
      return <ArchivePage />;
    case "settings":
      return <SettingsPage />;
  }
}

export default function App() {
  const { route, setPaletteOpen, setQuickAddOpen, detailTaskId } = useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target?.isContentEditable ?? false);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setQuickAddOpen(true);
      } else if (e.key === "Escape" && !typing) {
        // Route-level Escape is handled by individual panels.
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen, setQuickAddOpen]);

  return (
    <div className="app">
      <TopBar />
      <div className="app-body">
        <Sidebar />
        <main className="main" data-detail-open={detailTaskId != null}>
          <RouteView route={route} />
        </main>
        <TaskDetailPanel />
      </div>
      <CommandPalette />
      <QuickAdd />
    </div>
  );
}
