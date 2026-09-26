import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeSetting = "light" | "dark";

interface Store {
  theme: ThemeSetting;
  setTheme: (theme: ThemeSetting) => void;
  toggleTheme: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
}

const StoreContext = createContext<Store | null>(null);

function loadTheme(): ThemeSetting {
  try {
    const saved = localStorage.getItem("bizi.theme");
    return saved === "dark" || saved === "light" ? saved : "light";
  } catch {
    return "light";
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeSetting>(loadTheme);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("bizi.sidebar") === "1",
  );
  // Same bounds and default as Lotus Notes: 220-480px, default 272px.
  const [sidebarWidth, setSidebarWidthState] = useState(() =>
    Math.min(480, Math.max(220, Number(localStorage.getItem("bizi.sidebar-width")) || 272)),
  );

  const setTheme = useCallback((next: ThemeSetting) => {
    setThemeState(next);
    try {
      localStorage.setItem("bizi.theme", next);
    } catch {
      // storage unavailable
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeSetting = prev === "light" ? "dark" : "light";
      try {
        localStorage.setItem("bizi.theme", next);
      } catch {
        // storage unavailable
      }
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      try {
        localStorage.setItem("bizi.sidebar", prev ? "0" : "1");
      } catch {
        // storage unavailable
      }
      return !prev;
    });
  }, []);

  const setSidebarWidth = useCallback((width: number) => {
    const clamped = Math.min(480, Math.max(220, Math.round(width)));
    setSidebarWidthState(clamped);
    try {
      localStorage.setItem("bizi.sidebar-width", String(clamped));
    } catch {
      // storage unavailable
    }
  }, []);

  const value = useMemo<Store>(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      sidebarCollapsed,
      toggleSidebar,
      sidebarWidth,
      setSidebarWidth,
    }),
    [theme, setTheme, toggleTheme, sidebarCollapsed, toggleSidebar, sidebarWidth, setSidebarWidth],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}
