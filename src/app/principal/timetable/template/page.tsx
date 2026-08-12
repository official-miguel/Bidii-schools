"use client";

/**
 * /principal/timetable/template — Timetable Template Setup
 *
 * Mon–Fri share a single default template. When Saturday or Sunday are
 * added as operating days they each get their own independent column list
 * displayed in a separate section below the weekday template.
 */

import { useEffect, useState, useCallback } from "react";
import {
  Plus, Trash2, Save, GripVertical, AlertTriangle,
  CheckCircle2, Info, Clock, RefreshCw, CalendarDays,
} from "lucide-react";
import ContextNavigation from "@/components/ContextNavigation";
import {
  PageHeader, ErrorBanner,
  inputClass, primaryButtonClass,
  FormField,
} from "@/components/ui";import { TIMETABLE_NAV } from "@/lib/timetable/navItems";

// ── Constants ─────────────────────────────────────────────────────────────

const SLOT_TYPES = [
  { value: "LESSON",   label: "Lesson"   },
  { value: "BREAK",    label: "Break"    },
  { value: "LUNCH",    label: "Lunch"    },
  { value: "GAMES",    label: "Games"    },
  { value: "ASSEMBLY", label: "Assembly" },
] as const;

const SESSIONS = [
  { value: "MORNING",   label: "Morning"   },
  { value: "AFTERNOON", label: "Afternoon" },
  { value: "EVENING",   label: "Evening"   },
] as const;

