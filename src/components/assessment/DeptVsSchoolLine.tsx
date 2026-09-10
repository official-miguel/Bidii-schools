"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TrendDataPoint } from "@/app/api/assessments/department/analytics/route";

interface DeptVsSchoolLineProps {
  data: TrendDataPoint[];
  deptName: string;
}

function periodLabel(p: TrendDataPoint) {
  return p.term ? `T${p.term} ${p.academicYear}` : p.periodName;
}

export default function DeptVsSchoolLine({ data, deptName }: DeptVsSchoolLineProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-slate">
        No comparison data available yet.
      </div>
    );
  }

  const chartData = data.map((p) => ({
    label: periodLabel(p),
    dept: p.deptMean,
    school: p.schoolMean,
  }));

  // Read CSS variable values for dark-mode-aware chart chrome (Req 5.1, 12.2, 12.5)
  const tooltipBg = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-card').trim() || '#FFFFFF'
    : '#FFFFFF';
  const tooltipFg = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-card-foreground').trim() || '#1F2933'
    : '#1F2933';
  const legendFg = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-foreground').trim() || '#1F2933'
    : '#1F2933';
  const gridColor = typeof window !== 'undefined'
    ? (getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() || '#E8EDF2')
    : '#E8EDF2';
  const tickColor = typeof window !== 'undefined'
    ? (getComputedStyle(document.documentElement).getPropertyValue('--color-muted-foreground').trim() || '#667085')
    : '#667085';

  return (
    <div>
      <p className="text-xs text-slate mb-3">
        <span className="font-medium text-foreground">{deptName}</span> mean (solid) vs.{" "}
        school average (dashed grey) on the same axes.
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          {/* chart series — intentional */}
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: tickColor }} />
          <YAxis domain={[1, 12]} ticks={[1, 3, 5, 7, 9, 11, 12]} tick={{ fontSize: 11, fill: tickColor }} />
          <Tooltip
            formatter={(value: number, name: string) => [
              value?.toFixed(2) ?? "—",
              name === "dept" ? deptName : "School",
            ]}
            contentStyle={{ background: tooltipBg, border: '1px solid var(--color-border)' }}
            labelStyle={{ color: tooltipFg }}
            itemStyle={{ color: tooltipFg }}
          />
          <Legend formatter={(v) => (v === "dept" ? deptName : "School")} wrapperStyle={{ color: legendFg }} />
          {/* chart series — intentional */}
          <Line
            type="monotone"
            dataKey="dept"
            stroke="#1d4ed8"
            strokeWidth={2.5}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
          {/* chart series — intentional */}
          <Line
            type="monotone"
            dataKey="school"
            stroke="#9ca3af"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
