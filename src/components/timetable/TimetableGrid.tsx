"use client";

/**
 * TimetableGrid — renders a school timetable in the format described in the spec:
 *
 *   • Columns across the top = template columns (time range headers)
 *     Each column is either a LESSON slot or a non-lesson period (BREAK / LUNCH /
 *     GAMES / ASSEMBLY). Non-lesson columns span every day row as a shaded cell
 *     with the period label.
 *
 *   • Rows down the left = operating days (Monday … Friday, etc.)
 *
 *   • Each lesson cell shows: subject code (large), teacher name (small),
 *     room if set, and a colour derived from the subject's internalCode.
 *
 *   • Empty lesson cells show a faint dashed border so admins can see
 *     which slots are unfilled.
 *
 * The component is purely presentational — it receives data and callbacks,
 * does no fetching itself.
 */

import { useMemo } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

export type GridColumn = {
  position:  number;
  startTime: string;   // "HH:MM"
  endTime:   string;   // "HH:MM"
  slotType:  "LESSON" | "BREAK" | "LUNCH" | "GAMES" | "ASSEMBLY";
  label:     string | null;
  session:   "MORNING" | "AFTERNOON" | "EVENING";
};

export type GridSlot = {
  dayOfWeek:   number;
  /** 1-based period index among LESSON columns only */
  period:      number;
  subjectCode: string;
  subjectName: string;
  teacherName: string;
  room:        string | null;
  internalCode?: number;
  isLocked?:   boolean;
  isManual?:   boolean;
  /** If true, this slot represents a group of subjects */
  isGroupAnchor?: boolean;
  /** Name of the elective group (if isGroupAnchor) */
  groupName?: string;
  /** Group members (other subjects in the same group) */
  groupMembers?: Array<{ subjectId: string; subjectCode: string; subjectName: string }>;
  /** All teachers involved in this group slot */
  allTeachers?: string[];
};

export type TimetableGridProps = {
  /** Template columns defining the school day (from GET /api/timetable/template) */
  columns:      GridColumn[];
  /** Active operating days e.g. [0,1,2,3,4] */
  operatingDays: number[];
  /** All slots to display */
  slots:        GridSlot[];
  /** Called when user clicks a lesson cell (add / edit) */
  onCellClick?: (day: number, period: number, slot: GridSlot | null) => void;
  /** If true, cells are not interactive */
  readOnly?:    boolean;
  /** Highlight a specific (day, period) pair */
  highlightCell?: { day: number; period: number } | null;
  /** Show time labels in the column headers */
  showTimes?:   boolean;
};

// ── Colours ────────────────────────────────────────────────────────────────

