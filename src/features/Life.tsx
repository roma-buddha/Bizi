import { useEffect, useMemo, useState, type ReactNode } from "react";
import { EmptyState, ProgressBar, Tabs } from "../components/ui";

const SETTINGS_KEY = "bizi.life-settings";
const VIEW_KEY = "bizi.life-view";

const MIN_AGE = 1;
const MAX_AGE = 120;
const DEFAULT_AGE = 80;
const WEEKS_PER_YEAR = 52;
const MONTHS_PER_YEAR = 12;
const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

const MS = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
} as const;

const nf = new Intl.NumberFormat("en-US");
const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

interface LifeSettings {
  /** ISO timestamp of birth, or null until the user sets it. */
  birthISO: string | null;
  /** Age the user aspires to live until. */
  targetAge: number;
}

function loadSettings(): LifeSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LifeSettings>;
      const targetAge = Number(parsed.targetAge);
      return {
        birthISO: typeof parsed.birthISO === "string" ? parsed.birthISO : null,
        targetAge:
          Number.isFinite(targetAge) && targetAge >= MIN_AGE && targetAge <= MAX_AGE
            ? Math.round(targetAge)
            : DEFAULT_AGE,
      };
    }
  } catch {
    // fall through to defaults
  }
  return { birthISO: null, targetAge: DEFAULT_AGE };
}

function saveSettings(settings: LifeSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable
  }
}

/* ------------------------------------------------------------------ */
/* Date math                                                           */
/* ------------------------------------------------------------------ */

function addYears(date: Date, years: number): Date {
  const out = new Date(date);
  out.setFullYear(out.getFullYear() + years);
  return out;
}

function addMonths(date: Date, months: number): Date {
  const out = new Date(date);
  const day = out.getDate();
  out.setMonth(out.getMonth() + months);
  if (out.getDate() < day) out.setDate(0); // clamp overflow (e.g. Jan 31 -> Feb 28)
  return out;
}

/** Whole calendar years from `start` until `end` (age in years). */
function diffYears(end: Date, start: Date): number {
  let years = end.getFullYear() - start.getFullYear();
  if (end < addYears(start, years)) years -= 1;
  return Math.max(0, years);
}

/** Whole calendar months from `start` until `end`. */
function diffMonths(end: Date, start: Date): number {
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end < addMonths(start, months)) months -= 1;
  return Math.max(0, months);
}

