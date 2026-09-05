"use client";

/**
 * QuickOverviewGrid
 *
 * Four metric tiles in a 2×2 (mobile) / 1×4 (desktop) grid.
 * Each tile mirrors the design mockup:
 *   - Small caps label
 *   - Large value
 *   - Sub-label / description
 *   - Right-edge icon
 *   - Tappable → navigates to detail page
 *   - Optional inline sparkline (SVG) for Attendance
 *
 * Props are plain serialisable values so the parent server component
 * can pass them directly without a context.
 */

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  TrendingUp,
  BarChart2,
  ClipboardList,
  Wallet,
} from "lucide-react";

interface AttendanceSparkPoint { present: boolean }

export interface QuickOverviewData {
  attendance: {
    pct:     number | null;
    present: number;
    absent:  number;
    spark:   AttendanceSparkPoint[]; // last ~10 data points
    href:    string;
  };
  academic: {
    grade:   string | null;  // e.g. "B+"
    label:   string;         // e.g. "Overall grade"
    href:    string;
  };
  assignments: {
    count:   number;
    label:   string;  // e.g. "Need attention"
    href:    string;
  };
  fees: {
    display: string;  // e.g. "KES 15,964.29"
    label:   string;  // e.g. "Outstanding balance"
    owed:    boolean;
    href:    string;
  };
}

// ── Tiny SVG sparkline ────────────────────────────────────────────────────────
function AttendanceSparkline({ points }: { points: AttendanceSparkPoint[] }) {
  if (!points.length) return null;
  const w = 80;
  const h = 28;
  const step = w / Math.max(points.length - 1, 1);
  const coords = points.map((p, i) => ({
    x: i * step,
    y: p.present ? 4 : h - 4,
  }));
  const d = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  const fillD = `${d} L${coords[coords.length - 1].x},${h} L${coords[0].x},${h} Z`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="overflow-visible">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#17B26A" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#17B26A" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillD} fill="url(#spark-fill)" />
      <path d={d} fill="none" stroke="#17B26A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Single tile ───────────────────────────────────────────────────────────────
function Tile({
  label,
  children,
  href,
  icon: Icon,
  iconBg,
  iconColor,
}: {
  label:      string;
  children:   React.ReactNode;
  href:       string;
  icon:       LucideIcon;
  iconBg:     string;
  iconColor:  string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-2 bg-white dark:bg-dark-surface border border-line
                 dark:border-dark-border rounded-2xl p-4 shadow-xs
                 hover:border-teal/40 hover:shadow-sm transition-all duration-150 group"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate dark:text-dark-muted">
          {label}
        </p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
          <Icon className={`h-4 w-4 ${iconColor}`} strokeWidth={1.8} />
        </div>
      </div>
      {children}
      <span className="text-[11px] text-teal font-medium opacity-0 group-hover:opacity-100 transition-opacity">
        View details →
      </span>
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function QuickOverviewGrid({ data }: { data: QuickOverviewData }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

      {/* Attendance */}
      <Tile
        label="Attendance (30 Days)"
        href={data.attendance.href}
        icon={TrendingUp}
        iconBg="bg-[#EDFAF4]"
        iconColor="text-[#17B26A]"
      >
        <p className="text-3xl font-bold text-[#17B26A] leading-none">
          {data.attendance.pct != null ? `${data.attendance.pct}%` : "—"}
        </p>
        <AttendanceSparkline points={data.attendance.spark} />
        <p className="text-xs text-slate dark:text-dark-muted -mt-1">
          {data.attendance.present} Present · {data.attendance.absent} Absent
        </p>
      </Tile>

      {/* Academic performance */}
      <Tile
        label="Academic Performance"
        href={data.academic.href}
        icon={BarChart2}
        iconBg="bg-[#F3EEFF]"
        iconColor="text-[#7B5EA7]"
      >
        <p className={`text-3xl font-bold leading-none ${data.academic.grade ? "text-[#7B5EA7]" : "text-slate"}`}>
          {data.academic.grade ?? "—"}
        </p>
        <p className="text-xs text-slate dark:text-dark-muted">{data.academic.label}</p>
      </Tile>

      {/* Assignments */}
      <Tile
        label="Assignments"
        href={data.assignments.href}
        icon={ClipboardList}
        iconBg="bg-[#FFF3E8]"
        iconColor="text-[#F79009]"
      >
        <p className={`text-3xl font-bold leading-none ${data.assignments.count > 0 ? "text-[#F79009]" : "text-[#17B26A]"}`}>
          {data.assignments.count}
        </p>
        <p className="text-xs text-slate dark:text-dark-muted">{data.assignments.label}</p>
      </Tile>

      {/* School fees */}
      <Tile
        label="School Fees"
        href={data.fees.href}
        icon={Wallet}
        iconBg="bg-[#FEF3F2]"
        iconColor="text-[#F04438]"
      >
        <div>
          <p className="text-[10px] text-slate dark:text-dark-muted uppercase font-semibold tracking-wider">KES</p>
          <p className={`text-2xl font-bold leading-none ${data.fees.owed ? "text-[#F04438]" : "text-[#17B26A]"}`}>
            {data.fees.display.replace("KES ", "")}
          </p>
        </div>
        <p className={`text-xs font-medium ${data.fees.owed ? "text-[#F04438]" : "text-[#17B26A]"}`}>
          {data.fees.label}
        </p>
      </Tile>

    </div>
  );
}
