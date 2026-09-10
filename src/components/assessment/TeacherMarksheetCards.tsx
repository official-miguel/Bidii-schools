"use client";

/**
 * TeacherMarksheetCards
 *
 * Landing view for the Mark Sheets page.
 * Shows:
 *   1. An exam-period selector at the top.
 *   2. One assignment card per (class × subject) pair for the selected period.
 *      Clicking a card navigates to the marksheet grid for that pair.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Users,
  ChevronRight,
  ChevronDown,
  TrendingUp,
} from "lucide-react";
import { EmptyState } from "@/components/ui";
import type { TeacherClassCard } from "@/app/api/assessments/home/teacher/route";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PeriodOption {
  id: string;
  name: string;
  academicYear: string;
  term: number | null;
  isCurrent: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function periodLabel(p: PeriodOption) {
  return p.term
    ? `Term ${p.term} — ${p.academicYear} (${p.name})`
    : `${p.name} — ${p.academicYear}`;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const colour =
    pct === 100
      ? "bg-green-500"
      : pct >= 60
      ? "bg-teal"
      : pct >= 30
      ? "bg-amber-400"
      : "bg-danger";
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex-1 h-1.5 bg-line rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colour}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-slate shrink-0 w-9 text-right">
        {value}/{max}
      </span>
    </div>
  );
}

// ── Period selector ───────────────────────────────────────────────────────────

function PeriodSelector({
  periods,
  value,
  onChange,
}: {
  periods: PeriodOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const current = periods.find((p) => p.id === value);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/60 px-4 py-3">
      <label className="text-xs font-medium text-slate shrink-0">Exam period</label>
      <div className="relative min-w-[240px]">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-border bg-card pl-3 pr-8 py-2 text-sm text-foreground focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/15 transition-colors"
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {periodLabel(p)}
              {p.isCurrent ? " ✦ Current" : ""}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate" />
      </div>
      {current?.isCurrent && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-teal bg-teal/10 rounded-full px-2.5 py-1">
          <TrendingUp className="w-3 h-3" />
          Active period
        </span>
      )}
    </div>
  );
}

// ── Individual card ───────────────────────────────────────────────────────────

function MarksheetCard({
  card,
  periodId,
}: {
  card: TeacherClassCard;
  periodId: string;
}) {
  const router = useRouter();
  const done = card.totalStudents > 0 && card.enteredCount >= card.totalStudents;
  const missing = card.totalStudents - card.enteredCount;
  const pct =
    card.totalStudents > 0
      ? Math.round((card.enteredCount / card.totalStudents) * 100)
      : 0;

  const href = `/teacher/assessments/marksheet?classId=${card.classId}&subjectId=${card.subjectId}&periodId=${periodId}`;

  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      className={`group relative rounded-xl border transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 flex flex-col gap-0 overflow-hidden text-left w-full
        ${done ? "border-green-300 bg-green-50/40" : "border-border bg-card"}`}
    >
      {/* Status stripe */}
      <div
        className={`h-1 w-full ${
          done
            ? "bg-green-400"
            : pct >= 60
            ? "bg-teal"
            : pct >= 30
            ? "bg-amber-400"
            : "bg-danger"
        }`}
      />

      <div className="p-4 flex flex-col gap-2.5 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-foreground text-sm leading-tight truncate">
              {card.className}
            </p>
            <p className="text-xs text-slate truncate mt-0.5">
              {card.subjectName}
              {card.subjectCode && (
                <span className="ml-1 text-slate/60">· {card.subjectCode}</span>
              )}
            </p>
          </div>
          <div className="shrink-0">
            {done ? (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                <CheckCircle2 className="w-3 h-3" />
                Done
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-200">
                <Clock className="w-3 h-3" />
                {pct}%
              </span>
            )}
          </div>
        </div>

        {/* Progress */}
        <div>
          <div className="flex items-center justify-between text-xs text-slate mb-1">
            <span>Marks entered</span>
            <span className="tabular-nums">
              {card.enteredCount} / {card.totalStudents} students
            </span>
          </div>
          <ProgressBar value={card.enteredCount} max={card.totalStudents} />
        </div>

        {/* Missing marks callout */}
        {!done && missing > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="text-xs text-amber-800 font-medium">
              {missing} student{missing !== 1 ? "s" : ""} missing marks
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-xs text-slate flex items-center gap-1">
            <Users className="w-3 h-3" />
            {card.totalStudents} enrolled
          </span>
          <span
            className={`flex items-center gap-1 text-xs font-medium transition-colors ${
              done
                ? "text-green-600 group-hover:text-green-700"
                : "text-royal group-hover:text-royal/80"
            }`}
          >
            {done ? "Review" : "Enter Marks"}
            <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card animate-pulse overflow-hidden">
      <div className="h-1 bg-line/60" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-line/50 rounded w-2/3" />
        <div className="h-3 bg-line/40 rounded w-1/2" />
        <div className="h-2 bg-line/40 rounded w-full mt-2" />
        <div className="h-8 bg-line/30 rounded" />
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Props {
  periods: PeriodOption[];
  initialPeriodId: string;
}

export default function TeacherMarksheetCards({ periods, initialPeriodId }: Props) {
  const [periodId, setPeriodId] = useState(initialPeriodId);
  const [cards, setCards] = useState<TeacherClassCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCards = useCallback((pid: string) => {
    setCards(null);
    setError(null);
    fetch(`/api/assessments/home/teacher?periodId=${pid}`)
      .then((r) => r.json())
      .then((d) => setCards(d.cards ?? []))
      .catch(() => setError("Failed to load assignments."));
  }, []);

  useEffect(() => {
    loadCards(periodId);
  }, [periodId, loadCards]);

  function handlePeriodChange(id: string) {
    setPeriodId(id);
  }

  return (
    <div className="space-y-5">
      {/* Period selector */}
      {periods.length > 0 && (
        <PeriodSelector
          periods={periods}
          value={periodId}
          onChange={handlePeriodChange}
        />
      )}

      {/* Cards */}
      {error ? (
        <div className="rounded-md bg-danger-bg text-danger text-sm px-3 py-2">{error}</div>
      ) : cards === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <CardSkeleton key={i} />)}
        </div>
      ) : cards.length === 0 ? (
        <EmptyState message="No assignments found for this period. Contact the principal to be assigned." />
      ) : (
        <>
          {/* Quick summary hint */}
          {(() => {
            const complete = cards.filter(
              (c) => c.totalStudents > 0 && c.enteredCount >= c.totalStudents
            ).length;
            const pending = cards.length - complete;
            return pending > 0 ? (
              <p className="text-xs text-slate flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                {pending} assignment{pending !== 1 ? "s" : ""} still need mark entry. Click a card to open the mark sheet.
              </p>
            ) : (
              <p className="text-xs text-slate flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
                All {cards.length} assignments complete for this period.
              </p>
            );
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((card) => (
              <MarksheetCard
                key={`${card.classId}-${card.subjectId}`}
                card={card}
                periodId={periodId}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