// Subject palette — each entry pairs light and dark variants so cells stay legible in both themes.
// The -50 / -950 backgrounds are intentional data-visualization colors (like chart series) —
// exempt from token replacement per Req 3.7. Dark variants achieve ≥ 3:1 against dark card (#162233).
const SUBJECT_PALETTES = [
  { bg: "bg-teal-50    dark:bg-teal-950/60",    border: "border-teal-200    dark:border-teal-800",   text: "text-teal-800    dark:text-teal-200",    sub: "text-teal-600    dark:text-teal-300"   },
  { bg: "bg-blue-50    dark:bg-blue-950/60",    border: "border-blue-200    dark:border-blue-800",   text: "text-blue-800    dark:text-blue-200",    sub: "text-blue-600    dark:text-blue-300"   },
  { bg: "bg-purple-50  dark:bg-purple-950/60",  border: "border-purple-200  dark:border-purple-800", text: "text-purple-800  dark:text-purple-200",  sub: "text-purple-600  dark:text-purple-300" },
  { bg: "bg-emerald-50 dark:bg-emerald-950/60", border: "border-emerald-200 dark:border-emerald-800",text: "text-emerald-800 dark:text-emerald-200", sub: "text-emerald-600 dark:text-emerald-300"},
  { bg: "bg-amber-50   dark:bg-amber-950/60",   border: "border-amber-200   dark:border-amber-800",  text: "text-amber-800   dark:text-amber-200",   sub: "text-amber-600   dark:text-amber-300"  },
  { bg: "bg-rose-50    dark:bg-rose-950/60",    border: "border-rose-200    dark:border-rose-800",   text: "text-rose-800    dark:text-rose-200",    sub: "text-rose-600    dark:text-rose-300"   },
  { bg: "bg-cyan-50    dark:bg-cyan-950/60",    border: "border-cyan-200    dark:border-cyan-800",   text: "text-cyan-800    dark:text-cyan-200",    sub: "text-cyan-600    dark:text-cyan-300"   },
  { bg: "bg-orange-50  dark:bg-orange-950/60",  border: "border-orange-200  dark:border-orange-800", text: "text-orange-800  dark:text-orange-200",  sub: "text-orange-600  dark:text-orange-300" },
  { bg: "bg-lime-50    dark:bg-lime-950/60",    border: "border-lime-200    dark:border-lime-800",   text: "text-lime-800    dark:text-lime-200",    sub: "text-lime-600    dark:text-lime-300"   },
  { bg: "bg-indigo-50  dark:bg-indigo-950/60",  border: "border-indigo-200  dark:border-indigo-800", text: "text-indigo-800  dark:text-indigo-200",  sub: "text-indigo-600  dark:text-indigo-300" },
  { bg: "bg-pink-50    dark:bg-pink-950/60",    border: "border-pink-200    dark:border-pink-800",   text: "text-pink-800    dark:text-pink-200",    sub: "text-pink-600    dark:text-pink-300"   },
  { bg: "bg-sky-50     dark:bg-sky-950/60",     border: "border-sky-200     dark:border-sky-800",    text: "text-sky-800     dark:text-sky-200",     sub: "text-sky-600     dark:text-sky-300"    },
];

const NON_LESSON_STYLES: Record<string, string> = {
  BREAK:    "bg-orange-50 dark:bg-orange-950/30 border-orange-100 dark:border-orange-900/40 text-orange-600 dark:text-orange-400",
  LUNCH:    "bg-green-50  dark:bg-green-950/30  border-green-100  dark:border-green-900/40  text-green-700  dark:text-green-400",
  GAMES:    "bg-pink-50   dark:bg-pink-950/30   border-pink-100   dark:border-pink-900/40   text-pink-700   dark:text-pink-400",
  ASSEMBLY: "bg-card      border-border         text-muted-foreground",
};

const colorCache = new Map<string, (typeof SUBJECT_PALETTES)[0]>();
let colorCounter = 0;