/** `new Date(...)` from an ISO string; null when missing/invalid. */
function parseBirth(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* ------------------------------------------------------------------ */
/* Stats table                                                         */
/* ------------------------------------------------------------------ */

interface StatRow {
  unit: string;
  lived: number;
  remaining: number;
  total: number;
}

function buildStatRows(birth: Date, targetAge: number, now: Date): StatRow[] {
  const target = addYears(birth, targetAge);
  const livedMs = Math.max(0, now.getTime() - birth.getTime());
  const totalMs = Math.max(1, target.getTime() - birth.getTime());
  const rows: StatRow[] = [
    { unit: "Years", lived: diffYears(now, birth), total: targetAge, remaining: 0 },
    { unit: "Months", lived: diffMonths(now, birth), total: targetAge * MONTHS_PER_YEAR, remaining: 0 },
  ];
  const bySpan = (unit: string, span: number) => {
    const total = Math.floor(totalMs / span);
    const lived = Math.min(total, Math.floor(livedMs / span));
    rows.push({ unit, lived, total, remaining: Math.max(0, total - lived) });
  };
  bySpan("Weeks", MS.week);
  bySpan("Days", MS.day);
  bySpan("Hours", MS.hour);
  bySpan("Minutes", MS.minute);
  bySpan("Seconds", 1000);
  return rows.map((row) => ({ ...row, remaining: Math.max(0, row.total - row.lived) }));
}

/* ------------------------------------------------------------------ */
/* Calendar grids                                                      */
/* ------------------------------------------------------------------ */

type CellState = "lived" | "current" | "future";

function cellClass(state: CellState): string {
  return `life-cell ${state}`;
}

function WeeksGrid({ birth, targetAge, now }: { birth: Date; targetAge: number; now: Date }) {
  const birthMs = birth.getTime();
  const rows: ReactNode[] = [
    <div key="head" className="life-col-head life-row-head" />,
    ...Array.from({ length: WEEKS_PER_YEAR }, (_, i) => (
      <div key={`h${i}`} className="life-col-head">
        {(i + 1) % 4 === 1 ? i + 1 : ""}
      </div>
    )),
  ];
  for (let age = 0; age < targetAge; age++) {
    rows.push(
      <div key={`l${age}`} className="life-row-label">
        <span>{age}</span>
        <span className="life-row-year">{birth.getFullYear() + age}</span>
      </div>,
    );
    for (let week = 1; week <= WEEKS_PER_YEAR; week++) {
      const index = age * WEEKS_PER_YEAR + (week - 1);
      const start = new Date(birthMs + index * MS.week);
      const end = new Date(start.getTime() + MS.week);
      const state: CellState = start > now ? "future" : now < end ? "current" : "lived";
      rows.push(
        <div
          key={`c${index}`}
          className={cellClass(state)}
          title={`Age ${age}, week ${week} · ${dateFmt.format(start)} – ${dateFmt.format(end)}${
            state === "current" ? " · you are here" : ""
          }`}
        />,
      );
    }
  }
  return (
    <div className="life-grid" style={{ gridTemplateColumns: `minmax(64px, auto) repeat(${WEEKS_PER_YEAR}, minmax(0, 1fr))` }}>
      {rows}
    </div>
  );
}

function YearsGrid({ birth, targetAge, now }: { birth: Date; targetAge: number; now: Date }) {
  const rows: ReactNode[] = [
    <div key="head" className="life-col-head life-row-head" />,
    ...MONTH_LETTERS.map((letter, i) => (
      <div key={`h${i}`} className="life-col-head">
        {letter}
      </div>
    )),
  ];
  for (let age = 0; age < targetAge; age++) {
    rows.push(
      <div key={`l${age}`} className="life-row-label">
        <span>{age}</span>
        <span className="life-row-year">{birth.getFullYear() + age}</span>
      </div>,
    );
    for (let month = 0; month < MONTHS_PER_YEAR; month++) {
      const start = addMonths(birth, age * MONTHS_PER_YEAR + month);
      const end = addMonths(birth, age * MONTHS_PER_YEAR + month + 1);
      const state: CellState = start > now ? "future" : now < end ? "current" : "lived";
      rows.push(
        <div
          key={`c${age}-${month}`}
          className={cellClass(state)}
          title={`Age ${age}, ${dateFmt.format(start).split(" ")[0]} ${start.getFullYear()} · ${dateFmt.format(start)} – ${dateFmt.format(
            new Date(end.getTime() - 1),
          )}${state === "current" ? " · you are here" : ""}`}
        />,
      );
    }
  }
  return (
    <div
      className="life-grid"
      style={{ gridTemplateColumns: `minmax(64px, auto) repeat(${MONTHS_PER_YEAR}, minmax(0, 1fr))` }}
    >
      {rows}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function LifePage() {
  const [settings, setSettings] = useState<LifeSettings>(loadSettings);
  const [view, setView] = useState<string>(() =>
    localStorage.getItem(VIEW_KEY) === "years" ? "years" : "weeks",
  );
  // Ticks every second so hours/minutes/seconds in the table stay live;
  // the calendar grids only depend on the day, so they re-render once a day.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const gridNow = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now]);

  const birth = parseBirth(settings.birthISO);
  const birthInvalid = settings.birthISO !== null && birth === null;
  const birthFuture = birth !== null && birth.getTime() > now.getTime();

  const update = (patch: Partial<LifeSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  };

  const stats = useMemo(
    () => (birth && !birthFuture ? buildStatRows(birth, settings.targetAge, now) : []),
    [birth, birthFuture, settings.targetAge, now],
  );

  const summary = useMemo(() => {
    if (!birth || birthFuture) return null;
    const target = addYears(birth, settings.targetAge);
    const livedMs = now.getTime() - birth.getTime();
    const totalMs = target.getTime() - birth.getTime();
    const pct = Math.min(100, Math.max(0, (livedMs / totalMs) * 100));
    return {
      ageYears: diffYears(now, birth),
      pct,
      endYear: target.getFullYear(),
      outlived: livedMs > totalMs,
    };
  }, [birth, birthFuture, settings.targetAge, now]);

  const switchView = (id: string) => {
    setView(id);
    try {
      localStorage.setItem(VIEW_KEY, id);
    } catch {
      // storage unavailable
    }
  };

  // Value for <input type="datetime-local">: local "YYYY-MM-DDTHH:MM".
  const birthLocal = settings.birthISO ? settings.birthISO.slice(0, 16) : "";

  return (
    <div className="page wide life-page">
      <header className="page-header">
        <div>
          <h1>Life</h1>
          <p className="page-subtitle">Your time, counted — lived versus left.</p>
        </div>
      </header>

      <section className="life-card life-settings">
        <div className="field-grid">
          <label className="field">
            <span className="field-label">Date and time of birth</span>
            <input
              className="field-input"
              type="datetime-local"
              value={birthLocal}
              onChange={(e) => update({ birthISO: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </label>
          <label className="field">
            <span className="field-label">Aspiration — live until age</span>
            <input
              className="field-input"
              type="number"
              min={MIN_AGE}
              max={MAX_AGE}
              value={settings.targetAge}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value)) {
                  update({ targetAge: Math.min(MAX_AGE, Math.max(MIN_AGE, Math.round(value))) });
                }
              }}
            />
          </label>
        </div>
        <p className="muted small">
          Saved automatically on this device — set once, kept forever.
          {birthInvalid ? " That birth date could not be read." : ""}
          {birthFuture ? " Birth date is in the future." : ""}
        </p>
      </section>

      {!birth || birthFuture ? (
        <EmptyState
          title="Set your birth date and time"
          hint="Once entered above, Bizi will draw your life calendar and count your hours, days, weeks, months and years — lived and remaining."
        />
      ) : (
        <>
          {summary ? (
            <section className="life-card life-summary">
              <div className="life-stat">
                <span className="life-stat-value">{summary.ageYears}</span>
                <span className="life-stat-label">years old</span>
              </div>
              <div className="life-stat grow">
                <span className="life-stat-label">
                  {summary.outlived
                    ? `You have outlived the plan — every day is overtime. Planned until ${summary.endYear}.`
                    : `${summary.pct.toFixed(1)}% through a life planned until ${summary.endYear}`}
                </span>
                <ProgressBar value={summary.pct} />
              </div>
              <div className="life-stat">
                <span className="life-stat-value">{(100 - summary.pct).toFixed(1)}%</span>
                <span className="life-stat-label">planned time left</span>
              </div>
            </section>
          ) : null}

          <section className="life-card">
            <div className="section-head">
              <h4 className="section-title">Lived vs. remaining</h4>
            </div>
            <table className="life-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Lived</th>
                  <th>Remaining</th>
                  <th>Total</th>
                  <th>Lived %</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((row) => (
                  <tr key={row.unit}>
                    <td>{row.unit}</td>
                    <td>{nf.format(row.lived)}</td>
                    <td>{nf.format(row.remaining)}</td>
                    <td>{nf.format(row.total)}</td>
                    <td>{row.total > 0 ? ((row.lived / row.total) * 100).toFixed(1) : "0.0"}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="life-card">
            <div className="section-head">
              <h4 className="section-title">Life calendar</h4>
              <Tabs
                tabs={[
                  { id: "weeks", label: "In weeks" },
                  { id: "years", label: "In years" },
                ]}
                active={view}
                onChange={switchView}
              />
            </div>
            <p className="muted small">
              {view === "weeks"
                ? `Each row is one year of your life (${WEEKS_PER_YEAR} weeks across).`
                : `Each row is one year of your life (${MONTHS_PER_YEAR} months across).`}{" "}
              Hover any box for its dates.
            </p>
            <div className="life-grid-wrap">
              {view === "weeks" ? (
                <WeeksGrid birth={birth} targetAge={settings.targetAge} now={gridNow} />
              ) : (
                <YearsGrid birth={birth} targetAge={settings.targetAge} now={gridNow} />
              )}
            </div>
            <div className="life-legend">
              <span className="life-legend-item">
                <span className="life-cell lived" /> Lived
              </span>
              <span className="life-legend-item">
                <span className="life-cell current" /> Now
              </span>
              <span className="life-legend-item">
                <span className="life-cell future" /> Left
              </span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
