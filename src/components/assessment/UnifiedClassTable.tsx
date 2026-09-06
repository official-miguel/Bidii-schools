"use client";

import Link from "next/link";
import { Chip, ProgressBar } from "@/components/ui";
import { BarChart2, FileSpreadsheet } from "lucide-react";

export interface ClassRow {
  id: string;
  name: string;
  form: number;
  frameworkType: string;
  meanPoints: number | null;
  meanGrade: string | null;
  entryCompletionPct: number;
}

interface UnifiedClassTableProps {
  rows: ClassRow[];
  role: "principal" | "hod";
}

function FrameworkBadge({ type }: { type: string }) {
  if (type === "CBE") return <Chip variant="teal" size="xs">CBE</Chip>;
  return                     <Chip variant="default" size="xs">8-4-4</Chip>;
}

function MeanGradeBadge({ grade, points }: { grade: string; points: number | null }) {
  // Colour the grade badge based on the mean points (A=12, E=1 for KCSE)
  const p = points ?? 0;
  let variant: "success" | "teal" | "warn" | "danger" | "default" = "default";
  if (p >= 10)      variant = "success";
  else if (p >= 7)  variant = "teal";
  else if (p >= 4)  variant = "warn";
  else              variant = "danger";

  return (
    <div className="flex items-center gap-2">
      <Chip variant={variant} size="sm">{grade}</Chip>
      {points !== null && (
        <span className="text-xs text-slate tabular-nums">{points.toFixed(1)} pts</span>
      )}
    </div>
  );
}

function CompletionCell({ pct }: { pct: number }) {
  const variant = pct === 100 ? "success" : pct >= 60 ? "teal" : pct >= 30 ? "warn" : "danger";
  return (
    <div className="flex items-center gap-3 min-w-[120px]">
      <ProgressBar value={pct} size="sm" variant={variant} className="flex-1" />
      <span className="text-xs tabular-nums text-slate w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function UnifiedClassTable({ rows, role }: UnifiedClassTableProps) {
  const base = role === "hod" ? "/principal" : `/${role}`;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line px-4 py-12 text-center text-sm text-slate">
        No classes found.
      </div>
    );
  }

  return (
    <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-line bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
              <th className="px-5 py-3.5">Class</th>
              <th className="px-5 py-3.5 w-[110px]">Framework</th>
              <th className="px-5 py-3.5 w-[160px]">Mean grade</th>
              <th className="px-5 py-3.5">Entry completion</th>
              <th className="px-5 py-3.5 w-[120px]" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="group border-b border-line last:border-0 hover:bg-slate-50/50 transition-colors">
                {/* Class name */}
                <td className="px-5 py-3.5">
                  <p className="text-sm font-semibold text-ink">{row.name}</p>
                  <p className="text-xs text-slate/60">Form {row.form}</p>
                </td>

                {/* Framework */}
                <td className="px-5 py-3.5">
                  <FrameworkBadge type={row.frameworkType} />
                </td>

                {/* Mean grade */}
                <td className="px-5 py-3.5">
                  {row.meanGrade ? (
                    <MeanGradeBadge grade={row.meanGrade} points={row.meanPoints} />
                  ) : (
                    <span className="text-xs text-slate/50">No data yet</span>
                  )}
                </td>

                {/* Completion bar */}
                <td className="px-5 py-3.5">
                  <CompletionCell pct={row.entryCompletionPct} />
                </td>

                {/* Actions */}
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link
                      href={`${base}/assessments/marksheet?classId=${row.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate border border-line hover:border-teal/50 hover:text-teal hover:bg-teal-50 transition-colors"
                      title="Open marksheet"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      Marks
                    </Link>
                    <Link
                      href={`${base}/assessments/dashboard?classId=${row.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate border border-line hover:border-teal/50 hover:text-teal hover:bg-teal-50 transition-colors"
                      title="Open dashboard"
                    >
                      <BarChart2 className="h-3.5 w-3.5" />
                      Dashboard
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
