"use client";

import { memo, useMemo, useState } from "react";
import type { TeacherRankResult } from "@/lib/assessment/teacherRanking";
import { Chip, ProgressBar } from "@/components/ui";
import { ArrowUp, ArrowDown, Minus, ArrowUpDown } from "lucide-react";
import { RankIconSmall } from "./RankIcon";

interface StaffRankTableProps {
  rows: TeacherRankResult[];
  highlightTeacherId?: string;
  /** Hide the Department column when viewing a single-dept table. */
  showDepartmentColumn?: boolean;
}

type SortKey = "rank" | "subject" | "department" | "trend" | "completion";

// ── Medal for top 3 ───────────────────────────────────────────────────────────
const RankCell = memo(function RankCell({ rank }: { rank: number }) {
  return <RankIconSmall rank={rank} />;
});

// ── Trend arrow ───────────────────────────────────────────────────────────────
const TrendCell = memo(function TrendCell({ dir }: { dir: 1 | 0 | -1 }) {
  if (dir === 1)
    return (
      <div className="inline-flex items-center gap-1 text-success">
        <ArrowUp className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Up</span>
      </div>
    );
  if (dir === -1)
    return (
      <div className="inline-flex items-center gap-1 text-danger">
        <ArrowDown className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Down</span>
      </div>
    );
  return (
    <div className="inline-flex items-center gap-1 text-slate/60">
      <Minus className="h-3.5 w-3.5" />
      <span className="text-xs">Stable</span>
    </div>
  );
});

// ── Completion bar ────────────────────────────────────────────────────────────
const CompletionCell = memo(function CompletionCell({ v }: { v: number }) {
  const pct = Math.round(v * 100);
  const variant = pct === 100 ? "success" : pct >= 60 ? "teal" : pct >= 30 ? "warn" : "danger";
  return (
    <div className="flex items-center gap-2.5 min-w-[100px]">
      <ProgressBar value={pct} size="sm" variant={variant} className="flex-1" />
      <span className="text-xs tabular-nums text-slate w-8 text-right">{pct}%</span>
    </div>
  );
});

// ── Sortable column header ────────────────────────────────────────────────────
const SortTh = memo(function SortTh({
  label, k, sortKey, sortAsc, onSort, className = "",
}: {
  label: string; k: SortKey; sortKey: SortKey; sortAsc: boolean;
  onSort: (k: SortKey) => void; className?: string;
}) {
  const active = sortKey === k;
  return (
    <th
      className={`px-5 py-3.5 cursor-pointer select-none group/th whitespace-nowrap ${className}`}
      onClick={() => onSort(k)}
    >
      <div className="flex items-center gap-1.5">
        <span className={active ? "text-teal" : ""}>{label}</span>
        <span className={`transition-opacity ${active ? "opacity-100 text-teal" : "opacity-0 group-hover/th:opacity-40"}`}>
          {active
            ? (sortAsc ? <ArrowUp className="h-3 w-3 inline" /> : <ArrowDown className="h-3 w-3 inline" />)
            : <ArrowUpDown className="h-3 w-3 inline" />}
        </span>
      </div>
    </th>
  );
});

export default function StaffRankTable({
  rows,
  highlightTeacherId,
  showDepartmentColumn = true,
}: StaffRankTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortAsc, setSortAsc] = useState(true);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-slate">
        No ranking data for this period.
      </div>
    );
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "rank")       cmp = a.rank - b.rank;
    if (sortKey === "subject")    cmp = (a.subjectName ?? "").localeCompare(b.subjectName ?? "");
    if (sortKey === "department") cmp = (a.departmentName ?? "").localeCompare(b.departmentName ?? "");
    if (sortKey === "trend")      cmp = b.trendDirection - a.trendDirection;
    if (sortKey === "completion") cmp = b.completionScore - a.completionScore;
    return sortAsc ? cmp : -cmp;
  }), [rows, sortKey, sortAsc]);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
              <SortTh label="#"          k="rank"       sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} className="w-[80px]" />
              <th className="px-5 py-3.5 whitespace-nowrap">Teacher</th>
              <SortTh label="Subject"    k="subject"    sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
              {showDepartmentColumn && (
                <SortTh label="Dept"     k="department" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} className="hidden md:table-cell" />
              )}
              <SortTh label="Trend"      k="trend"      sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} className="w-[100px]" />
              <SortTh label="Entry %"    k="completion" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} className="w-[160px]" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const isHighlighted = r.teacherId === highlightTeacherId;
              return (
                <tr
                  key={r.teacherId}
                  className={`border-b border-border last:border-0 transition-colors ${
                    isHighlighted
                      ? "bg-teal-50/60 hover:bg-teal-50"
                      : "hover:bg-slate-50/50"
                  }`}
                >
                  <td className="px-5 py-3.5">
                    <RankCell rank={r.rank} />
                  </td>
                  <td className="px-5 py-3.5">
                    <p className={`text-sm ${isHighlighted ? "font-semibold text-teal" : "font-medium text-foreground"}`}>
                      {r.teacherName}
                      {isHighlighted && (
                        <Chip variant="teal" size="xs" className="ml-2">You</Chip>
                      )}
                    </p>
                  </td>
                  <td className="px-5 py-3.5">
                    {r.subjectName
                      ? <Chip variant="default" size="xs">{r.subjectName}</Chip>
                      : <span className="text-xs text-slate/50">—</span>}
                  </td>
                  {showDepartmentColumn && (
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      {r.departmentName
                        ? <span className="text-sm text-slate">{r.departmentName}</span>
                        : <span className="text-xs text-slate/50">—</span>}
                    </td>
                  )}
                  <td className="px-5 py-3.5">
                    <TrendCell dir={r.trendDirection} />
                  </td>
                  <td className="px-5 py-3.5">
                    <CompletionCell v={r.completionScore} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
