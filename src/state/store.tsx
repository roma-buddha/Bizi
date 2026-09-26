import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ThemeSetting } from "../models/types";

export type Route =
  | { kind: "today" }
  | { kind: "inbox" }
  | { kind: "areas" }
  | { kind: "area"; id: string }
  | { kind: "goals" }
  | { kind: "goal"; id: string }
  | { kind: "projects" }
  | { kind: "project"; id: string }
  | { kind: "todo" }
  | { kind: "calendar" }
  | { kind: "habits" }
  | { kind: "reviews" }
  | { kind: "archive" }
  | { kind: "settings" };

interface Store {
  route: Route;
  navigate: (route: Route) => void;
  theme: ThemeSetting;
  setTheme: (theme: ThemeSetting) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  dataVersion: number;
  bumpData: () => void;
  detailTaskId: string | null;
  openTaskDetail: (id: string) => void;
  closeTaskDetail: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  quickAddOpen: boolean;
  setQuickAddOpen: (open: boolean) => void;
}

const StoreContext = createContext<Store | null>(null);

function loadSetting<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>({ kind: "today" });
  const [theme, setThemeState] = useState<ThemeSetting>(() =>
    loadSetting<ThemeSetting>("bizi.theme", "system"),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("bizi.sidebar") === "1",
  );
  // Same bounds and default as Lotus Notes: 220–480px, default 272px.
  const [sidebarWidth, setSidebarWidthState] = useState(() =>
    Math.min(480, Math.max(220, Number(localStorage.getItem("bizi.sidebar-width")) || 272)),
  );
  const [dataVersion, setDataVersion] = useState(0);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const navigate = useCallback((next: Route) => {
    setRoute(next);
    setDetailTaskId(null);
  }, []);

  const setTheme = useCallback((next: ThemeSetting) => {
    setThemeState(next);
    try {
      localStorage.setItem("bizi.theme", next);
    } catch {
      // storage unavailable
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
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

  const bumpData = useCallback(() => setDataVersion((v) => v + 1), []);

  const value = useMemo<Store>(
    () => ({
      route,
      navigate,
      theme,
      setTheme,
      sidebarCollapsed,
      toggleSidebar,
      sidebarWidth,
      setSidebarWidth,
      dataVersion,
      bumpData,
      detailTaskId,
      openTaskDetail: setDetailTaskId,
      closeTaskDetail: () => setDetailTaskId(null),
      paletteOpen,
      setPaletteOpen,
      quickAddOpen,
      setQuickAddOpen,
    }),
    [
      route,
      navigate,
      theme,
      setTheme,
      sidebarCollapsed,
      toggleSidebar,
      sidebarWidth,
      setSidebarWidth,
      dataVersion,
      bumpData,
      detailTaskId,
      paletteOpen,
      quickAddOpen,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used within StoreProvider");
  return store;
}

/** Load data whenever the version changes or deps change. */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []): {
  data: T | null;
  loading: boolean;
  reload: () => void;
} {
  const { dataVersion } = useStore();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fnRef
      .current()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion, ...deps]);

  const reload = useCallback(() => {
    fnRef
      .current()
      .then(setData)
      .catch((error) => console.error(error));
  }, []);

  return { data, loading, reload };
}
