"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Building2,
  Users,
  BedDouble,
  TrendingUp,
  Lock,
  ArrowRight,
  RefreshCw,
  BarChart2,
} from "lucide-react";
import { PageHeader } from "@/components/ui";

interface DormSummary {
  id: string;
  name: string;
  genderPolicy: "BOYS_ONLY" | "GIRLS_ONLY" | "MIXED";
  status: "ACTIVE" | "UNDER_MAINTENANCE" | "CLOSED";
  structure: "OPEN_HALL" | "CUBICLE_BASED";
  allocationPolicy: string;
  capacity: number;
  occupied: number;
  available: number;
  occupancyPct: number;
  isAlmostFull: boolean;
  boardingMasterName: string | null;
}

interface Summary {
  totalDormitories: number;
  activeDormitories: number;
  boardingStudents: number;
  totalSleepingPositions: number;
  occupiedPositions: number;
  availablePositions: number;
  occupancyPct: number;
  dormSummaries: DormSummary[];
  settings: { boardingType: string } | null;
}

export default function TeacherAccommodationView({
  canManageAll: _canManageAll,
  ownDormIds: _ownDormIds,
}: {
  canManageAll: boolean;
  ownDormIds: string[];
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    
    try {
      const res = await fetch("/api/accommodation/summary");
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      } else {
        const errorText = await res.text();
        setError(`API Error ${res.status}: ${errorText || res.statusText}`);
        console.error('API Error:', res.status, res.statusText, errorText);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Network Error: ${errorMsg}`);
      console.error('Network Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="p-8">
        <PageHeader
          title="Accommodation"
          description="Boarding dormitories and occupancy overview."
        />
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Data</h2>
          <p className="text-sm text-red-700 mb-2">{error}</p>
          <button 
            onClick={() => load()}
            className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <PageHeader
          title="Accommodation"
          description="Boarding dormitories and occupancy overview."
          action={
            <div className="h-10 w-10 rounded-lg bg-line/40 dark:bg-dark-border/40 animate-pulse" />
          }
        />
        
        {/* Skeleton stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-line bg-card p-5 dark:bg-dark-surface dark:border-dark-border">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div className="h-8 w-16 bg-line/40 dark:bg-dark-border/40 rounded animate-pulse" />
                  <div className="h-4 w-24 bg-line/40 dark:bg-dark-border/40 rounded animate-pulse" />
                  <div className="h-3 w-20 bg-line/40 dark:bg-dark-border/40 rounded animate-pulse" />
                </div>
                <div className="w-9 h-9 bg-line/40 dark:bg-dark-border/40 rounded-lg animate-pulse" />
              </div>
            </div>
          ))}
        </div>

        {/* Skeleton dorm list header */}
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 w-24 bg-line/40 dark:bg-dark-border/40 rounded animate-pulse" />
        </div>

        {/* Skeleton search bar */}
        <div className="mb-6">
          <div className="h-10 w-80 bg-line/40 dark:bg-dark-border/40 rounded-lg animate-pulse" />
        </div>

        {/* Skeleton dorm cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl border border-line bg-card p-5 dark:bg-dark-surface dark:border-dark-border">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2 flex-1">
                    <div className="h-5 w-32 bg-line/40 dark:bg-dark-border/40 rounded animate-pulse" />
                    <div className="h-3 w-24 bg-line/40 dark:bg-dark-border/40 rounded animate-pulse" />
                  </div>
                  <div className="h-4 w-12 bg-line/40 dark:bg-dark-border/40 rounded animate-pulse" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <div className="h-3 w-20 bg-line/40 dark:bg-dark-border/40 rounded animate-pulse" />
                    <div className="h-3 w-8 bg-line/40 dark:bg-dark-border/40 rounded animate-pulse" />
                  </div>
                  <div className="w-full h-1.5 bg-line/40 dark:bg-dark-border/40 rounded-full animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const isDayOnly = summary?.settings?.boardingType === "DAY_ONLY";

  const filtered = summary?.dormSummaries.filter((d) =>
    !search || d.name.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const GENDER_LABEL: Record<string, string> = {
    BOYS_ONLY: "Boys",
    GIRLS_ONLY: "Girls",
    MIXED: "Mixed",
  };

  const STATUS_COLOR: Record<string, string> = {
    ACTIVE: "text-success",
    UNDER_MAINTENANCE: "text-warn",
    CLOSED: "text-slate",
  };

  return (
    <div>
      <PageHeader
        title="Accommodation"
        description="Boarding dormitories and occupancy overview."
        action={
          <button
            onClick={() => load(true)}
            className="inline-flex items-center justify-center h-10 w-10 rounded-lg border border-line bg-white text-slate hover:text-ink hover:bg-paper transition-all dark:bg-dark-surface dark:border-dark-border"
            aria-label="Refresh accommodation data"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        }
      />

      {isDayOnly ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <Building2 className="h-10 w-10 text-slate" />
          <p className="text-ink font-medium dark:text-dark-text">
            Boarding is not enabled for this school.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-line bg-card p-5 dark:bg-dark-surface dark:border-dark-border">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-semibold text-ink tabular-nums dark:text-dark-text">
                    {summary?.boardingStudents || 0}
                  </p>
                  <p className="text-slate text-sm mt-1 dark:text-dark-muted">Boarding students</p>
                </div>
                <div className="rounded-lg bg-teal/10 p-2">
                  <Users className="h-5 w-5 text-teal" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card p-5 dark:bg-dark-surface dark:border-dark-border">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-semibold text-ink tabular-nums dark:text-dark-text">
                    {summary?.totalDormitories || 0}
                  </p>
                  <p className="text-slate text-sm mt-1 dark:text-dark-muted">Dormitories</p>
                  <p className="text-slate/60 text-xs dark:text-dark-muted/60">
                    {summary?.activeDormitories || 0} active
                  </p>
                </div>
                <div className="rounded-lg bg-teal/10 p-2">
                  <Building2 className="h-5 w-5 text-teal" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card p-5 dark:bg-dark-surface dark:border-dark-border">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-semibold text-ink tabular-nums dark:text-dark-text">
                    {summary?.availablePositions || 0}
                  </p>
                  <p className="text-slate text-sm mt-1 dark:text-dark-muted">Available spaces</p>
                  <p className="text-slate/60 text-xs dark:text-dark-muted/60">
                    of {summary?.totalSleepingPositions || 0} total
                  </p>
                </div>
                <div className="rounded-lg bg-teal/10 p-2">
                  <BedDouble className="h-5 w-5 text-teal" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card p-5 dark:bg-dark-surface dark:border-dark-border">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-semibold text-ink tabular-nums dark:text-dark-text">
                    {summary?.occupancyPct || 0}%
                  </p>
                  <p className="text-slate text-sm mt-1 dark:text-dark-muted">Occupancy rate</p>
                </div>
                <div className="rounded-lg bg-teal/10 p-2">
                  <TrendingUp className="h-5 w-5 text-teal" />
                </div>
              </div>
            </div>
          </div>

          {/* Dormitory list */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-ink dark:text-dark-text">Dormitories</h2>
              <div className="flex items-center gap-2">
                <Link
                  href="/teacher/accommodation-details/analytics"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate hover:text-teal transition-colors border border-line rounded-lg px-3 py-2 bg-white hover:border-teal/40 hover:bg-teal/5 dark:bg-dark-surface dark:border-dark-border dark:text-dark-muted dark:hover:border-teal/30 dark:hover:text-teal"
                >
                  <BarChart2 className="h-3.5 w-3.5" /> Analytics
                </Link>
                <input
                  type="text"
                  placeholder="Search dorms..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/20 dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
                />
              </div>
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-12">
                <Building2 className="h-8 w-8 text-slate/50 mx-auto mb-2" />
                <p className="text-slate text-sm dark:text-dark-muted">
                  {search ? "No dormitories match your search." : "No dormitories registered yet."}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((dorm) => {
                const occupancyColor = dorm.occupancyPct >= 100
                  ? "bg-danger"
                  : dorm.occupancyPct >= 90
                  ? "bg-warn"
                  : "bg-teal";

                return (
                  <Link
                    key={dorm.id}
                    href={`/teacher/accommodation-details/dormitories/${dorm.id}`}
                    className="group rounded-xl border border-line bg-card p-5 hover:border-teal/40 hover:shadow-sm transition-all dark:bg-dark-surface dark:border-dark-border dark:hover:border-teal/30"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-ink group-hover:text-teal transition-colors truncate dark:text-dark-text dark:group-hover:text-teal">
                          {dorm.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate dark:text-dark-muted">
                            {GENDER_LABEL[dorm.genderPolicy]}
                          </span>
                          <span className="text-xs text-slate/40 dark:text-dark-muted/40">•</span>
                          <span className={`text-xs ${STATUS_COLOR[dorm.status]}`}>
                            {dorm.status === "ACTIVE"
                              ? "Active"
                              : dorm.status === "UNDER_MAINTENANCE"
                              ? "Maintenance"
                              : "Closed"}
                          </span>
                        </div>
                        {dorm.boardingMasterName && (
                          <p className="text-xs text-slate mt-1 dark:text-dark-muted">
                            {dorm.boardingMasterName}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate/40 group-hover:text-teal group-hover:translate-x-0.5 transition-all shrink-0 dark:text-dark-muted/40" />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate dark:text-dark-muted">Occupancy</span>
                        <span className="font-medium text-ink tabular-nums dark:text-dark-text">
                          {dorm.occupied}/{dorm.capacity}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-line dark:bg-dark-border overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${occupancyColor}`}
                          style={{ width: `${Math.min(dorm.occupancyPct, 100)}%` }}
                        />
                      </div>
                      {dorm.isAlmostFull && (
                        <div className="flex items-center gap-1 text-xs text-warn">
                          <Lock className="h-3 w-3" />
                          <span>Almost full</span>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
