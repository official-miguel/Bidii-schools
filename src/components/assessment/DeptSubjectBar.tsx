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
import { markToColourHex } from "@/lib/assessment/gradingCbe";
import type { AnalyticsScale, SubjectBreakdownItem } from "@/app/api/assessments/department/analytics/route";

interface DeptSubjectBarProps {
  data: SubjectBreakdownItem[];
  /** Units the means are in — grade points (8-4-4) or raw marks (CBE). */
  scale: AnalyticsScale;
  /** Navigate to this base path on bar click (appends ?subjectId=). */
  drillDownBase?: string;
}

export default function DeptSubjectBar({ data, scale, drillDownBase }: DeptSubjectBarProps) {
  const router = useRouter();

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-slate">
        No subject data available yet.
      </div>
    );
  }

  const isMarks = scale.kind === "MARKS";
  const colourFor = isMarks ? markToColourHex : pointsToColourHex;

  const chartData = data.map((s) => ({
    id: s.subjectId,
    name: s.subjectName,
    mean: s.mean,
    label: s.label ?? "—",
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
        {isMarks ? "Mean marks per subject" : "Mean grade points per subject"} — sorted weakest to strongest.
      </p>
      <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 36)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 40, bottom: 0, left: 8 }}
        >
          {/* chart series — intentional */}
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
          <XAxis type="number" domain={[0, scale.max]} tick={{ fontSize: 11, fill: tickColor }} />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fontSize: 11, fill: tickColor }}
          />
          <Tooltip
            formatter={(value: number) => [
              `${typeof value === "number" ? value.toFixed(2) : "—"} ${scale.unit}`,
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
              <Cell key={entry.id} fill={colourFor(entry.mean)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
