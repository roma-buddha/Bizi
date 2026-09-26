import { api, isTauriRuntime } from "../db";
import type { ThemeSetting } from "../models/types";
import { useQuery, useStore } from "../state/store";
import { SectionTitle } from "../components/ui";

export function SettingsPage() {
  const { theme, setTheme } = useStore();
  const { data: dataDir } = useQuery(() => api.app.dataDir(), []);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <p className="page-subtitle">Quiet defaults, local data.</p>
      </header>

      <div className="stack">
        <section>
          <SectionTitle>Appearance</SectionTitle>
          <div className="chip-group" role="radiogroup" aria-label="Theme">
            {(["light", "dark", "system"] as ThemeSetting[]).map((t) => (
              <button
                key={t}
                role="radio"
                aria-checked={theme === t}
                className={`chip${theme === t ? " active" : ""}`}
                onClick={() => setTheme(t)}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <p className="muted small">Warm cream in light, charcoal in dark. System follows Windows.</p>
        </section>

        <section>
          <SectionTitle>Data</SectionTitle>
          <p className="muted">
            Bizi stores everything locally{isTauriRuntime() ? " in a SQLite database" : " in this browser's localStorage (preview mode)"}.
            No account, no cloud, no telemetry.
          </p>
          <p className="data-dir">{dataDir}</p>
        </section>

        <section>
          <SectionTitle>Shortcuts</SectionTitle>
          <table className="shortcut-table">
            <tbody>
              <tr>
                <td>
                  <kbd>Ctrl K</kbd>
                </td>
                <td>Search and commands</td>
              </tr>
              <tr>
                <td>
                  <kbd>Ctrl N</kbd>
                </td>
                <td>Quick add task</td>
              </tr>
              <tr>
                <td>
                  <kbd>Esc</kbd>
                </td>
                <td>Close dialogs and panels</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <SectionTitle>About</SectionTitle>
          <p className="muted">
            Bizi 0.1 — a calm personal life organizer. One task object, many views: Today, Inbox, Areas,
            Goals, Projects, To-Do, Calendar, Habits and Reviews all read the same local data.
          </p>
        </section>
      </div>
    </div>
  );
}
