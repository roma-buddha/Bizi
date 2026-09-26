import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../db";
import type { ReviewContent, ReviewStats, ReviewType } from "../models/types";
import { EMPTY_REVIEW } from "../models/types";
import { useQuery, useStore } from "../state/store";
import {
  endOfMonthISO,
  endOfWeekISO,
  formatDate,
  startOfMonthISO,
  startOfWeekISO,
  todayISO,
  toISODate,
} from "../utils/date";
import { SectionTitle } from "../components/ui";

interface Period {
  start: string;
  end: string;
  label: string;
}

function periodFor(type: ReviewType, anchor: Date): Period {
  const iso = toISODate(anchor);
  const year = anchor.getFullYear();
  switch (type) {
    case "weekly": {
      const start = startOfWeekISO(iso);
      const end = endOfWeekISO(iso);
      return { start, end, label: `Week of ${formatDate(start)} – ${formatDate(end)}` };
    }
    case "monthly": {
      const start = startOfMonthISO(year, anchor.getMonth());
      const end = endOfMonthISO(year, anchor.getMonth());
      return { start, end, label: `${formatDate(start)} – ${formatDate(end)}` };
    }
    case "annual":
      return {
        start: `${year}-01-01`,
        end: `${year}-12-31`,
        label: `${year}`,
      };
  }
}

function shiftAnchor(type: ReviewType, anchor: Date, delta: number): Date {
  const d = new Date(anchor);
  if (type === "weekly") d.setDate(d.getDate() + 7 * delta);
  else if (type === "monthly") d.setMonth(d.getMonth() + delta);
  else d.setFullYear(d.getFullYear() + delta);
  return d;
}

const FIELDS: { key: keyof ReviewContent; label: string; placeholder: string }[] = [
  { key: "wentWell", label: "What went well?", placeholder: "Wins, progress, good decisions…" },
  { key: "notWell", label: "What did not go well?", placeholder: "Blockers, misses, distractions…" },
  { key: "focusNext", label: "What should I focus on next?", placeholder: "The one or two things that matter…" },
  { key: "stopDoing", label: "What should I stop doing?", placeholder: "Habits or commitments to drop…" },
  { key: "topPriorities", label: "Top priorities next period", placeholder: "P1 items for the coming period…" },
];

export function ReviewsPage() {
  const { bumpData } = useStore();
  const [type, setType] = useState<ReviewType>("weekly");
  const [anchor, setAnchor] = useState(() => new Date());
  const [content, setContent] = useState<ReviewContent>(EMPTY_REVIEW);
  const [saved, setSaved] = useState(true);

  const period = useMemo(() => periodFor(type, anchor), [type, anchor]);
  const isCurrentPeriod = period.end >= todayISO();

  const { data: stats } = useQuery(
    () => api.review.stats(period.start, period.end),
    [period.start, period.end],
  );

  const { data: existing } = useQuery(() => api.review.get(type, period.start), [type, period.start]);

  useEffect(() => {
    setContent(existing?.content ?? EMPTY_REVIEW);
    setSaved(true);
  }, [existing]);

  const save = async () => {
    await api.review.save(type, period.start, period.end, content);
    setSaved(true);
    bumpData();
  };

  const update = (key: keyof ReviewContent, value: string) => {
    setContent((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  return (
    <div className="page">
      <header className="page-header with-action">
        <div>
          <h1>Reviews</h1>
          <p className="page-subtitle">Reflection turns activity into progress.</p>
        </div>
        <div className="header-actions">
          <div className="chip-group">
            {(["weekly", "monthly", "annual"] as ReviewType[]).map((t) => (
              <button key={t} className={`chip${type === t ? " active" : ""}`} onClick={() => setType(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="chip-group">
            <button className="icon-button" onClick={() => setAnchor((a) => shiftAnchor(type, a, -1))} aria-label="Previous period">
              <ChevronLeft size={16} />
            </button>
            <button className="chip" onClick={() => setAnchor(new Date())}>
              Current
            </button>
            <button className="icon-button" onClick={() => setAnchor((a) => shiftAnchor(type, a, 1))} aria-label="Next period">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </header>

      <h2 className="period-label">
        {period.label}
        {isCurrentPeriod ? <span className="badge">Current</span> : null}
      </h2>

      <div className="stack">
        <StatsBlock stats={stats} />

        <section>
          <SectionTitle>Reflection</SectionTitle>
          {FIELDS.map((field) => (
            <label key={field.key} className="field review-field">
              <span className="field-label">{field.label}</span>
              <textarea
                className="field-input textarea"
                rows={3}
                placeholder={field.placeholder}
                value={content[field.key]}
                onChange={(e) => update(field.key, e.target.value)}
              />
            </label>
          ))}
          <div className="detail-actions">
            <span className={`note-status${saved ? "" : " pending"}`}>
              {saved ? "Saved" : "Unsaved changes"}
            </span>
            <button className="button primary" disabled={saved} onClick={() => void save()}>
              Save review
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatsBlock({ stats }: { stats: ReviewStats | null }) {
  if (!stats) return null;
  const habitRate = stats.habits.total > 0 ? Math.round((stats.habits.completed / stats.habits.total) * 100) : null;
  return (
    <section className="review-stats">
      <div className="stat-line">
        <span className="stat-num">{stats.completedCount}</span> tasks completed
        {stats.completed.length > 0 ? (
          <span className="stat-detail">
            {stats.completed.slice(0, 5).map((t) => t.title).join(" · ")}
            {stats.completed.length > 5 ? " …" : ""}
          </span>
        ) : null}
      </div>
      <div className="stat-line">
        <span className="stat-num">{stats.movedCount}</span> tasks touched
      </div>
      <div className="stat-line">
        <span className="stat-num">{stats.overdue.length}</span> overdue
        {stats.overdue.length > 0 ? (
          <span className="stat-detail">
            {stats.overdue.slice(0, 4).map((t) => `${t.title} (${formatDate(t.dueDate)})`).join(" · ")}
          </span>
        ) : null}
      </div>
      <div className="stat-line">
        <span className="stat-num">{stats.workedProjects.length}</span> projects worked on
        {stats.workedProjects.length > 0 ? (
          <span className="stat-detail">
            {stats.workedProjects.slice(0, 4).map((p) => p.title).join(" · ")}
          </span>
        ) : null}
      </div>
      <div className="stat-line">
        <span className="stat-num">{stats.neglectedProjects.length}</span> active projects untouched
        {stats.neglectedProjects.length > 0 ? (
          <span className="stat-detail">
            {stats.neglectedProjects.slice(0, 4).map((p) => p.title).join(" · ")}
          </span>
        ) : null}
      </div>
      <div className="stat-line">
        <span className="stat-num">{stats.upcomingHard.length}</span> upcoming hard deadlines
        {stats.upcomingHard.length > 0 ? (
          <span className="stat-detail">
            {stats.upcomingHard.slice(0, 4).map((t) => `${t.title} (${formatDate(t.dueDate)})`).join(" · ")}
          </span>
        ) : null}
      </div>
      <div className="stat-line">
        <span className="stat-num">{stats.activeGoals}</span> active goals
      </div>
      <div className="stat-line">
        <span className="stat-num">{habitRate ?? "—"}</span>
        {habitRate != null ? "% habit completion" : "habits (no entries this period)"}
      </div>
    </section>
  );
}

