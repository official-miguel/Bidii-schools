"use client";

/**
 * HODDepartmentMarksheetCards
 *
 * Shown in the "My Department" tab on the Mark Sheets landing page for HODs.
 *
 * Features:
 *   - Period selector (same as TeacherMarksheetCards)
 *   - Filter bar: Form → Class → Subject
 *   - Cards grid showing all (class × subject) pairs in the HOD's department
 *   - Each card navigates to the same mark sheet grid used by regular teachers
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Users,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  Filter,
  X,
  UserCheck,
} from "lucide-react";
import { EmptyState } from "@/components/ui";
import type { HODDeptCard } from "@/app/api/assessments/home/hod-department/route";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PeriodOption {
  id: string;
  name: string;
  academicYear: string;
  term: number | null;
  isCurrent: boolean;
}

interface HODDepartmentMarksheetCardsProps {
  periods: PeriodOption[];
  initialPeriodId: string;
  departmentName: string;
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

// ── Filter bar ────────────────────────────────────────────────────────────────

interface FilterState {
  form: string;
  classId: string;
  subjectId: string;
}

function FilterBar({
  cards,
  filters,
  onChange,
}: {
  cards: HODDeptCard[];
  filters: FilterState;
  onChange: (f: FilterState) => void;
}) {
  // Derive available options from loaded cards
  const forms = useMemo(() => {
    const formNums = new Set<number>();
    // Infer form from className (e.g. "Form 3 North" or "3 North")
    for (const c of cards) {
      const m = c.className.match(/\d+/);
      if (m) formNums.add(parseInt(m[0], 10));
    }
    return [...formNums].sort((a, b) => a - b);
  }, [cards]);

  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of cards) seen.set(c.classId, c.className);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [cards]);

  const subjects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of cards) seen.set(c.subjectId, c.subjectName);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [cards]);

  const hasActiveFilter = filters.form || filters.classId || filters.subjectId;

  function clear() {
    onChange({ form: "", classId: "", subjectId: "" });
  }

  const selectClass = "appearance-none rounded-lg border border-border bg-card pl-3 pr-7 py-2 text-sm text-foreground focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/15 transition-colors";

  return (
    <div className="flex flex-wrap gap-2 items-end rounded-xl border border-border bg-background/60 px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate mr-1">
        <Filter className="w-3.5 h-3.5" />
        Filter
      </div>

      {/* Form filter */}
      <div className="relative">
        <select
          value={filters.form}
          onChange={(e) => onChange({ ...filters, form: e.target.value, classId: "" })}
          className={selectClass}
          style={{ minWidth: 100 }}
        >
          <option value="">All forms</option>
          {forms.map((f) => (
            <option key={f} value={String(f)}>Form {f}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate" />
      </div>

      {/* Class filter */}
      <div className="relative">
        <select
          value={filters.classId}
          onChange={(e) => onChange({ ...filters, classId: e.target.value })}
          className={selectClass}
          style={{ minWidth: 150 }}
        >
          <option value="">All classes</option>
          {classes.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate" />
      </div>

      {/* Subject filter */}
      <div className="relative">
        <select
          value={filters.subjectId}
          onChange={(e) => onChange({ ...filters, subjectId: e.target.value })}
          className={selectClass}
          style={{ minWidth: 170 }}
        >
          <option value="">All subjects</option>
          {subjects.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate" />
      </div>

      {/* Clear */}
      {hasActiveFilter && (
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 text-xs text-slate hover:text-foreground transition-colors px-2 py-1.5 rounded-lg border border-border bg-card"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}
    </div>
  );
}

// ── Individual card ───────────────────────────────────────────────────────────

function HODMarksheetCard({
  card,
  periodId,
}: {
  card: HODDeptCard;
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

        {/* Assigned teacher */}
        {card.teacherName && (
          <div className="flex items-center gap-1.5 text-xs text-slate">
            <UserCheck className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{card.teacherName}</span>
          </div>
        )}
        {!card.teacherName && (
          <div className="flex items-center gap-1.5 text-xs text-slate/60 italic">
            <UserCheck className="w-3.5 h-3.5 shrink-0" />
            <span>No teacher assigned</span>
          </div>
        )}

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
            {done ? "Review" : "View Marks"}
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

export default function HODDepartmentMarksheetCards({
  periods,
  initialPeriodId,
  departmentName,
}: HODDepartmentMarksheetCardsProps) {
  const [periodId, setPeriodId] = useState(initialPeriodId);
  const [allCards, setAllCards] = useState<HODDeptCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    form: "",
    classId: "",
    subjectId: "",
  });

  const loadCards = useCallback((pid: string) => {
    setAllCards(null);
    setError(null);
    fetch(`/api/assessments/home/hod-department?periodId=${pid}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setAllCards(d.cards ?? []);
      })
      .catch(() => setError("Failed to load department assignments."));
  }, []);

  useEffect(() => {
    loadCards(periodId);
  }, [periodId, loadCards]);

  // Apply client-side filters
  const filteredCards = useMemo(() => {
    if (!allCards) return null;
    return allCards.filter((c) => {
      if (filters.classId && c.classId !== filters.classId) return false;
      if (filters.subjectId && c.subjectId !== filters.subjectId) return false;
      if (filters.form) {
        const m = c.className.match(/\d+/);
        const cardForm = m ? String(parseInt(m[0], 10)) : "";
        if (cardForm !== filters.form) return false;
      }
      return true;
    });
  }, [allCards, filters]);

  function handlePeriodChange(id: string) {
    setPeriodId(id);
  }

  const displayedCards = filteredCards;

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

      {/* Filter bar — only shown once cards load */}
      {allCards !== null && allCards.length > 0 && (
        <FilterBar
          cards={allCards}
          filters={filters}
          onChange={setFilters}
        />
      )}

      {/* Cards */}
      {error ? (
        <div className="rounded-md bg-danger-bg text-danger text-sm px-3 py-2">{error}</div>
      ) : displayedCards === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <CardSkeleton key={i} />)}
        </div>
      ) : displayedCards.length === 0 ? (
        <EmptyState
          message={
            filters.classId || filters.subjectId || filters.form
              ? "No assignments match the selected filters."
              : `No mark sheet assignments found for ${departmentName || "your department"}.`
          }
        />
      ) : (
        <>
          {/* Quick summary */}
          {(() => {
            const complete = displayedCards.filter(
              (c) => c.totalStudents > 0 && c.enteredCount >= c.totalStudents
            ).length;
            const pending = displayedCards.length - complete;
            return (
              <p className="text-xs text-slate flex items-center gap-1.5">
                {pending > 0 ? (
                  <>
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                    {pending} assignment{pending !== 1 ? "s" : ""} still need mark entry
                    {displayedCards.length !== allCards?.length && (
                      <span className="text-slate/60">
                        {" "}(showing {displayedCards.length} of {allCards?.length})
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
                    All {displayedCards.length} assignments complete for this period
                  </>
                )}
              </p>
            );
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedCards.map((card) => (
              <HODMarksheetCard
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
