import { getCurrentWindow } from "@tauri-apps/api/window";
import { Moon, PanelLeft, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { isTauriRuntime } from "../runtime";
import { useStore } from "../state/store";

export function TopBar() {
  const { toggleSidebar, theme, toggleTheme } = useStore();
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

  return (
    <header className="topbar">
      <div className="topbar-drag" data-tauri-drag-region />
      <button className="icon-button" onClick={toggleSidebar} aria-label="Toggle sidebar" title="Toggle sidebar">
        <PanelLeft size={16} />
      </button>
      <span className="app-name">Bizi</span>
      <div className="topbar-spacer" data-tauri-drag-region />
      <button
        className="icon-button"
        onClick={toggleTheme}
        aria-label="Theme"
        title={`Theme: ${theme} (click to switch)`}
      >
        {theme === "light" ? <Sun size={16} /> : <Moon size={16} />}
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
