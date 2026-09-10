"use client";
/**
 * ReoptimizePreviewModal
 *
 * Side-by-side diff of current timetable vs AI-proposed re-optimized
 * timetable. Shows:
 *   locked    — padlock icon, teal badge, never touched
 *   unchanged — grey cell, no decoration
 *   changed   — amber background, shows what changed (teacher / room)
 *   added     — green background, new lesson added by the engine
 *   removed   — red background, lesson the engine wants to remove
 *
 * The administrator can review and either Apply all changes or Discard.
 * A summary banner shows how many manual overrides were preserved.
 */

import { useState, useMemo } from "react";
import {
  Lock, Plus, Minus, ArrowLeftRight, CheckCircle2,
  AlertTriangle, RefreshCw, X, ChevronDown, ChevronUp,
} from "lucide-react";
import Modal from "@/components/Modal";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

export type DiffStatus = "unchanged" | "changed" | "added" | "removed" | "locked";

export type SlotDiff = {
  status:       DiffStatus;
  current: {
    classId: string; className: string; dayOfWeek: number; period: number;
    subjectCode: string; teacherName: string; room: string | null;
    isManual: boolean; isLocked: boolean; lockReason?: string | null;
  } | null;
  proposed: {
    classId: string; className: string; dayOfWeek: number; period: number;
    subjectCode: string; teacherName: string; room: string | null;
    isManual: boolean; isLocked: boolean;
  } | null;
  changedFields: string[];
};

export type ReoptimizeDiffStats = {
  locked:    number;
  unchanged: number;
  changed:   number;
  added:     number;
  removed:   number;
  warnings:  string[];
};

type Props = {
  diff:       SlotDiff[];
  stats:      ReoptimizeDiffStats;
  applying:   boolean;
  onApply:    () => void;
  onDiscard:  () => void;
};

// ── Constants ─────────────────────────────────────────────────────────────

const DAY_NAMES  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const STATUS_CFG: Record<DiffStatus, {
  bg: string; border: string; text: string; icon: React.ElementType; label: string;
}> = {
  locked:    { bg:"bg-teal-50   dark:bg-teal-950/60",  border:"border-teal-200   dark:border-teal-800",  text:"text-teal-800   dark:text-teal-200",  icon:Lock,            label:"Locked"    },
  unchanged: { bg:"bg-muted",                          border:"border-border",                             text:"text-muted-foreground",                    icon:CheckCircle2,    label:"Unchanged" },
  changed:   { bg:"bg-amber-50  dark:bg-amber-950/60", border:"border-amber-300  dark:border-amber-800",  text:"text-amber-800  dark:text-amber-200",  icon:ArrowLeftRight,  label:"Changed"   },
  added:     { bg:"bg-green-50  dark:bg-green-950/60", border:"border-green-300  dark:border-green-800",  text:"text-green-800  dark:text-green-200",  icon:Plus,            label:"Added"     },
  removed:   { bg:"bg-danger/8",  border:"border-danger/30",  text:"text-danger",     icon:Minus,           label:"Removed"   },
};

// ── Component ─────────────────────────────────────────────────────────────

