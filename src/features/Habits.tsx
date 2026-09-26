import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { api } from "../db";
import type { Habit, LifeArea } from "../models/types";
import { useQuery, useStore } from "../state/store";
import { addDaysISO, startOfWeekISO, todayISO, weekdayShort } from "../utils/date";
import { Modal, SectionTitle, SelectField, TextField } from "../components/ui";

const WEEK_COUNT = 12;

export function HabitsPage() {
  const { bumpData } = useStore();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [lifeAreaId, setLifeAreaId] = useState("");
  const [frequencyType, setFrequencyType] = useState<Habit["frequencyType"]>("daily");
  const { data: habits } = useQuery(() => api.habit.list(), []);
  const { data: areas } = useQuery(() => api.area.list(), []);

  const today = todayISO();
  const weekStart = startOfWeekISO(today);
  const gridFrom = addDaysISO(weekStart, -7 * (WEEK_COUNT - 1));

  const { data: entries } = useQuery(() => api.habit.entries(gridFrom, today), [gridFrom, today]);

  const entryMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const e of entries ?? []) map.set(`${e.habitId}|${e.date}`, e.completed);
    return map;
  }, [entries]);

  const weeks = useMemo(() => {
    return Array.from({ length: WEEK_COUNT }, (_, i) => {
      const start = addDaysISO(gridFrom, 7 * i);
      return Array.from({ length: 7 }, (_, d) => addDaysISO(start, d));
    });
  }, [gridFrom]);

  const toggle = async (habitId: string, date: string, completed: boolean) => {
    await api.habit.toggle(habitId, date, completed);
    bumpData();
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await api.habit.create({ name: trimmed, lifeAreaId: lifeAreaId || null, frequencyType });
    setCreating(false);
    setName("");
    bumpData();
  };

  const doneToday = (habit: Habit) => entryMap.get(`${habit.id}|${today}`) ?? false;

  return (
    <div className="page wide">
      <header className="page-header with-action">
        <div>
          <h1>Habits</h1>
          <p className="page-subtitle">Repeated behaviors, tracked quietly.</p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          <Plus size={14} /> New habit
        </button>
      </header>

      <section>
        <SectionTitle>Today</SectionTitle>
        <div className="habit-today">
          {(habits ?? [])
            .filter((h) => h.status === "active")
            .map((h) => (
              <button
                key={h.id}
                className={`habit-today-item${doneToday(h) ? " done" : ""}`}
                onClick={() => void toggle(h.id, today, !doneToday(h))}
              >
                <span className="habit-check">{doneToday(h) ? <Check size={13} /> : null}</span>
                {h.name}
              </button>
            ))}
          {habits?.filter((h) => h.status === "active").length === 0 ? (
            <p className="muted">No active habits. Create one to start tracking.</p>
          ) : null}
        </div>
      </section>

      <section>
        <SectionTitle>This week</SectionTitle>
        <div className="habit-grid-wrap">
          <table className="habit-grid">
            <thead>
              <tr>
                <th className="habit-name-col" />
                {weeks[WEEK_COUNT - 1].map((iso) => (
                  <th key={iso} className="habit-day-col">
                    {weekdayShort(iso)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(habits ?? []).map((h) => (
                <tr key={h.id}>
                  <td className="habit-name-col">
                    <span className="habit-name">{h.name}</span>
                    <span className="habit-freq">{frequencyLabel(h)}</span>
                  </td>
                  {weeks[WEEK_COUNT - 1].map((iso) => {
                    const completed = entryMap.get(`${h.id}|${iso}`) ?? false;
                    return (
                      <td key={iso} className="habit-day-col">
                        <button
                          className={`habit-cell${completed ? " done" : ""}${iso > today ? " future" : ""}`}
                          disabled={iso > today}
                          onClick={() => void toggle(h.id, iso, !completed)}
                          aria-label={`${h.name} on ${iso}`}
                        >
                          {completed ? <Check size={11} /> : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionTitle>History · last {WEEK_COUNT} weeks</SectionTitle>
        <div className="habit-grid-wrap">
          <table className="habit-grid history">
            <thead>
              <tr>
                <th className="habit-name-col" />
                {weeks.map((week) => (
                  <th key={week[0]} className="habit-week-col">
                    {week[0].slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(habits ?? []).map((h) => (
                <tr key={h.id}>
                  <td className="habit-name-col">
                    <span className="habit-name">{h.name}</span>
                  </td>
                  {weeks.map((week) => {
                    const future = week[0] > today;
                    const done = week.filter((iso) => iso <= today && entryMap.get(`${h.id}|${iso}`)).length;
                    const possible = week.filter((iso) => iso <= today).length;
                    return (
                      <td key={week[0]} className="habit-week-col">
                        <span
                          className={`habit-week-cell${future ? " future" : ""}`}
                          title={`${done} of ${possible} days`}
                        >
                          {future ? "·" : done}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {creating ? (
        <Modal title="New habit" onClose={() => setCreating(false)} width={420}>
          <TextField label="Name" value={name} onChange={setName} autoFocus onEnter={() => void create()} />
          <div className="field-grid">
            <SelectField
              label="Life area"
              value={lifeAreaId}
              onChange={setLifeAreaId}
              options={[
                { value: "", label: "None" },
                ...(areas ?? []).map((a: LifeArea) => ({ value: a.id, label: a.name })),
              ]}
            />
            <SelectField
              label="Frequency"
              value={frequencyType}
              onChange={(v) => setFrequencyType(v as Habit["frequencyType"])}
              options={[
                { value: "daily", label: "Daily" },
                { value: "weekdays", label: "Weekdays" },
                { value: "weekly", label: "Weekly" },
                { value: "custom", label: "Custom" },
              ]}
            />
          </div>
          <div className="detail-actions">
            <button className="button ghost" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button className="button primary" disabled={!name.trim()} onClick={() => void create()}>
              Create
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function frequencyLabel(h: Habit): string {
  switch (h.frequencyType) {
    case "daily":
      return "daily";
    case "weekdays":
      return "weekdays";
    case "weekly":
      return h.frequencyRule ? `${h.frequencyRule}x per week` : "weekly";
    default:
      return h.frequencyRule || "custom";
  }
}
