"use client";
/**
 * ConflictPanel — floating side-panel listing every live conflict.
 *
 * Errors section  : flat list with checkboxes → "Auto Fix Selected"
 * Warnings section: grouped by conflict type, each group has a plain-language
 *                   heading + one-line explanation so anyone can understand it
 *
 * Other features preserved:
 *  • "Jump to" scrolls the conflicting cell into view
 *  • EMPTY_SLOTS warnings show a "Fix requirements" link
 *  • Multi-select + Auto Fix for errors
 *  • Keyboard accessible
 */
import { useState, useMemo } from "react";
import {
  X, AlertCircle, Info, ArrowRight,
  BookOpen, User, Clock, CalendarX2, BarChart2,
  ZapOff, ChevronDown, ChevronUp, Wrench, LayoutGrid, ExternalLink,
  CheckCircle2,
} from "lucide-react";
import type {
  CellConflict, ConflictType, ConflictSummary,
} from "@/lib/timetable/liveConflictDetector";
import { primaryButtonClass } from "@/components/ui";

// ── Per-type metadata ──────────────────────────────────────────────────────
// Each entry has:
//   • Icon / color  – shown on the individual item chip
//   • heading       – plain-language group header (warnings panel)
//   • explanation   – one sentence anyone can understand
//   • severity hint – whether this type is always an error, always a warning,
//                     or can be either (used to decide where it goes)

const TYPE_META: Record<
  ConflictType,
  {
    Icon: React.ElementType;
    color: string;
    label: string;          // screen-reader / tooltip
    heading: string;        // group heading in the warnings section
    explanation: string;    // plain-language explanation
  }
> = {
  TEACHER_DOUBLE_BOOKED: {
    Icon: User, color: "text-danger",
    label: "Teacher double-booked",
    heading: "Teacher teaching two classes at the same time",
    explanation: "A teacher can only be in one place per period. One of these lessons must move or get a different teacher.",
  },
  CLASS_DOUBLE_BOOKED: {
    Icon: BookOpen, color: "text-danger",
    label: "Class double-booked",
    heading: "Class has two subjects in the same slot",
    explanation: "Students can't be in two lessons at once. Remove or reschedule one of the overlapping subjects.",
  },
  TEACHER_UNAVAILABLE: {
    Icon: Clock, color: "text-danger",
    label: "Teacher unavailable",
    heading: "Teacher booked when they're not available",
    explanation: "This teacher has marked that period as unavailable. Reassign the lesson or update their availability.",
  },
  INACTIVE_DAY: {
    Icon: CalendarX2, color: "text-danger",
    label: "Inactive day",
    heading: "Lesson scheduled on a non-school day",
    explanation: "This day is not in the school's operating schedule. Move the lesson to an active day.",
  },
  WORKLOAD_EXCEEDED: {
    Icon: BarChart2, color: "text-danger",
    label: "Workload exceeded",
    heading: "Teacher has too many lessons in one day",
    explanation: "This teacher exceeds the maximum daily lesson limit. Spread the lessons across more days.",
  },
  LESSON_INCOMPLETE: {
    Icon: ZapOff, color: "text-warn",
    label: "Missing lessons",
    heading: "Subject doesn't have enough lessons this week",
    explanation: "The weekly lesson target isn't met for this subject. Add the missing lessons to reach the required count.",
  },
  DOUBLE_NOT_ADJACENT: {
    Icon: ArrowRight, color: "text-danger",
    label: "Non-adjacent double lesson",
    heading: "Double lesson is split across non-consecutive periods",
    explanation: "Double lessons must be back-to-back. Move one half so the pair is consecutive.",
  },
  EMPTY_SLOTS: {
    Icon: LayoutGrid, color: "text-warn",
    label: "Empty slots",
    heading: "Class has unused lesson slots this week",
    explanation: "Some periods have no subject assigned. Either add more subjects or increase lessons-per-week for existing ones.",
  },
};

// ── Warning group order (most-actionable first) ────────────────────────────
const WARNING_TYPE_ORDER: ConflictType[] = [
  "LESSON_INCOMPLETE",
  "EMPTY_SLOTS",
  "DOUBLE_NOT_ADJACENT",
  "TEACHER_DOUBLE_BOOKED",
  "CLASS_DOUBLE_BOOKED",
  "TEACHER_UNAVAILABLE",
  "INACTIVE_DAY",
  "WORKLOAD_EXCEEDED",
];

// ── Props ──────────────────────────────────────────────────────────────────

type Props = {
  summary:    ConflictSummary;
  onJumpTo:   (key: string) => void;
  onNavigate: (classId: string) => void;
  onAutoFix:  (classIds: string[]) => void;
  onClose:    () => void;
  autoFixing: boolean;
};

// ── Main component ─────────────────────────────────────────────────────────