export default function ReoptimizePreviewModal({
  diff, stats, applying, onApply, onDiscard,
}: Props) {
  const [filterStatus, setFilterStatus] = useState<DiffStatus | "all">("all");
  const [showWarnings, setShowWarnings] = useState(true);
  const [expandedIdx,  setExpandedIdx]  = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (filterStatus === "all") return diff;
    return diff.filter((d) => d.status === filterStatus);
  }, [diff, filterStatus]);

  const manualPreserved = diff.filter(
    (d) => (d.status === "locked" || d.status === "unchanged") && d.current?.isManual
  ).length;

  const totalChanges = stats.added + stats.removed + stats.changed;

  return (
    <Modal
      title="Re-optimize Preview"
      onClose={onDiscard}
      size="lg"
    >
      <div className="space-y-4">

        {/* ── Summary banner ──────────────────────────────────────────── */}
        <div className="rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 p-4">
          <p className="text-sm font-semibold text-teal-900 dark:text-teal-200 mb-2">
            AI proposed {totalChanges} change{totalChanges !== 1 ? "s" : ""} to unlocked lessons
          </p>
          <div className="flex flex-wrap gap-3 text-xs">
            {(["locked","unchanged","changed","added","removed"] as DiffStatus[]).map((s) => {
              const cfg = STATUS_CFG[s];
              const Icon = cfg.icon;
              const count = stats[s as keyof ReoptimizeDiffStats] as number;
              return (
                <button
                  key={s}
                  onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-semibold
                    transition-colors ${filterStatus === s ? `${cfg.bg} ${cfg.border} ${cfg.text}` : "bg-card border-border text-slate hover:border-teal/40"}`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {cfg.label}: {count}
                </button>
              );
            })}
          </div>
          {manualPreserved > 0 && (
            <p className="text-xs text-teal-700 dark:text-teal-300 mt-2 flex items-center gap-1.5">
              <Lock className="h-3 w-3 shrink-0" aria-hidden />
              {manualPreserved} manual override{manualPreserved !== 1 ? "s" : ""} preserved
            </p>
          )}
        </div>

        {/* ── Warnings ────────────────────────────────────────────────── */}
        {stats.warnings?.length > 0 && (
          <div className="rounded-xl bg-warn-bg border border-warn/20 p-3">
            <button
              onClick={() => setShowWarnings((o) => !o)}
              className="w-full flex items-center justify-between text-xs font-semibold text-warn"
            >
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                {stats.warnings.length} scheduling warning{stats.warnings.length !== 1 ? "s" : ""}
              </span>
              {showWarnings ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showWarnings && (
              <ul className="mt-2 space-y-1">
                {stats.warnings.slice(0, 6).map((w, i) => (
                  <li key={i} className="text-xs text-foreground/80 flex items-start gap-1.5">
                    <span className="text-warn shrink-0 mt-0.5">·</span>{w}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── Diff list ────────────────────────────────────────────────── */}
        <div className="max-h-[50vh] overflow-y-auto space-y-1.5 pr-1">
          {filtered.length === 0 && (
            <p className="text-sm text-slate text-center py-6">No items match this filter.</p>
          )}

          {filtered.map((d, idx) => {
            const cfg    = STATUS_CFG[d.status];
            const Icon   = cfg.icon;
            const slot   = d.current ?? d.proposed!;
            const isOpen = expandedIdx === idx;

            return (
              <div key={idx}
                className={`rounded-lg border ${cfg.bg} ${cfg.border} overflow-hidden`}>
                <button
                  onClick={() => setExpandedIdx(isOpen ? null : idx)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
                >
                  {/* Status icon */}
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.text}`} aria-label={cfg.label} />

                  {/* Lock badge */}
                  {d.current?.isLocked && (
                    <Lock className="h-3 w-3 text-teal shrink-0" aria-label="Locked" />
                  )}
                  {/* Manual badge */}
                  {d.current?.isManual && !d.current.isLocked && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-teal/10 text-teal shrink-0">
                      MANUAL
                    </span>
                  )}

                  {/* Summary line */}
                  <div className={`flex-1 min-w-0 text-xs font-medium ${cfg.text}`}>
                    <span className="truncate">{slot.className}</span>
                    <span className="mx-1 opacity-60">·</span>
                    <span>{slot.subjectCode}</span>
                    <span className="mx-1 opacity-60">·</span>
                    <span>{DAY_NAMES[slot.dayOfWeek]} P{slot.period}</span>
                  </div>

                  {d.changedFields.length > 0 && (
                    <span className="text-[10px] text-amber-700 dark:text-amber-300 shrink-0">
                      {d.changedFields.join(", ")} changed
                    </span>
                  )}

                  {isOpen
                    ? <ChevronUp   className="h-3.5 w-3.5 text-slate shrink-0" />
                    : <ChevronDown className="h-3.5 w-3.5 text-slate shrink-0" />
                  }
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="grid grid-cols-2 gap-2 px-3 pb-3 border-t border-current/10">
                    {/* Current */}
                    <div>
                      <p className="text-[10px] font-semibold text-slate uppercase tracking-wide mt-2 mb-1">
                        Current
                      </p>
                      {d.current ? (
                        <SlotDetail slot={d.current} highlight={[]} />
                      ) : (
                        <p className="text-xs text-slate italic">Empty</p>
                      )}
                    </div>
                    {/* Proposed */}
                    <div>
                      <p className="text-[10px] font-semibold text-slate uppercase tracking-wide mt-2 mb-1">
                        Proposed
                      </p>
                      {d.proposed ? (
                        <SlotDetail slot={d.proposed} highlight={d.changedFields} />
                      ) : d.status === "locked" ? (
                        <p className="text-xs text-teal italic flex items-center gap-1">
                          <Lock className="h-3 w-3" aria-hidden /> No change — locked
                        </p>
                      ) : (
                        <p className="text-xs text-slate italic">Removed</p>
                      )}
                    </div>
                    {d.current?.lockReason && (
                      <p className="col-span-2 text-[10px] text-teal/80 italic">
                        Lock reason: {d.current.lockReason}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Footer actions ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <p className="text-xs text-slate">
            {totalChanges} lesson{totalChanges !== 1 ? "s" : ""} will change.
            {stats.locked > 0 ? ` ${stats.locked} locked lesson${stats.locked !== 1 ? "s" : ""} preserved.` : ""}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onDiscard}
              disabled={applying}
              className={secondaryButtonClass}
            >
              <X className="h-4 w-4" aria-hidden /> Discard
            </button>
            <button
              onClick={onApply}
              disabled={applying || totalChanges === 0}
              className={primaryButtonClass}
            >
              {applying
                ? <><RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> Applying…</>
                : <><CheckCircle2 className="h-4 w-4" aria-hidden /> Apply changes</>
              }
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Slot detail sub-component ─────────────────────────────────────────────

function SlotDetail({
  slot, highlight,
}: {
  slot:      { subjectCode: string; teacherName: string; room: string | null };
  highlight: string[];
}) {
  return (
    <div className="space-y-0.5 text-xs">
      <p className="font-semibold text-foreground">{slot.subjectCode}</p>
      <p className={highlight.includes("teacher") ? "text-amber-700 dark:text-amber-300 font-semibold" : "text-slate"}>
        {slot.teacherName || "—"}
      </p>
      {slot.room && (
        <p className={highlight.includes("room") ? "text-amber-700 dark:text-amber-300 font-semibold" : "text-slate/70"}>
          {slot.room}
        </p>
      )}
    </div>
  );
}
