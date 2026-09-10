"use client";

/**
 * AccommodationProfileCard
 *
 * Self-contained card dropped into StudentProfile. Fetches the student's
 * current and historical accommodation allocations independently so it adds
 * zero load to the existing profile API.
 *
 * Shows:
 *  - Current dorm, cubicle/room, bed, sleeping position, boarding master,
 *    dorm captain, allocation date, and status badge.
 *  - Compact history list of past allocations (vacated / transferred).
 *  - "Allocate / Transfer" quick-link for principal role.
 *  - Nothing (hidden) when boarding type is DAY_ONLY or student has no history.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BedDouble, Building2, LayoutGrid, Calendar, ArrowRight,
  Clock, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AllocationRecord {
  id: string;
  status: "CURRENT" | "VACATED" | "TRANSFERRED";
  allocationDate: string;
  vacatedDate: string | null;
  notes: string | null;
  dorm: { id: string; name: string };
  cubicle: { id: string; name: string } | null;
  bed: { id: string; label: string; bedType: string } | null;
  sleepingPosition: { id: string; position: string | null; customLabel: string | null } | null;
  allocatedBy: { email: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function posLabel(p: { position: string | null; customLabel: string | null } | null): string {
  if (!p) return "";
  if (p.position === "UPPER") return " · Upper";
  if (p.position === "LOWER") return " · Lower";
  if (p.customLabel) return ` · ${p.customLabel}`;
  return "";
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
}

const STATUS_STYLE: Record<string, string> = {
  CURRENT:     "bg-success/10 text-success border-success/20",
  VACATED:     "bg-slate-100 text-slate border-border",
  TRANSFERRED: "bg-teal/8 text-teal border-teal/20",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AccommodationProfileCard({
  studentId,
  role = "principal",
}: {
  studentId: string;
  role?: "principal" | "teacher" | "staff";
}) {
  const [records, setRecords] = useState<AllocationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetch(`/api/accommodation/allocations/${studentId}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: AllocationRecord[]) => setRecords(data))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [studentId]);

  // Don't render anything while loading to avoid layout shift
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 animate-pulse">
        <div className="h-4 w-32 bg-line/60 rounded mb-4" />
        <div className="h-16 bg-line/40 rounded-lg" />
      </div>
    );
  }

  // No records at all — don't render the card
  if (records.length === 0) return null;

  const current = records.find((r) => r.status === "CURRENT");
  const history = records.filter((r) => r.status !== "CURRENT");

  return (
    <div className="bg-card border border-border rounded-xl p-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-teal/10 p-1.5">
            <BedDouble className="h-4 w-4 text-teal" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">Accommodation</h2>
        </div>
        {role === "principal" && (
          <Link
            href="/principal/accommodation/allocations"
            className="inline-flex items-center gap-1 text-xs text-teal font-medium hover:underline"
          >
            {current ? "Transfer" : "Allocate"}
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* ── Current allocation ─────────────────────────────────────────── */}
      {current ? (
        <div className="rounded-xl border border-teal/20 bg-teal/5 dark:bg-teal/8 dark:border-teal/20 p-4">
          {/* Status + dorm name */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <Link
                href={`/principal/accommodation/dormitories/${current.dorm.id}`}
                className="text-base font-semibold text-foreground hover:text-teal transition-colors dark:hover:text-teal"
              >
                {current.dorm.name}
              </Link>
              {(current.cubicle || current.bed) && (
                <p className="text-xs text-slate mt-0.5">
                  {current.cubicle && (
                    <span className="inline-flex items-center gap-1 mr-2">
                      <LayoutGrid className="h-3 w-3" />
                      {current.cubicle.name}
                    </span>
                  )}
                  {current.bed && (
                    <span className="inline-flex items-center gap-1">
                      <BedDouble className="h-3 w-3" />
                      {current.bed.label}{posLabel(current.sleepingPosition)}
                    </span>
                  )}
                </p>
              )}
            </div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${STATUS_STYLE.CURRENT}`}>
              Boarding
            </span>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div className="flex items-center gap-1.5 text-slate">
              <Calendar className="h-3 w-3 shrink-0" />
              <span>Since {fmt(current.allocationDate)}</span>
            </div>
            {current.bed && (
              <div className="flex items-center gap-1.5 text-slate">
                <BedDouble className="h-3 w-3 shrink-0" />
                <span className="capitalize">
                  {current.bed.bedType === "DOUBLE_DECKER" ? "Bunk bed" :
                   current.bed.bedType === "CUSTOM" ? "Custom bed" : "Single bed"}
                </span>
              </div>
            )}
            {current.notes && (
              <div className="col-span-2 flex items-start gap-1.5 text-slate">
                <span className="shrink-0 mt-0.5">📝</span>
                <span className="italic">{current.notes}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-background/30 px-4 py-3 text-sm text-slate">
          Not currently allocated to any dormitory.
        </div>
      )}

      {/* ── History toggle ──────────────────────────────────────────────── */}
      {history.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            className="flex items-center gap-1.5 text-xs text-slate hover:text-foreground transition-colors font-medium"
          >
            <Clock className="h-3.5 w-3.5" />
            {history.length} previous allocation{history.length !== 1 ? "s" : ""}
            {showHistory
              ? <ChevronUp className="h-3 w-3 ml-0.5" />
              : <ChevronDown className="h-3 w-3 ml-0.5" />}
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2">
              {history.map((r) => (
                <div key={r.id}
                  className="rounded-lg border border-border px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Building2 className="h-3 w-3 text-slate shrink-0" />
                        <span className="text-sm font-medium text-foreground">{r.dorm.name}</span>
                        {r.cubicle && (
                          <span className="text-xs text-slate">· {r.cubicle.name}</span>
                        )}
                        {r.bed && (
                          <span className="text-xs text-slate">
                            · {r.bed.label}{posLabel(r.sleepingPosition)}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate/70/70 mt-0.5">
                        {fmt(r.allocationDate)}
                        {r.vacatedDate ? ` → ${fmt(r.vacatedDate)}` : ""}
                      </p>
                      {r.notes && (
                        <p className="text-[11px] text-slate mt-0.5 italic">{r.notes}</p>
                      )}
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border shrink-0 ${STATUS_STYLE[r.status]}`}>
                      {r.status === "TRANSFERRED" ? "Transferred" : "Vacated"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
