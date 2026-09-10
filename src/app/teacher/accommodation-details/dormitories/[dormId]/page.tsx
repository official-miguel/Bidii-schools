"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  BedDouble, LayoutGrid,
  ChevronDown, ChevronUp, BarChart2,
} from "lucide-react";
import { ErrorBanner } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Position {
  id: string;
  position: "UPPER" | "LOWER" | null;
  customLabel: string | null;
  isOccupied: boolean;
  allocations: {
    id: string; status: string;
    student: {
      id: string; fullName: string; admissionNumber: string;
      schoolClass: { name: string };
    };
  }[];
}
interface BedDetail {
  id: string; label: string; bedType: string; positions: Position[];
}
interface CubicleDetail {
  id: string; name: string; capacity: number; allocationPolicy: string | null;
  permittedForms: { form: number }[];
  _count: { beds: number; sleepingPositions: number; allocations: number };
}
interface DormDetail {
  id: string; name: string; genderPolicy: string; structure: string;
  status: string; totalCapacity: number; allocationPolicy: string;
  cubiclesInheritPolicy: boolean; description: string | null;
  boardingMaster: { id: string; fullName: string; staffId: string } | null;
  dormCaptain: {
    id: string; fullName: string; admissionNumber: string;
    schoolClass: { name: string };
  } | null;
  permittedForms: { form: number }[];
  cubicles: CubicleDetail[];
  beds: BedDetail[];
  _count: { allocations: number; sleepingPositions: number };
}

const GENDER_LABEL: Record<string, string> = {
  BOYS_ONLY: "Boys", GIRLS_ONLY: "Girls", MIXED: "Mixed",
};
const STATUS_META: Record<string, { label: string; color: string }> = {
  ACTIVE:            { label: "Active",       color: "text-success" },
  UNDER_MAINTENANCE: { label: "Maintenance",  color: "text-warn" },
  CLOSED:            { label: "Closed",       color: "text-slate" },
};

// ── OccupancyBar ──────────────────────────────────────────────────────────────

function OccupancyBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? "bg-danger" : pct >= 90 ? "bg-warn" : "bg-teal";
  return (
    <div className="w-full h-2 rounded-full bg-line overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

// ── ReadOnlyBedCard ───────────────────────────────────────────────────────────

function ReadOnlyBedCard({ bed }: { bed: BedDetail }) {
  const positionLabel = (p: Position) => {
    if (p.position === "UPPER") return "Upper";
    if (p.position === "LOWER") return "Lower";
    if (p.customLabel) return p.customLabel;
    return "Space";
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2 gap-1">
        <span className="text-xs font-semibold text-foreground truncate">
          {bed.label}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-slate font-medium">
          {bed.bedType === "DOUBLE_DECKER" ? "Bunk"
            : bed.bedType === "CUSTOM" ? "Custom"
            : "Single"}
        </span>
      </div>

      <div className="space-y-1">
        {bed.positions.map((pos) => {
          const alloc = pos.allocations[0];
          return (
            <div
              key={pos.id}
              className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs ${
                pos.isOccupied
                  ? "bg-teal/8 border border-teal/20 dark:bg-teal/10"
                  : "bg-slate-50 border border-border/50/30/50"
              }`}
            >
              <span
                className={`font-medium shrink-0 ${
                  pos.isOccupied ? "text-teal" : "text-slate"
                }`}
              >
                {positionLabel(pos)}
              </span>
              {alloc ? (
                <span className="text-foreground truncate min-w-0">
                  {alloc.student.fullName}
                  <span className="text-slate ml-1">
                    · {alloc.student.schoolClass.name}
                  </span>
                </span>
              ) : (
                <span className="text-slate/60">Available space</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ReadOnlyCubicleSection ────────────────────────────────────────────────────

function ReadOnlyCubicleSection({
  cubicle, dormId,
}: {
  cubicle: CubicleDetail;
  dormId: string;
}) {
  const [expanded,    setExpanded]    = useState(false);
  const [beds,        setBeds]        = useState<BedDetail[]>([]);
  const [loadingBeds, setLoadingBeds] = useState(false);

  async function fetchBeds() {
    if (beds.length > 0) { setExpanded((e) => !e); return; }
    setExpanded(true);
    setLoadingBeds(true);
    try {
      const res = await fetch(
        `/api/accommodation/dormitories/${dormId}/beds?cubicleId=${cubicle.id}`
      );
      if (res.ok) setBeds(await res.json());
    } finally {
      setLoadingBeds(false);
    }
  }

  const pct = cubicle._count.sleepingPositions > 0
    ? Math.round((cubicle._count.allocations / cubicle._count.sleepingPositions) * 100) : 0;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={fetchBeds}
        className="w-full flex items-center gap-3 px-4 py-3 bg-card text-left hover:bg-background/60/20 transition-colors"
      >
        <div className="rounded-md bg-teal/10 p-1.5 shrink-0">
          <LayoutGrid className="h-3.5 w-3.5 text-teal" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{cubicle.name}</p>
          <p className="text-xs text-slate">
            {cubicle._count.beds} bed{cubicle._count.beds !== 1 ? "s" : ""} ·{" "}
            {cubicle._count.allocations}/{cubicle._count.sleepingPositions} occupied
          </p>
        </div>
        <div className="w-24 shrink-0">
          <div className="flex items-center gap-1.5">
            <OccupancyBar pct={pct} />
            <span className="text-xs tabular-nums text-slate">{pct}%</span>
          </div>
        </div>
        {expanded
          ? <ChevronUp   className="h-4 w-4 text-slate shrink-0" />
          : <ChevronDown className="h-4 w-4 text-slate shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border bg-background/50/30 p-4">
          {loadingBeds && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 rounded-lg bg-line/40 animate-pulse" />
              ))}
            </div>
          )}
          {!loadingBeds && beds.length === 0 && cubicle._count.beds > 0 && (
            <p className="text-center text-sm text-slate py-6">
              {cubicle._count.beds} bed{cubicle._count.beds !== 1 ? "s" : ""} ·{" "}
              {cubicle._count.sleepingPositions} sleeping position{cubicle._count.sleepingPositions !== 1 ? "s" : ""}.
            </p>
          )}
          {!loadingBeds && beds.length === 0 && cubicle._count.beds === 0 && (
            <p className="text-center text-sm text-slate py-6">
              No beds in this cubicle yet.
            </p>
          )}
          {!loadingBeds && beds.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {beds.map((bed) => (
                <ReadOnlyBedCard key={bed.id} bed={bed} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TeacherDormDetailPage() {
  const { dormId } = useParams<{ dormId: string }>();
  const [dorm,    setDorm]    = useState<DormDetail | null>(null);
  const [beds,    setBeds]    = useState<BedDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/accommodation/dormitories/${dormId}`);
      if (!res.ok) { setError("Dormitory not found."); return; }
      const data = await res.json();
      setDorm(data);
      setBeds(data.beds ?? []);
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }, [dormId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-4 mt-6">
        <div className="h-8 w-48 rounded bg-line/40 animate-pulse" />
        <div className="h-32 rounded-xl bg-line/40 animate-pulse" />
        <div className="h-48 rounded-xl bg-line/40 animate-pulse" />
      </div>
    );
  }

  if (error || !dorm) {
    return (
      <div className="py-12">
        <ErrorBanner message={error ?? "Dormitory not found."} />
      </div>
    );
  }

  const isCubicleBased = dorm.structure === "CUBICLE_BASED";
  const displayCapacity = isCubicleBased
    ? dorm.cubicles.reduce((s, c) => s + c.capacity, 0)
    : dorm.totalCapacity;
  const occupancyPct = displayCapacity > 0
    ? Math.round((dorm._count.allocations / displayCapacity) * 100) : 0;
  const available = Math.max(0, displayCapacity - dorm._count.allocations);
  const statusMeta = STATUS_META[dorm.status] ?? { label: dorm.status, color: "text-slate" };

  return (
    <div>
      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="rounded-xl bg-teal/10 p-3 shrink-0 self-start">
            <BedDouble className="h-7 w-7 text-teal" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-semibold text-foreground">{dorm.name}</h1>
              <span className={`text-xs font-medium ${statusMeta.color}`}>{statusMeta.label}</span>
              <span className="text-xs text-slate border border-border rounded-full px-2 py-0.5">
                {GENDER_LABEL[dorm.genderPolicy]}
              </span>
              <span className="text-xs text-slate border border-border rounded-full px-2 py-0.5">
                {isCubicleBased ? "Cubicle-based" : "Open hall"}
              </span>
            </div>
            {dorm.description && (
              <p className="text-sm text-slate mb-2">{dorm.description}</p>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate">
              {dorm.boardingMaster && (
                <span>
                  <span className="font-medium text-foreground">
                    {dorm.boardingMaster.fullName}
                  </span>
                  {" · Boarding master"}
                </span>
              )}
              {dorm.dormCaptain && (
                <span>
                  <span className="font-medium text-foreground">
                    {dorm.dormCaptain.fullName}
                  </span>
                  {" · Dorm captain · "}
                  {dorm.dormCaptain.schoolClass.name}
                </span>
              )}
            </div>
          </div>
          {/* Analytics shortcut */}
          <Link
            href={`/teacher/accommodation-details/analytics?dormId=${dorm.id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card text-slate text-sm font-medium px-4 py-2 hover:border-teal/40 hover:text-teal hover:bg-teal/5 transition-all shrink-0 dark:hover:border-teal/30 dark:hover:text-teal"
          >
            <BarChart2 className="h-4 w-4" /> Analytics
          </Link>
        </div>

        {/* Occupancy summary */}
        <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total capacity", value: displayCapacity },
            { label: "Occupied",       value: dorm._count.allocations, highlight: dorm._count.allocations === displayCapacity && displayCapacity > 0 },
            { label: "Available",      value: available,                highlight: available === 0 && displayCapacity > 0 },
            { label: "Occupancy",      value: `${occupancyPct}%`,       highlight: occupancyPct >= 90 },
          ].map(({ label, value, highlight }) => (
            <div key={label}>
              <p className={`text-xl font-semibold tabular-nums ${highlight ? "text-warn" : "text-foreground"}`}>
                {value}
              </p>
              <p className="text-xs text-slate">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <OccupancyBar pct={occupancyPct} />
        </div>
      </div>

      {/* Structure section — read-only */}
      {isCubicleBased ? (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground">
              Cubicles{" "}
              <span className="text-slate font-normal ml-1 text-sm">
                ({dorm.cubicles.length})
              </span>
            </h2>
          </div>

          {dorm.cubicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center rounded-xl border border-dashed border-border">
              <LayoutGrid className="h-8 w-8 text-slate/50" />
              <p className="text-slate text-sm">
                No cubicles configured for this dormitory yet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {dorm.cubicles.map((c) => (
                <ReadOnlyCubicleSection key={c.id} cubicle={c} dormId={dormId} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground">
              Beds{" "}
              <span className="text-slate font-normal ml-1 text-sm">
                ({beds.length})
              </span>
            </h2>
          </div>

          {beds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center rounded-xl border border-dashed border-border">
              <BedDouble className="h-8 w-8 text-slate/50" />
              <p className="text-slate text-sm">
                No beds configured for this dormitory yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {beds.map((bed) => (
                <ReadOnlyBedCard key={bed.id} bed={bed} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
