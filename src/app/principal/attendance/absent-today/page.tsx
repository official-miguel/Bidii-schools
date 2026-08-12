"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { UserX, TrendingDown, TrendingUp, Minus, Search } from "lucide-react";
import {
  PageHeader,
  EmptyState,
  Avatar,
  Badge,
  ProgressBar,
  inputClass,
  premiumTableContainerClass,
  premiumTheadClass,
  premiumThClass,
  premiumTdClass,
  premiumTrClass,
} from "@/components/ui";

// ── Types ────────────────────────────────────────────────────────────────────

type Trend = { present: number; absent: number; rate: number | null };

type AbsentStudent = {
  studentId:       string;
  fullName:        string;
  admissionNumber: string;
  classId:         string;
  className:       string;
  form:            number;
  stream:          string | null;
  trend:           Trend;
};

type AbsentTodayData = {
  date:     string;
  total:    number;
  students: AbsentStudent[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    year:    "numeric",
    month:   "long",
    day:     "numeric",
  });
}

function rateColor(rate: number | null): string {
  if (rate === null) return "text-slate";
  if (rate >= 90)    return "text-success";
  if (rate >= 75)    return "text-warn";
  return "text-danger";
}

function TrendIcon({ rate }: { rate: number | null }) {
  if (rate === null)  return <Minus  className="h-3.5 w-3.5 text-slate" />;
  if (rate >= 90)     return <TrendingUp   className="h-3.5 w-3.5 text-success" />;
  if (rate >= 75)     return <Minus        className="h-3.5 w-3.5 text-warn" />;
  return               <TrendingDown  className="h-3.5 w-3.5 text-danger" />;
}

function TrendBadge({ trend }: { trend: Trend }) {
  const { rate } = trend;
  if (rate === null) {
    return <span className="text-xs text-slate italic">No data</span>;
  }
  const variant =
    rate >= 90 ? "success" : rate >= 75 ? "warn" : "danger";
  return (
    <div className="flex items-center gap-1.5">
      <TrendIcon rate={rate} />
      <span className={`text-sm font-semibold tabular-nums ${rateColor(rate)}`}>
        {rate}%
      </span>
      <ProgressBar
        value={rate}
        size="sm"
        variant={variant}
        className="w-16"
      />
    </div>
  );
}

// ── Summary stat cards ────────────────────────────────────────────────────────

