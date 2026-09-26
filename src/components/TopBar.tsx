import { getCurrentWindow } from "@tauri-apps/api/window";
import { Moon, PanelLeft, Plus, Search, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { isTauriRuntime } from "../db";

export function TopBar() {
  const { toggleSidebar, theme, setTheme, setPaletteOpen, setQuickAddOpen } = useStore();
  const [maximized, setMaximized] = useState(false);
  const tauri = isTauriRuntime();

  useEffect(() => {
    if (!tauri) return;
    const win = getCurrentWindow();
    win.isMaximized().then(setMaximized).catch(() => undefined);
    const un = win.onResized(() => {
      win.isMaximized().then(setMaximized).catch(() => undefined);
    });
    return () => {
      un.then((f) => f()).catch(() => undefined);
    };
  }, [tauri]);

  const cycleTheme = () => {
    setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");
  };

  return (
    <header className="topbar">
      <div className="topbar-drag" data-tauri-drag-region />
      <button className="icon-button" onClick={toggleSidebar} aria-label="Toggle sidebar" title="Toggle sidebar">
        <PanelLeft size={16} />
      </button>
      <span className="app-name">Bizi</span>
      <div className="topbar-spacer" data-tauri-drag-region />
      <button
        className="search-trigger"
        onClick={() => setPaletteOpen(true)}
        title="Search and commands (Ctrl+K)"
      >
        <Search size={14} />
        <span>Search</span>
        <kbd>Ctrl K</kbd>
      </button>
      <button className="icon-button" onClick={cycleTheme} aria-label="Theme" title={`Theme: ${theme}`}>
        {theme === "light" ? <Sun size={16} /> : theme === "dark" ? <Moon size={16} /> : <Sun size={16} className="dimmed" />}
      </button>
      <button
        className="icon-button accent"
        onClick={() => setQuickAddOpen(true)}
        aria-label="Quick add task"
        title="Quick add task (Ctrl+N)"
      >
        <Plus size={17} />
      </button>
      {tauri ? (
        <div className="window-controls">
          <button
            className="win-button"
            aria-label="Minimize"
            onClick={() => getCurrentWindow().minimize().catch(() => undefined)}
          >
            –
          </button>
          <button
            className="win-button"
            aria-label={maximized ? "Restore" : "Maximize"}
            onClick={() => getCurrentWindow().toggleMaximize().catch(() => undefined)}
          >
            {maximized ? "❐" : "□"}
          </button>
          <button
            className="win-button close"
            aria-label="Close"
            onClick={() => getCurrentWindow().close().catch(() => undefined)}
          >
            ×
          </button>
        </div>
      ) : null}
    </header>
  );
}
