import { useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { useStore } from "./state/store";

export default function App() {
  const { sidebarWidth } = useStore();

  useEffect(() => {
    document.title = "Bizi";
  }, []);

  return (
    <div className="app" style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}>
      <TopBar />
      <div className="app-body">
        <Sidebar />
        <main className="main" />
      </div>
    </div>
  );
}
