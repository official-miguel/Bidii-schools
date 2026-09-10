"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TeacherClassCard } from "@/app/api/assessments/home/teacher/route";
import { EmptyState } from "@/components/ui";
import { SkeletonCard } from "@/components/ui/ProgressivePage";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  BookOpen,
  Users,
  ChevronRight,
  TrendingUp,
} from "lucide-react";

interface TeacherHomeData {
  cards: TeacherClassCard[];
  currentPeriod: { id: string; name: string } | null;
}

// ── Progress bar used inside each card ────────────────────────────────────────
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

// ── Summary stat tile ─────────────────────────────────────────────────────────
interface StatTileProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accent: string; // tailwind bg + text classes
  sub?: string;
}
function StatTile({ label, value, icon, accent, sub }: StatTileProps) {
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${accent}`}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
        <p className="text-xs font-medium mt-0.5 opacity-80">{label}</p>
        {sub && <p className="text-[11px] mt-0.5 opacity-60">{sub}</p>}
      </div>
    </div>
  );
}

// ── Individual assignment card ────────────────────────────────────────────────
function AssignmentCard({ card }: { card: TeacherClassCard }) {
  const done = card.totalStudents > 0 && card.enteredCount >= card.totalStudents;
  const missing = card.totalStudents - card.enteredCount;
  const pct =
    card.totalStudents > 0
      ? Math.round((card.enteredCount / card.totalStudents) * 100)
      : 0;

  const statusColour = done
    ? "border-green-300 bg-green-50/40"
    : missing > 0
    ? "border-border bg-card"
    : "border-border bg-card";

  return (
    <Link
      href={`/teacher/assessments/marksheet?classId=${card.classId}&subjectId=${card.subjectId}`}
      className={`group relative rounded-xl border transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 flex flex-col gap-0 overflow-hidden ${statusColour}`}
    >
      {/* Status stripe */}
      <div
        className={`h-1 w-full ${
          done ? "bg-green-400" : pct >= 60 ? "bg-teal" : pct >= 30 ? "bg-amber-400" : "bg-danger"
        }`}
      />

      <div className="p-4 flex flex-col gap-2.5 flex-1">
        {/* Header row */}
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
          <div className="flex items-center gap-1.5 shrink-0">
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

        {/* Progress bar */}
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

        {/* Footer CTA */}
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
    </Link>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function TeacherHome() {
  const [data, setData] = useState<TeacherHomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/assessments/home/teacher")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Failed to load your assignments."));
  }, []);

  if (error) {
    return (
      <div className="rounded-md bg-danger-bg text-danger text-sm px-3 py-2">{error}</div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        {/* Skeleton tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-line/40 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} className="h-44" />
          ))}
        </div>
      </div>
    );
  }

  if (!data.currentPeriod) {
    return (
      <EmptyState message="No active assessment period. Ask the principal to set a current period." />
    );
  }

  if (data.cards.length === 0) {
    return (
      <EmptyState message="You have no class/subject assignments yet. Contact the principal to be assigned." />
    );
  }

  // ── Compute summary stats ─────────────────────────────────────────────────
  const total = data.cards.length;
  const complete = data.cards.filter(
    (c) => c.totalStudents > 0 && c.enteredCount >= c.totalStudents
  ).length;
  const pending = total - complete;
  const totalMissing = data.cards.reduce(
    (sum, c) => sum + Math.max(0, c.totalStudents - c.enteredCount),
    0
  );
  const totalStudents = data.cards.reduce(
    (sum, c) => sum + c.totalStudents,
    0
  );

  return (
    <div className="space-y-5">
      {/* Period badge */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal bg-teal/10 rounded-full px-3 py-1">
          <TrendingUp className="w-3.5 h-3.5" />
          Active period: {data.currentPeriod.name}
        </span>
      </div>

      {/* Summary stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label="Total assignments"
          value={total}
          icon={<BookOpen className="w-5 h-5 text-royal" />}
          accent="bg-blue-50 border-blue-200 text-blue-900"
          sub={`${data.cards.length} class–subject pair${total !== 1 ? "s" : ""}`}
        />
        <StatTile
          label="Complete"
          value={complete}
          icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
          accent="bg-green-50 border-green-200 text-green-900"
          sub={total > 0 ? `${Math.round((complete / total) * 100)}% done` : "—"}
        />
        <StatTile
          label="Pending"
          value={pending}
          icon={<Clock className="w-5 h-5 text-amber-600" />}
          accent={
            pending > 0
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : "bg-background border-border text-slate"
          }
          sub={pending > 0 ? "need mark entry" : "All done!"}
        />
        <StatTile
          label="Missing marks"
          value={totalMissing}
          icon={<AlertCircle className="w-5 h-5 text-danger" />}
          accent={
            totalMissing > 0
              ? "bg-red-50 border-red-200 text-red-900"
              : "bg-background border-border text-slate"
          }
          sub={`across ${totalStudents} enrolled`}
        />
      </div>

      {/* Filter hint when there are incomplete assignments */}
      {pending > 0 && (
        <p className="text-xs text-slate flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
          Incomplete assignments shown first. Click a card to enter or review marks.
        </p>
      )}

      {/* Assignment cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.cards.map((card) => (
          <AssignmentCard
            key={`${card.classId}-${card.subjectId}`}
            card={card}
          />
        ))}
      </div>
    </div>
  );
}
