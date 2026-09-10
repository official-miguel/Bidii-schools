"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useRouter } from "next/navigation";
import { pointsToColourHex } from "@/lib/assessment/grading844";
import type { SubjectBreakdownItem } from "@/app/api/assessments/department/analytics/route";

interface DeptSubjectBarProps {
  data: SubjectBreakdownItem[];
  /** Navigate to this base path on bar click (appends ?subjectId=). */
  drillDownBase?: string;
}

export default function DeptSubjectBar({ data, drillDownBase }: DeptSubjectBarProps) {
  const router = useRouter();

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-slate">
        No subject data available yet.
      </div>
    );
  }

  const chartData = data.map((s) => ({
    id: s.subjectId,
    name: s.subjectName,
    mean: s.meanPoints,
    grade: s.meanGrade ?? "—",
  }));

  function handleClick(entry: { id: string }) {
    if (drillDownBase) {
      router.push(`${drillDownBase}?subjectId=${entry.id}`);
    }
  }

  // Read theme-aware grid color from CSS variable
  const gridColor = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() || '#e5e7eb'
    : '#e5e7eb';
  const tickColor = typeof window !== 'undefined'
    ? (getComputedStyle(document.documentElement).getPropertyValue('--color-muted-foreground').trim() || '#667085')
    : '#667085';

  return (
    <div>
      <p className="text-xs text-slate mb-3">
        Mean grade points per subject — sorted weakest to strongest.
      </p>
      <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 36)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 40, bottom: 0, left: 8 }}
        >
          {/* chart series — intentional */}
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
          <XAxis type="number" domain={[0, 12]} tick={{ fontSize: 11, fill: tickColor }} />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fontSize: 11, fill: tickColor }}
          />
          <Tooltip
            formatter={(value: number) => [
              `${typeof value === "number" ? value.toFixed(2) : "—"} pts`,
              "Mean",
            ]}
          />
          <Bar
            dataKey="mean"
            radius={[0, 4, 4, 0]}
            cursor={drillDownBase ? "pointer" : "default"}
            onClick={(entry: { id?: string }) => handleClick({ id: entry.id ?? "" })}
          >
            {chartData.map((entry) => (
              <Cell key={entry.id} fill={pointsToColourHex(entry.mean)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