function SummaryCards({
  total,
  students,
  date,
}: {
  total: number;
  students: AbsentStudent[];
  date: string;
}) {
  const chronic = students.filter(
    (s) => s.trend.rate !== null && s.trend.rate < 75
  ).length;

  const atRisk = students.filter(
    (s) => s.trend.rate !== null && s.trend.rate >= 75 && s.trend.rate < 90
  ).length;

  const classCount = new Set(students.map((s) => s.classId)).size;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {[
        {
          label: "Absent today",
          value: total,
          cls: total > 0 ? "text-danger" : "text-ink",
          sub: formatDate(date),
        },
        {
          label: "Classes affected",
          value: classCount,
          cls: "text-ink",
          sub: "with at least 1 absence",
        },
        {
          label: "Chronic (<75%)",
          value: chronic,
          cls: chronic > 0 ? "text-danger" : "text-success",
          sub: "30-day attendance rate",
        },
        {
          label: "At risk (75–89%)",
          value: atRisk,
          cls: atRisk > 0 ? "text-warn" : "text-success",
          sub: "30-day attendance rate",
        },
      ].map((c) => (
        <div
          key={c.label}
          className="bg-card border border-line rounded-xl p-4 shadow-sm dark:bg-dark-surface dark:border-dark-border"
        >
          <p className={`text-2xl font-semibold ${c.cls}`}>{c.value}</p>
          <p className="text-xs font-semibold text-slate mt-1 uppercase tracking-wide">
            {c.label}
          </p>
          {c.sub && <p className="text-xs text-slate/70 mt-0.5">{c.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ── By-class group header ─────────────────────────────────────────────────────

function ClassGroupHeader({
  className,
  absentCount,
}: {
  className: string;
  absentCount: number;
}) {
  return (
    <tr className="bg-slate-50/70 dark:bg-dark-surface/50">
      <td
        colSpan={5}
        className="px-5 py-2.5 text-xs font-semibold text-slate uppercase tracking-wider border-b border-line"
      >
        <span className="text-ink font-bold">{className}</span>
        <span className="ml-2 text-slate">
          — {absentCount} absent
        </span>
      </td>
    </tr>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

export default function AbsentTodayPage() {
  const [data, setData]       = useState<AbsentTodayData | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState("");
  const [groupBy, setGroupBy] = useState<"class" | "flat">("class");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/attendance?absentToday=1", { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          setError(body.error ?? "Couldn't load absent students.");
          return;
        }
        setData(body);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError("Couldn't load absent students.");
        }
      });
    return () => controller.abort();
  }, []);

  // Filter by search term across name, admission number, or class
  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.students;
    return data.students.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.admissionNumber.toLowerCase().includes(q) ||
        s.className.toLowerCase().includes(q)
    );
  }, [data, search]);

  // Group by class for the default view
  const grouped = useMemo(() => {
    const map = new Map<string, { className: string; students: AbsentStudent[] }>();
    for (const s of filtered) {
      const existing = map.get(s.classId);
      if (existing) {
        existing.students.push(s);
      } else {
        map.set(s.classId, { className: s.className, students: [s] });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.className.localeCompare(b.className, undefined, { numeric: true })
    );
  }, [filtered]);

  // ── Loading / error ──────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-danger-bg border border-danger/20 text-danger text-sm px-4 py-3">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-line/40" />
            ))}
          </div>
          <div className="h-64 rounded-xl bg-line/40" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Absent Today"
        description={`Students marked absent on ${formatDate(data.date)}.`}
      />

      <SummaryCards total={data.total} students={data.students} date={data.date} />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate pointer-events-none" />
          <input
            type="search"
            placeholder="Search name, class or adm. no."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} pl-9`}
            aria-label="Search absent students"
          />
        </div>

        {/* Group toggle */}
        <div className="flex items-center gap-1 p-1 bg-paper border border-line rounded-lg self-start sm:self-auto">
          {(["class", "flat"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setGroupBy(v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-100 ${
                groupBy === v
                  ? "bg-teal text-white shadow-xs"
                  : "text-slate hover:text-ink"
              }`}
            >
              {v === "class" ? "By class" : "All students"}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {data.total === 0 ? (
        <EmptyState
          message="No absences recorded today. Everyone is present — or attendance hasn't been taken yet."
          icon={<UserX className="h-6 w-6" />}
        />
      ) : filtered.length === 0 ? (
        <EmptyState message="No students match your search." />
      ) : groupBy === "class" ? (
        /* ── Grouped view ──────────────────────────────────────────────── */
        <div className={`${premiumTableContainerClass} overflow-x-auto`}>
          <table className="w-full text-sm min-w-[600px]">
            <thead className={premiumTheadClass}>
              <tr>
                <th className={premiumThClass}>Student</th>
                <th className={premiumThClass}>Adm. No.</th>
                <th className={premiumThClass}>Form</th>
                <th className={`${premiumThClass} min-w-[180px]`}>30-day trend</th>
                <th className={premiumThClass}></th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ className, students: groupStudents }) => (
                <>
                  <ClassGroupHeader
                    key={`hdr-${className}`}
                    className={className}
                    absentCount={groupStudents.length}
                  />
                  {groupStudents.map((s) => (
                    <StudentRow key={s.studentId} student={s} />
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Flat view ─────────────────────────────────────────────────── */
        <div className={`${premiumTableContainerClass} overflow-x-auto`}>
          <table className="w-full text-sm min-w-[600px]">
            <thead className={premiumTheadClass}>
              <tr>
                <th className={premiumThClass}>Student</th>
                <th className={premiumThClass}>Adm. No.</th>
                <th className={premiumThClass}>Class</th>
                <th className={`${premiumThClass} min-w-[180px]`}>30-day trend</th>
                <th className={premiumThClass}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <StudentRow key={s.studentId} student={s} showClass />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer hint */}
      {data.total > 0 && (
        <p className="text-xs text-slate text-center pb-2">
          Showing {filtered.length} of {data.total} absent students.{" "}
          <Link href="/principal/attendance" className="text-teal hover:underline">
            View full attendance page →
          </Link>
        </p>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StudentRow({
  student: s,
  showClass = false,
}: {
  student: AbsentStudent;
  showClass?: boolean;
}) {
  const trendDays = s.trend.present + s.trend.absent;

  return (
    <tr className={premiumTrClass}>
      {/* Name + avatar */}
      <td className={premiumTdClass}>
        <div className="flex items-center gap-3">
          <Avatar name={s.fullName} size="sm" />
          <Link
            href={`/principal/students/${s.studentId}`}
            className="font-medium text-ink hover:text-teal transition-colors"
          >
            {s.fullName}
          </Link>
        </div>
      </td>

      {/* Admission number */}
      <td className={`${premiumTdClass} text-slate tabular-nums`}>
        {s.admissionNumber}
      </td>

      {/* Class (flat view) OR Form (grouped view) */}
      {showClass ? (
        <td className={premiumTdClass}>
          <Badge variant="default">{s.className}</Badge>
        </td>
      ) : (
        <td className={`${premiumTdClass} text-slate`}>
          Form {s.form}
          {s.stream && (
            <span className="ml-1 text-xs text-slate/60">{s.stream}</span>
          )}
        </td>
      )}

      {/* 30-day trend */}
      <td className={premiumTdClass}>
        {trendDays === 0 ? (
          <span className="text-xs text-slate italic">No history</span>
        ) : (
          <div className="space-y-0.5">
            <TrendBadge trend={s.trend} />
            <p className="text-[11px] text-slate/70 tabular-nums">
              {s.trend.present}P / {s.trend.absent}A in last 30 days
            </p>
          </div>
        )}
      </td>

      {/* View profile link */}
      <td className={`${premiumTdClass} text-right`}>
        <Link
          href={`/principal/students/${s.studentId}`}
          className="text-xs text-teal hover:underline whitespace-nowrap"
          aria-label={`View profile for ${s.fullName}`}
        >
          View profile
        </Link>
      </td>
    </tr>
  );
}