export default function ConflictPanel({
  summary, onJumpTo, onNavigate, onAutoFix, onClose, autoFixing,
}: Props) {
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [showErrors,   setShowErrors]   = useState(true);
  const [showWarnings, setShowWarnings] = useState(true);

  const errors   = summary.conflictList.filter((e) => e.conflict.severity === "error");
  const warnings = summary.conflictList.filter((e) => e.conflict.severity === "warning");

  // Group warnings by type, respecting order
  const warningGroups = useMemo(() => {
    const map = new Map<ConflictType, Array<{ key: string; conflict: CellConflict }>>();
    for (const item of warnings) {
      const list = map.get(item.conflict.type) ?? [];
      list.push(item);
      map.set(item.conflict.type, list);
    }
    // Return in preferred order, then any remaining types
    const ordered: ConflictType[] = [
      ...WARNING_TYPE_ORDER.filter((t) => map.has(t)),
      ...[...map.keys()].filter((t) => !WARNING_TYPE_ORDER.includes(t)),
    ];
    return ordered.map((t) => ({ type: t, items: map.get(t)! }));
  }, [warnings]);

  function toggle(key: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(key)) { n.delete(key); } else { n.add(key); }
      return n;
    });
  }

  function selectAll() { setSelected(new Set(errors.map((e) => e.key))); }
  function clearAll()  { setSelected(new Set()); }

  function handleAutoFix() {
    const classIds = new Set<string>();
    for (const key of selected) {
      const m = key.match(/^class:([^|]+)/);
      if (m) classIds.add(m[1]);
    }
    if (classIds.size > 0) onAutoFix([...classIds]);
  }

  function classIdFromKey(key: string) {
    return key.match(/^class:([^|]+)/)?.[1] ?? null;
  }

  const isClean = summary.conflictList.length === 0;

  return (
    <div
      role="complementary"
      aria-label="Conflict panel"
      className="flex flex-col bg-card border border-border rounded-xl shadow-lg
                 w-full sm:w-80 max-h-[calc(100vh-8rem)] overflow-hidden"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {isClean
            ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" aria-hidden />
            : <AlertCircle  className="h-4 w-4 text-danger  shrink-0" aria-hidden />
          }
          <p className="text-sm font-semibold text-foreground">Timetable Health</p>
          {!isClean && (
            <span className="inline-flex items-center gap-1.5 flex-wrap">
              {summary.totalErrors > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full
                                 bg-danger/10 text-danger border border-danger/15">
                  {summary.totalErrors} error{summary.totalErrors !== 1 ? "s" : ""}
                </span>
              )}
              {summary.totalWarnings > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full
                                 bg-warn/10 text-warn border border-warn/15">
                  {summary.totalWarnings} warning{summary.totalWarnings !== 1 ? "s" : ""}
                </span>
              )}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close conflict panel"
          className="p-1.5 rounded-lg text-slate hover:text-foreground hover:bg-background transition-colors shrink-0"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">

        {/* Clean state */}
        {isClean && (
          <div className="text-center py-8">
            <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" aria-hidden />
            <p className="text-sm font-semibold text-success">No conflicts</p>
            <p className="text-xs text-slate mt-1">The timetable looks good.</p>
          </div>
        )}

        {/* ── Errors ──────────────────────────────────────────────────── */}
        {errors.length > 0 && (
          <section>
            <button
              onClick={() => setShowErrors((o) => !o)}
              className="w-full flex items-center justify-between px-1 py-1 mb-1.5
                         text-xs font-semibold text-danger/80 hover:text-danger transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                Critical errors — must fix before publishing
                <span className="font-bold text-[10px] px-1.5 py-0.5 rounded-full
                                 bg-danger/10 text-danger border border-danger/15">
                  {errors.length}
                </span>
              </span>
              {showErrors
                ? <ChevronUp   className="h-3.5 w-3.5 shrink-0" aria-hidden />
                : <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
              }
            </button>
            {showErrors && errors.map(({ key, conflict }, i) => (
              <ConflictEntry
                key={`err-${i}`}
                cellKey={key}
                conflict={conflict}
                checked={selected.has(key)}
                onToggle={() => toggle(key)}
                onJump={() => onJumpTo(key)}
              />
            ))}
          </section>
        )}

        {/* ── Warnings — grouped by category ──────────────────────────── */}
        {warningGroups.length > 0 && (
          <section>
            <button
              onClick={() => setShowWarnings((o) => !o)}
              className="w-full flex items-center justify-between px-1 py-1 mb-1.5
                         text-xs font-semibold text-warn/80 hover:text-warn transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" aria-hidden />
                Warnings — good to fix
                <span className="font-bold text-[10px] px-1.5 py-0.5 rounded-full
                                 bg-warn/10 text-warn border border-warn/15">
                  {warnings.length}
                </span>
              </span>
              {showWarnings
                ? <ChevronUp   className="h-3.5 w-3.5 shrink-0" aria-hidden />
                : <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
              }
            </button>

            {showWarnings && warningGroups.map(({ type, items }) => (
              <WarningGroup
                key={type}
                type={type}
                items={items}
                onJump={onJumpTo}
                onNavigate={onNavigate}
                classIdFromKey={classIdFromKey}
              />
            ))}
          </section>
        )}
      </div>

      {/* ── Footer — Auto Fix ────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div className="shrink-0 border-t border-border px-3 py-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate">
            <button onClick={selectAll} className="hover:text-teal transition-colors">
              Select all errors
            </button>
            <button onClick={clearAll} className="hover:text-teal transition-colors">
              Clear
            </button>
          </div>
          <button
            onClick={handleAutoFix}
            disabled={selected.size === 0 || autoFixing}
            className={`${primaryButtonClass} w-full text-xs`}
          >
            <Wrench className="h-3.5 w-3.5" aria-hidden />
            {autoFixing
              ? "Auto-fixing…"
              : `Auto Fix${selected.size > 0 ? ` (${selected.size})` : ""}`
            }
          </button>
        </div>
      )}
    </div>
  );
}

// ── Warning group ──────────────────────────────────────────────────────────

function WarningGroup({
  type, items, onJump, onNavigate, classIdFromKey,
}: {
  type:            ConflictType;
  items:           Array<{ key: string; conflict: CellConflict }>;
  onJump:          (key: string) => void;
  onNavigate:      (classId: string) => void;
  classIdFromKey:  (key: string) => string | null;
}) {
  const meta       = TYPE_META[type];
  const { Icon, color, heading, explanation } = meta ?? {
    Icon: Info, color: "text-slate",
    heading: "Other warning", explanation: "Review the timetable for this item.",
  };
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl border border-warn/20 bg-warn-bg mb-2 overflow-hidden">
      {/* Group header — always visible */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left
                   hover:bg-warn/5 transition-colors"
      >
        <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${color}`} aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground leading-snug">{heading}</p>
          <p className="text-[10px] text-slate mt-0.5 leading-snug">{explanation}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full
                           bg-warn/10 text-warn border border-warn/15">
            {items.length}
          </span>
          {open
            ? <ChevronUp   className="h-3 w-3 text-slate" aria-hidden />
            : <ChevronDown className="h-3 w-3 text-slate" aria-hidden />
          }
        </div>
      </button>

      {/* Individual warning items */}
      {open && (
        <div className="border-t border-warn/15 divide-y divide-warn/10">
          {items.map(({ key, conflict }, i) => {
            const isEmptySlot = conflict.type === "EMPTY_SLOTS";
            const classId     = classIdFromKey(key);
            return (
              <div key={i} className="flex items-start gap-2 px-3 py-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-warn shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-foreground leading-snug">{conflict.message}</p>
                  <p className="text-[10px] text-teal mt-0.5 leading-snug">{conflict.action}</p>
                </div>
                <button
                  onClick={() =>
                    isEmptySlot && classId
                      ? onNavigate(classId)
                      : onJump(key)
                  }
                  aria-label={isEmptySlot ? "Fix lesson requirements" : "Jump to this warning"}
                  title={isEmptySlot ? "Fix lesson requirements" : "Jump to cell"}
                  className="shrink-0 p-1 rounded text-slate hover:text-teal
                             hover:bg-teal-50 transition-colors"
                >
                  {isEmptySlot
                    ? <ExternalLink className="h-3 w-3" aria-hidden />
                    : <ArrowRight   className="h-3 w-3" aria-hidden />
                  }
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Single error entry (flat list with checkbox) ───────────────────────────

function ConflictEntry({
  conflict, checked, onToggle, onJump, jumpLabel, JumpIcon,
}: {
  cellKey:    string;
  conflict:   CellConflict;
  checked:    boolean;
  onToggle:   () => void;
  onJump:     () => void;
  jumpLabel?: string;
  JumpIcon?:  React.ElementType;
}) {
  const meta       = TYPE_META[conflict.type];
  const Icon       = meta?.Icon ?? Info;
  const ActionIcon = JumpIcon ?? ArrowRight;

  return (
    <div
      className={`flex items-start gap-2 p-2.5 rounded-lg border mb-1.5 transition-colors
        ${checked
          ? "bg-teal-50 dark:bg-teal-950/60 border-teal/30"
          : "bg-danger/4 border-danger/20"
        }`}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={`Select: ${conflict.message}`}
        className="mt-0.5 h-3.5 w-3.5 rounded border-border shrink-0 cursor-pointer accent-teal"
      />

      {/* Type icon */}
      <Icon
        className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${meta?.color ?? "text-slate"}`}
        aria-label={meta?.label}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground leading-tight">{conflict.message}</p>
        <p className="text-[10px] text-teal mt-0.5 leading-snug">{conflict.action}</p>
      </div>

      {/* Jump button */}
      <button
        onClick={onJump}
        aria-label={jumpLabel ?? "Jump to conflict"}
        title={jumpLabel ?? "Jump to this conflict"}
        className="shrink-0 p-1 rounded text-slate hover:text-teal hover:bg-teal-50 transition-colors"
      >
        <ActionIcon className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}