function colorForSubject(subjectCode: string, internalCode?: number): (typeof SUBJECT_PALETTES)[0] {
  const key = internalCode != null ? `ic:${internalCode}` : subjectCode;
  if (!colorCache.has(key)) {
    colorCache.set(key, SUBJECT_PALETTES[colorCounter++ % SUBJECT_PALETTES.length]);
  }
  return colorCache.get(key)!;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Component ──────────────────────────────────────────────────────────────

export default function TimetableGrid({
  columns,
  operatingDays,
  slots,
  onCellClick,
  readOnly = false,
  highlightCell,
  showTimes = true,
}: TimetableGridProps) {
  // Separate lesson and non-lesson columns, preserving their original positions
  const { lessonCols, allCols } = useMemo(() => {
    const sorted = [...columns].sort((a, b) => a.position - b.position);
    const lesson = sorted.filter((c) => c.slotType === "LESSON");
    return { lessonCols: lesson, allCols: sorted };
  }, [columns]);

  // Build slot lookup: "day-period" → GridSlot
  const slotMap = useMemo(() => {
    const m = new Map<string, GridSlot>();
    for (const s of slots) m.set(`${s.dayOfWeek}-${s.period}`, s);
    return m;
  }, [slots]);

  // Map lesson column position → 1-based period number
  const periodByPosition = useMemo(() => {
    const m = new Map<number, number>();
    lessonCols.forEach((c, i) => m.set(c.position, i + 1));
    return m;
  }, [lessonCols]);

  if (columns.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-background p-8 text-center">
        <p className="text-sm text-slate">No template configured.</p>
        <p className="text-xs text-slate/60 mt-1">
          Visit <strong>Day Template</strong> to set up the school-day format first.
        </p>
      </div>
    );
  }

  if (operatingDays.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-background p-8 text-center">
        <p className="text-sm text-slate">No operating days configured.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="min-w-full border-collapse text-xs">

        {/* ── Column headers ──────────────────────────────────────── */}
        <thead>
          <tr className="bg-background border-b border-border">
            {/* Day label corner */}
            <th className="sticky left-0 z-20 bg-background px-3 py-2.5 text-left border-r border-border min-w-[72px]">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate">Day</span>
            </th>

            {allCols.map((col) => {
              const isLesson = col.slotType === "LESSON";
              const period   = periodByPosition.get(col.position);
              const nlStyle  = NON_LESSON_STYLES[col.slotType] ?? "bg-muted border-border text-muted-foreground";

              return (
                <th key={col.position}
                  className={`px-1.5 py-2 min-w-[82px] max-w-[110px] border-r border-border last:border-r-0 font-normal
                    ${isLesson ? "bg-background" : nlStyle}`}>
                  {isLesson ? (
                    <div className="text-center space-y-0.5">
                      <p className="text-[10px] font-semibold text-slate uppercase tracking-wide">
                        P{period}
                      </p>
                      {showTimes && (
                        <p className="text-[9px] text-slate/70 font-normal">
                          {col.startTime}–{col.endTime}
                        </p>
                      )}
                      <SessionPip session={col.session} />
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-[10px] font-medium">{col.label ?? col.slotType}</p>
                      {showTimes && (
                        <p className="text-[9px] opacity-70">{col.startTime}–{col.endTime}</p>
                      )}
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        {/* ── Day rows ────────────────────────────────────────────── */}
        <tbody>
          {operatingDays.map((day, rowIdx) => (
            <tr key={day} className={rowIdx % 2 === 0 ? "bg-card" : "bg-background/40"}>

              {/* Day label */}
              <td className="sticky left-0 z-10 bg-inherit px-3 py-1.5 border-r border-b border-border font-medium whitespace-nowrap">
                <span className="hidden sm:inline text-slate">{DAY_NAMES[day]}</span>
                <span className="sm:hidden text-slate">{DAY_SHORT[day]}</span>
              </td>

              {/* Cells */}
              {allCols.map((col) => {
                const isLesson = col.slotType === "LESSON";
                const period   = isLesson ? periodByPosition.get(col.position) : null;

                if (!isLesson) {
                  // Non-lesson: shaded span across the row
                  const nlStyle = NON_LESSON_STYLES[col.slotType] ?? "bg-muted";
                  return (
                    <td key={col.position}
                      className={`border-r border-b border-border last:border-r-0 px-1 py-1.5 text-center ${nlStyle}`}>
                      <span className="text-[9px] font-medium opacity-70">{col.label ?? col.slotType}</span>
                    </td>
                  );
                }

                const slot   = period != null ? slotMap.get(`${day}-${period}`) ?? null : null;
                const isHigh = highlightCell?.day === day && highlightCell?.period === period;

                return (
                  <td key={col.position}
                    className={`border-r border-b border-border last:border-r-0 p-0.5 align-top
                      ${isHigh ? "ring-2 ring-teal ring-inset" : ""}`}>
                    <LessonCell
                      slot={slot}
                      day={day}
                      period={period ?? 0}
                      readOnly={readOnly}
                      onClick={onCellClick}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── LessonCell ─────────────────────────────────────────────────────────────

function LessonCell({
  slot, day, period, readOnly, onClick,
}: {
  slot:     GridSlot | null;
  day:      number;
  period:   number;
  readOnly: boolean;
  onClick?: (day: number, period: number, slot: GridSlot | null) => void;
}) {
  const palette = slot ? colorForSubject(slot.subjectCode, slot.internalCode) : null;
  const interactive = !readOnly && !!onClick;

  if (!slot) {
    return (
      <button
        type="button"
        disabled={readOnly}
        onClick={() => onClick?.(day, period, null)}
        aria-label={`Add lesson — ${DAY_SHORT[day]} period ${period}`}
        className={`w-full min-h-[52px] rounded border border-dashed border-border bg-card flex items-center justify-center
          ${interactive ? "hover:border-teal/50 hover:bg-teal/4 transition-colors cursor-pointer" : "cursor-default"}`}
      >
        {interactive && (
          <span className="text-[10px] text-muted-foreground group-hover:text-teal">+</span>
        )}
      </button>
    );
  }

  // For group slots, show abbreviated info or full group details
  const isGroup = slot.isGroupAnchor; // A slot is a group if it's marked as anchor, regardless of member count
  const memberCount = isGroup && slot.groupMembers ? slot.groupMembers.length + 1 : 0; // +1 for anchor
  const displayCode = isGroup && slot.groupName ? slot.groupName : slot.subjectCode;

  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={() => onClick?.(day, period, slot)}
      aria-label={`${displayCode}${isGroup ? ` (group, ${memberCount} subjects)` : ""} ${isGroup ? "" : `— ${slot.teacherName}`}, period ${period}`}
      className={`w-full min-h-[52px] rounded border px-1.5 py-1.5 text-left flex flex-col justify-between
        ${palette!.bg} ${palette!.border}
        ${interactive ? "hover:brightness-95 transition-all cursor-pointer active:scale-[0.98]" : "cursor-default"}
        ${slot.isLocked ? "opacity-80 ring-1 ring-inset ring-slate-400/30" : ""}
        ${isGroup ? "ring-2 ring-inset ring-teal/40 bg-opacity-80" : ""}
      `}
      title={isGroup && slot.groupMembers ? `Group: ${slot.groupName} (${[slot.subjectCode, ...slot.groupMembers.map(m => m.subjectCode)].join(", ")})` : undefined}
    >
      <div className="flex items-start justify-between gap-1 min-w-0">
        <div className="flex-1 min-w-0">
          <span className={`text-xs font-bold leading-tight truncate block ${palette!.text}`}>
            {displayCode}
            {isGroup && slot.groupMembers && slot.groupMembers.length > 0 && <span className="text-[9px] ml-0.5">+{slot.groupMembers.length}</span>}
          </span>
          {isGroup && slot.groupMembers && slot.groupMembers.length > 0 && (
            <p className={`text-[8px] truncate leading-tight mt-0.5 text-card-foreground/60`}>
              {slot.groupMembers.map(m => m.subjectCode).join(", ")}
            </p>
          )}
        </div>
        <div className="flex gap-0.5 shrink-0">
          {isGroup && (
            <span className="text-[8px] bg-teal/20 text-teal px-1 rounded font-semibold leading-tight">🔀</span>
          )}
          {slot.isLocked && (
            <span className="text-[8px] bg-muted text-muted-foreground px-1 rounded font-semibold leading-tight">🔒</span>
          )}
          {slot.isManual && (
            <span className="text-[8px] bg-teal/20 text-teal px-1 rounded font-semibold leading-tight">M</span>
          )}
        </div>
      </div>
      <div className="min-w-0">
        {/* For group slots, don't show teachers (they're assigned per subject in class profile) */}
        {!isGroup && (
          <>
            <p className={`text-[10px] truncate leading-tight text-card-foreground/70`}>
              {slot.teacherName}
            </p>
            {slot.room && (
              <p className={`text-[9px] truncate leading-tight mt-0.5 text-card-foreground/60`}>{slot.room}</p>
            )}
          </>
        )}
        {isGroup && slot.room && (
          <p className={`text-[9px] truncate leading-tight mt-0.5 text-card-foreground/60`}>{slot.room}</p>
        )}
      </div>
    </button>
  );
}

// ── Session pip ────────────────────────────────────────────────────────────

function SessionPip({ session }: { session: "MORNING" | "AFTERNOON" | "EVENING" }) {
  const styles = {
    MORNING:   "bg-amber-300 dark:bg-amber-500",
    AFTERNOON: "bg-blue-300  dark:bg-blue-500",
    EVENING:   "bg-purple-300 dark:bg-purple-500",
  };
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full mx-auto ${styles[session]}`}
      title={session.charAt(0) + session.slice(1).toLowerCase()}
    />
  );
}