const SLOT_TYPE_COLORS: Record<string, string> = {
  LESSON:   "bg-teal/10 text-teal border-teal/20",
  BREAK:    "bg-orange-50 text-orange-700 border-orange-200",
  LUNCH:    "bg-green-50 text-green-700 border-green-200",
  GAMES:    "bg-pink-50 text-pink-700 border-pink-200",
  ASSEMBLY: "bg-slate-100 text-slate-600 border-slate-200",
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Types ─────────────────────────────────────────────────────────────────

type Column = {
  position: number;
  startTime: string;
  endTime: string;
  slotType: string;
  session: string;
  label: string | null;
};

type ConfigData = {
  academicYear: string | null;
  term: number | null;
  operatingDays: number[];
  maxLessonsPerTeacherPerDay: number;
  columns: Column[];
};

type Summary = {
  totalSlots: number;
  lessonSlots: number;
  breakSlots: number;
  lunchSlots: number;
  gamesSlots: number;
  assemblySlots: number;
  morningLessons: number;
  afternoonLessons: number;
  eveningLessons: number;
  totalDurationMinutes: number;
  averagePeriodMinutes: number;
};

// Per-day column overrides (sat=5, sun=6)
type DayOverrides = Record<number, Column[]>;

// ── Helpers ───────────────────────────────────────────────────────────────

const DEFAULT_LESSON_TIMES = [
  { start: "08:00", end: "08:40" },
  { start: "08:40", end: "09:20" },
  { start: "09:20", end: "10:00" },
  { start: "10:00", end: "10:20" },
  { start: "10:20", end: "11:00" },
  { start: "11:00", end: "11:40" },
  { start: "11:40", end: "12:20" },
  { start: "12:20", end: "13:00" },
  { start: "13:00", end: "13:40" },
  { start: "13:40", end: "14:20" },
  { start: "14:20", end: "15:00" },
];

function guessSession(startTime: string): string {
  const [h] = startTime.split(":").map(Number);
  if (h < 12) return "MORNING";
  if (h < 17) return "AFTERNOON";
  return "EVENING";
}

function buildDefaultColumns(): Column[] {
  return DEFAULT_LESSON_TIMES.map((t, i) => {
    const isBreak = i === 3;
    const isLunch = i === 7;
    const slotType = isBreak ? "BREAK" : isLunch ? "LUNCH" : "LESSON";
    return {
      position: i + 1, startTime: t.start, endTime: t.end,
      slotType, session: guessSession(t.start),
      label: isBreak ? "Morning Break" : isLunch ? "Lunch" : null,
    };
  });
}

function addCol(cols: Column[], type = "LESSON"): Column[] {
  const last = cols[cols.length - 1];
  const lastEnd = last?.endTime ?? "08:00";
  const [h, m] = lastEnd.split(":").map(Number);
  const duration = type === "LESSON" ? 40 : type === "BREAK" ? 20 : 45;
  const endMin = h * 60 + m + duration;
  const newEnd = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
  const col: Column = {
    position: cols.length + 1, startTime: lastEnd, endTime: newEnd,
    slotType: type, session: guessSession(lastEnd),
    label: type !== "LESSON" ? type.charAt(0) + type.slice(1).toLowerCase() : null,
  };
  return [...cols, col];
}

function reindex(cols: Column[]): Column[] {
  return cols.map((c, i) => ({ ...c, position: i + 1 }));
}

// ── Main component ────────────────────────────────────────────────────────

export default function TemplatePage() {
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [config,   setConfig]   = useState<ConfigData | null>(null);
  const [columns,  setColumns]  = useState<Column[]>([]);       // weekday default
  const [dayOverrides, setDayOverrides] = useState<DayOverrides>({});  // sat(5)/sun(6)
  const [summary,  setSummary]  = useState<Summary | null>(null);

  // drag-index tracked per section: "main" | 5 | 6
  const [dragIdx,    setDragIdx]    = useState<{ section: "main"|number; idx: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/timetable/template");
      if (!res.ok) throw new Error("Failed to load template");
      const data = await res.json();
      const cfg: ConfigData = data.config;
      setConfig(cfg);
      // Separate stored columns into weekday default vs weekend overrides
      // Convention: columns tagged with dayOfWeek 5 or 6 are weekend-specific.
      // Since the current API stores only one flat column list we use a client-side
      // split stored in localStorage for persistence between page loads.
      const stored = (() => {
        try { return JSON.parse(localStorage.getItem("tt_day_overrides") ?? "null"); } catch { return null; }
      })();
      setDayOverrides(stored ?? {});
      setColumns(cfg.columns ?? []);
      setSummary(data.summary ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Persist day overrides to localStorage whenever they change
  useEffect(() => {
    try { localStorage.setItem("tt_day_overrides", JSON.stringify(dayOverrides)); } catch {}
  }, [dayOverrides]);

  // ── Column helpers (weekday default) ──────────────────────────────────

  function removeColumn(idx: number) {
    setColumns((prev) => reindex(prev.filter((_, i) => i !== idx)));
  }

  function updateColumn(idx: number, patch: Partial<Column>) {
    setColumns((prev) => prev.map((col, i) => {
      if (i !== idx) return col;
      const updated = { ...col, ...patch };
      if (patch.startTime && updated.slotType === "LESSON") updated.session = guessSession(patch.startTime);
      return updated;
    }));
  }

  function moveColumn(from: number, to: number) {
    if (from === to) return;
    setColumns((prev) => {
      const arr = [...prev];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return reindex(arr);
    });
  }

  // ── Day-override helpers (sat/sun) ────────────────────────────────────

  function getDayCols(day: number): Column[] {
    return dayOverrides[day] ?? [];
  }

  function setDayCols(day: number, cols: Column[]) {
    setDayOverrides((prev) => ({ ...prev, [day]: reindex(cols) }));
  }

  function initDayOverride(day: number) {
    // Clone the weekday default as starting point
    setDayCols(day, columns.length > 0 ? reindex([...columns]) : buildDefaultColumns());
  }

  function removeDayOverride(day: number) {
    setDayOverrides((prev) => {
      const next = { ...prev };
      delete next[day];
      return next;
    });
  }

  function updateDayCol(day: number, idx: number, patch: Partial<Column>) {
    const cols = getDayCols(day);
    setDayCols(day, cols.map((col, i) => {
      if (i !== idx) return col;
      const updated = { ...col, ...patch };
      if (patch.startTime && updated.slotType === "LESSON") updated.session = guessSession(patch.startTime);
      return updated;
    }));
  }

  function removeDayCol(day: number, idx: number) {
    setDayCols(day, reindex(getDayCols(day).filter((_, i) => i !== idx)));
  }

  function moveDayCol(day: number, from: number, to: number) {
    if (from === to) return;
    const arr = [...getDayCols(day)];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    setDayCols(day, reindex(arr));
  }

  // ── Save ─────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!config) return;
    setSaving(true); setError(null); setSuccess(false); setWarnings([]);
    try {
      const res = await fetch("/api/timetable/template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academicYear: config.academicYear,
          term: config.term,
          operatingDays: config.operatingDays,
          maxLessonsPerTeacherPerDay: config.maxLessonsPerTeacherPerDay,
          columns,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg = data.validationErrors?.map((e: any) => e.message).join("; ") ?? data.error;
        setError(msg ?? "Failed to save template");
        return;
      }
      setSuccess(true);
      setWarnings(data.warnings ?? []);
      setSummary(data.summary ?? null);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const lessonCount = columns.filter((c) => c.slotType === "LESSON").length;
  const weekendDays = (config?.operatingDays ?? []).filter((d) => d === 5 || d === 6);
  const hasWeekend  = weekendDays.length > 0;

  // ── Loading skeleton ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <ContextNavigation items={TIMETABLE_NAV} />
        <PageHeader title="Timetable" description="Configure the school day template." />
        <div className="mt-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 bg-white border border-line rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div>
      <ContextNavigation items={TIMETABLE_NAV} />
      <PageHeader
        title="Timetable"
        description="Set up the school day format. Mon–Fri share a default template. Saturday and Sunday each have their own separate template."
      />

      <div className="space-y-5">
        {error   && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        {success && (
          <div className="rounded-xl border border-success/20 bg-success-bg p-4 text-sm text-success font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Template saved.
          </div>
        )}
        {warnings.length > 0 && (
          <div className="rounded-xl border border-warn/20 bg-warn-bg p-4 space-y-1">
            {warnings.map((w, i) => (
              <p key={i} className="text-sm text-warn flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{w}
              </p>
            ))}
          </div>
        )}

        {/* ── Config bar ──────────────────────────────────────────────── */}
        {config && (
          <div className="bg-white border border-line rounded-xl p-5">
            <h2 className="text-sm font-semibold text-ink mb-4">Configuration</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <FormField label="Academic year">
                <input className={inputClass} placeholder="e.g. 2026"
                  value={config.academicYear ?? ""}
                  onChange={(e) => setConfig({ ...config, academicYear: e.target.value || null })} />
              </FormField>
              <FormField label="Term">
                <select className={inputClass} value={config.term ?? ""}
                  onChange={(e) => setConfig({ ...config, term: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Any</option>
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                  <option value="3">Term 3</option>
                </select>
              </FormField>
              <FormField label="Max teacher lessons/day">
                <input type="number" min={1} max={20} className={inputClass}
                  value={config.maxLessonsPerTeacherPerDay}
                  onChange={(e) => setConfig({ ...config, maxLessonsPerTeacherPerDay: Number(e.target.value) })} />
              </FormField>
              <FormField label="Operating days">
                <div className="flex flex-wrap gap-1 mt-1">
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                    const active = config.operatingDays.includes(d);
                    const isWeekend = d === 5 || d === 6;
                    return (
                      <button key={d} type="button"
                        onClick={() => {
                          const updated = active
                            ? config.operatingDays.filter((x) => x !== d)
                            : [...config.operatingDays, d].sort();
                          setConfig({ ...config, operatingDays: updated });
                          // Remove override when day is deactivated
                          if (active && isWeekend) removeDayOverride(d);
                        }}
                        className={`px-2 py-1 rounded text-xs font-medium border transition-colors
                          ${active
                            ? isWeekend ? "bg-purple-600 text-white border-purple-600"
                                        : "bg-teal text-white border-teal"
                            : "bg-white text-slate border-line hover:border-teal/40"
                          }`}>
                        {DAY_NAMES[d]}
                      </button>
                    );
                  })}
                </div>
                {hasWeekend && (
                  <p className="text-[10px] text-purple-600 mt-1.5 font-medium">
                    Weekend days have their own template sections below.
                  </p>
                )}
              </FormField>
            </div>
          </div>
        )}

        {/* ── Summary pills ──────────────────────────────────────────── */}
        {summary && (
          <div className="flex flex-wrap gap-2">
            <Pill label="Lesson slots" value={summary.lessonSlots} color="teal" />
            <Pill label="Morning" value={summary.morningLessons} color="amber" />
            <Pill label="Afternoon" value={summary.afternoonLessons} color="blue" />
            {summary.eveningLessons > 0 && <Pill label="Evening" value={summary.eveningLessons} color="purple" />}
            {summary.breakSlots > 0 && <Pill label="Breaks" value={summary.breakSlots} color="orange" />}
            {summary.lunchSlots > 0 && <Pill label="Lunch" value={summary.lunchSlots} color="green" />}
            {summary.gamesSlots > 0 && <Pill label="Games" value={summary.gamesSlots} color="pink" />}
            {summary.assemblySlots > 0 && <Pill label="Assembly" value={summary.assemblySlots} color="slate" />}
            {summary.averagePeriodMinutes > 0 && <Pill label="Avg period" value={`${summary.averagePeriodMinutes} min`} color="slate" />}
          </div>
        )}

        {/* ── Mon–Fri default template ──────────────────────────────── */}
        <TemplateSection
          title="Mon – Fri (default)"
          subtitle={`${lessonCount} lesson slot${lessonCount !== 1 ? "s" : ""} per day · drag to reorder`}
          accent="teal"
          columns={columns}
          dragIdx={dragIdx?.section === "main" ? dragIdx.idx : null}
          onDragStart={(idx) => setDragIdx({ section: "main", idx })}
          onDrop={(to) => { if (dragIdx?.section === "main") moveColumn(dragIdx.idx, to); setDragIdx(null); }}
          onUpdate={updateColumn}
          onRemove={removeColumn}
          onAdd={(type) => setColumns((prev) => addCol(prev, type))}
          onLoadDefault={() => setColumns(buildDefaultColumns())}
        />

        {/* ── Weekend-specific templates ────────────────────────────── */}
        {hasWeekend && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-purple-600" />
              <h2 className="text-sm font-semibold text-ink">Weekend Day Templates</h2>
              <span className="text-xs text-slate bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full text-purple-700">
                Separate from Mon–Fri
              </span>
            </div>

            {weekendDays.sort().map((day) => {
              const dayCols = getDayCols(day);
              const hasOverride = dayCols.length > 0;
              return (
                <div key={day} className="bg-white border border-purple-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-purple-100 bg-purple-50/50">
                    <div>
                      <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center font-bold shrink-0">
                          {DAY_NAMES[day]}
                        </span>
                        {day === 5 ? "Saturday" : "Sunday"} Template
                      </h3>
                      {hasOverride && (
                        <p className="text-xs text-slate mt-0.5">
                          {dayCols.filter((c) => c.slotType === "LESSON").length} lesson slot{dayCols.filter((c) => c.slotType === "LESSON").length !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                    {hasOverride ? (
                      <button type="button" onClick={() => removeDayOverride(day)}
                        className="flex items-center gap-1.5 text-xs text-danger hover:text-danger/80 font-medium transition-colors px-3 py-1.5 rounded-lg border border-danger/20 hover:border-danger/40">
                        <Trash2 className="h-3.5 w-3.5" /> Remove {day === 5 ? "Saturday" : "Sunday"} template
                      </button>
                    ) : (
                      <button type="button" onClick={() => initDayOverride(day)}
                        className="flex items-center gap-1.5 text-xs text-purple-700 font-medium transition-colors px-3 py-1.5 rounded-lg border border-purple-300 bg-purple-50 hover:bg-purple-100">
                        <Plus className="h-3.5 w-3.5" /> Set up {day === 5 ? "Saturday" : "Sunday"} template
                      </button>
                    )}
                  </div>

                  {!hasOverride && (
                    <div className="px-5 py-8 text-center text-slate">
                      <Clock className="h-7 w-7 text-slate/30 mx-auto mb-2" />
                      <p className="text-sm">No template defined for {day === 5 ? "Saturday" : "Sunday"} yet.</p>
                      <p className="text-xs text-slate/60 mt-1">Click &quot;Set up&quot; above to create a separate schedule for this day.</p>
                    </div>
                  )}

                  {hasOverride && (
                    <TemplateSection
                      title=""
                      subtitle=""
                      accent="purple"
                      columns={dayCols}
                      dragIdx={dragIdx?.section === day ? dragIdx.idx : null}
                      onDragStart={(idx) => setDragIdx({ section: day, idx })}
                      onDrop={(to) => { if (dragIdx?.section === day) moveDayCol(day, dragIdx.idx, to); setDragIdx(null); }}
                      onUpdate={(idx, patch) => updateDayCol(day, idx, patch)}
                      onRemove={(idx) => removeDayCol(day, idx)}
                      onAdd={(type) => setDayCols(day, addCol(getDayCols(day), type))}
                      onLoadDefault={() => initDayOverride(day)}
                      hideHeader
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Info note ──────────────────────────────────────────────── */}
        <div className="rounded-xl border border-line bg-paper p-4 flex gap-3">
          <Info className="h-4 w-4 text-slate shrink-0 mt-0.5" />
          <div className="text-xs text-slate leading-relaxed space-y-1">
            <p>
              <strong className="text-ink">LESSON</strong> columns are the only slots where subjects can be scheduled.
              The engine fills every LESSON slot automatically.
            </p>
            <p>
              <strong className="text-ink">BREAK / LUNCH / GAMES / ASSEMBLY</strong> are non-teaching periods —
              the engine skips them.
            </p>
            <p>
              <strong className="text-ink">Session</strong> (Morning/Afternoon/Evening) lets you set scheduling
              preferences — e.g. &quot;Mathematics must be in the morning&quot;.
            </p>
            <p>
              <strong className="text-ink">Weekend templates</strong> appear when Saturday or Sunday are enabled as
              operating days. Each gets a fully independent slot layout.
            </p>
          </div>
        </div>

        {/* ── Save ───────────────────────────────────────────────────── */}
        <div className="flex justify-end">
          <button type="button" onClick={handleSave}
            disabled={saving || columns.length === 0} className={primaryButtonClass}>
            {saving
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> Saving…</>
              : <><Save className="h-4 w-4" /> Save template</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TemplateSection ───────────────────────────────────────────────────────

function TemplateSection({
  title, subtitle, accent = "teal", columns, dragIdx,
  onDragStart, onDrop, onUpdate, onRemove, onAdd, onLoadDefault, hideHeader = false,
}: {
  title: string; subtitle: string; accent?: string;
  columns: Column[];
  dragIdx: number | null;
  onDragStart: (idx: number) => void;
  onDrop: (toIdx: number) => void;
  onUpdate: (idx: number, patch: Partial<Column>) => void;
  onRemove: (idx: number) => void;
  onAdd: (type: string) => void;
  onLoadDefault: () => void;
  hideHeader?: boolean;
}) {
  const accentBtn = accent === "purple"
    ? "border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100"
    : "border-line text-slate hover:text-ink hover:border-teal/40";

  return (
    <div className={`${hideHeader ? "" : "bg-white border border-line rounded-xl overflow-hidden"}`}>
      {!hideHeader && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div>
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            <p className="text-xs text-slate mt-0.5">{subtitle}</p>
          </div>
          <button type="button" onClick={onLoadDefault}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${accentBtn}`}>
            <RefreshCw className="h-3.5 w-3.5" /> Load default
          </button>
        </div>
      )}

      {columns.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <Clock className="h-8 w-8 text-slate/40 mx-auto mb-3" />
          <p className="text-sm text-slate">No columns defined yet.</p>
          <button type="button" onClick={onLoadDefault} className={primaryButtonClass}>
            <Plus className="h-4 w-4" /> Load default template
          </button>
        </div>
      ) : (
        <>
          {/* Header row — desktop only */}
          <div className="hidden lg:grid grid-cols-[28px_44px_1fr_1fr_1fr_1fr_1fr_36px] gap-2 px-4 py-2 border-b border-line bg-paper">
            <span /><span className="text-[10px] font-semibold uppercase tracking-wide text-slate">#</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate">Start</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate">End</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate">Type</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate">Session</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate">Label</span>
            <span />
          </div>
          <div className="divide-y divide-line">
            {columns.map((col, idx) => (
              <div key={idx} draggable
                onDragStart={() => onDragStart(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(idx)}
                className={`transition-colors px-4 py-3 ${col.slotType !== "LESSON" ? "bg-paper/60" : ""} ${dragIdx === idx ? "opacity-40" : ""}`}>

                {/* ── Desktop row (lg+) ── */}
                <div className="hidden lg:grid grid-cols-[28px_44px_1fr_1fr_1fr_1fr_1fr_36px] gap-2 items-center">
                  <span className="cursor-grab text-slate/40 hover:text-slate"><GripVertical className="h-4 w-4" /></span>
                  <span className="text-xs font-semibold text-slate">{col.position}</span>
                  <input type="time" value={col.startTime}
                    onChange={(e) => onUpdate(idx, { startTime: e.target.value })}
                    className={`${inputClass} text-xs py-1.5`} />
                  <input type="time" value={col.endTime}
                    onChange={(e) => onUpdate(idx, { endTime: e.target.value })}
                    className={`${inputClass} text-xs py-1.5`} />
                  <select value={col.slotType} onChange={(e) => onUpdate(idx, { slotType: e.target.value })}
                    className={`${inputClass} text-xs py-1.5`}>
                    {SLOT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <select value={col.session} disabled={col.slotType !== "LESSON"}
                    onChange={(e) => onUpdate(idx, { session: e.target.value })}
                    className={`${inputClass} text-xs py-1.5 disabled:opacity-40 disabled:bg-paper`}>
                    {SESSIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <input placeholder={col.slotType === "LESSON" ? "Optional" : "Required"}
                    value={col.label ?? ""}
                    onChange={(e) => onUpdate(idx, { label: e.target.value || null })}
                    className={`${inputClass} text-xs py-1.5`} />
                  <button type="button" onClick={() => onRemove(idx)}
                    className="p-1 rounded text-slate hover:text-danger transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* ── Mobile card (< lg) ── */}
                <div className="lg:hidden space-y-2">
                  {/* Top bar: drag handle + position badge + type pill + delete */}
                  <div className="flex items-center gap-2">
                    <span className="cursor-grab text-slate/40 touch-manipulation">
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0
                      ${SLOT_TYPE_COLORS[col.slotType] ?? "bg-slate-100 text-slate border-slate-200"}`}>
                      #{col.position} · {col.slotType}
                    </span>
                    <div className="flex-1" />
                    <button type="button" onClick={() => onRemove(idx)}
                      className="p-1.5 rounded-lg border border-line text-slate hover:text-danger hover:border-danger/30 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Time range */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-slate uppercase tracking-wide block mb-1">Start</label>
                      <input type="time" value={col.startTime}
                        onChange={(e) => onUpdate(idx, { startTime: e.target.value })}
                        className={`${inputClass} text-sm py-2 w-full`} />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-slate uppercase tracking-wide block mb-1">End</label>
                      <input type="time" value={col.endTime}
                        onChange={(e) => onUpdate(idx, { endTime: e.target.value })}
                        className={`${inputClass} text-sm py-2 w-full`} />
                    </div>
                  </div>

                  {/* Type + Session */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-slate uppercase tracking-wide block mb-1">Type</label>
                      <select value={col.slotType} onChange={(e) => onUpdate(idx, { slotType: e.target.value })}
                        className={`${inputClass} text-sm py-2 w-full`}>
                        {SLOT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-slate uppercase tracking-wide block mb-1">Session</label>
                      <select value={col.session} disabled={col.slotType !== "LESSON"}
                        onChange={(e) => onUpdate(idx, { session: e.target.value })}
                        className={`${inputClass} text-sm py-2 w-full disabled:opacity-40 disabled:bg-paper`}>
                        {SESSIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Label */}
                  <div>
                    <label className="text-[10px] font-medium text-slate uppercase tracking-wide block mb-1">
                      Label {col.slotType === "LESSON" ? "(optional)" : "(required)"}
                    </label>
                    <input placeholder={col.slotType === "LESSON" ? "e.g. English, Maths…" : "e.g. Morning Break"}
                      value={col.label ?? ""}
                      onChange={(e) => onUpdate(idx, { label: e.target.value || null })}
                      className={`${inputClass} text-sm py-2 w-full`} />
                  </div>
                </div>

              </div>
            ))}
          </div>
        </>
      )}

      {/* Add slot buttons */}
      <div className="px-5 py-3 border-t border-line flex flex-wrap gap-2">
        {SLOT_TYPES.map((t) => (
          <button key={t.value} type="button" onClick={() => onAdd(t.value)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors
              ${SLOT_TYPE_COLORS[t.value] ?? "bg-white text-slate border-line hover:border-teal/40"}`}>
            <Plus className="h-3 w-3" />{t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Pill ──────────────────────────────────────────────────────────────────

function Pill({ label, value, color }: { label: string; value: number | string; color: string }) {
  const colors: Record<string, string> = {
    teal:   "bg-teal/10 text-teal border-teal/20",
    amber:  "bg-amber-50 text-amber-700 border-amber-200",
    blue:   "bg-blue-50 text-blue-700 border-blue-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    green:  "bg-green-50 text-green-700 border-green-200",
    pink:   "bg-pink-50 text-pink-700 border-pink-200",
    slate:  "bg-line text-slate",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${colors[color] ?? colors.slate}`}>
      <span className="font-bold">{value}</span>
      <span className="opacity-80">{label}</span>
    </span>
  );
}
