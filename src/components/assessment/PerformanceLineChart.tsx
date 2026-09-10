"use client";

/**
 * Performance-over-time line chart for a student's report card.
 * Shows mean score per period as a line graph, matching the design in the
 * screenshot: labelled x-axis with angled period names, y-axis 0–100, clean
 * light-blue line with dots.
 *
 * Uses Recharts — already installed in the project.
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export interface HistoryPoint {
  label: string;   // e.g. "Form 1 – CAT 1 (2024 Term 1)"
  score: number | null;
}

interface Props {
  points: HistoryPoint[];
  /** Optional baseline score to show as a dashed reference line (e.g. KCPE average). */
  baseline?: number | null;
  baselineLabel?: string;
}

export default function PerformanceLineChart({ points, baseline, baselineLabel }: Props) {
  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-slate">
        No historical data available yet.
      </div>
    );
  }

  // Recharts needs numeric values — map null to undefined so the line breaks.
  const data = points.map((p) => ({
    label: p.label,
    score: p.score ?? undefined,
  }));

  // Read CSS variable values for dark-mode-aware chart chrome (Req 5.1, 12.2)
  const tooltipBg = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-card').trim() || '#FFFFFF'
    : '#FFFFFF';
  const tooltipFg = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-card-foreground').trim() || '#1F2933'
    : '#1F2933';
  const gridColor = typeof window !== 'undefined'
    ? (getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() || '#E8EDF2')
    : '#E8EDF2';
  const tickColor = typeof window !== 'undefined'
    ? (getComputedStyle(document.documentElement).getPropertyValue('--color-muted-foreground').trim() || '#667085')
    : '#667085';

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 16, bottom: 60, left: 0 }}>
        {/* chart series — intentional */}
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: tickColor }}
          angle={-40}
          textAnchor="end"
          interval={0}
          height={70}
        />
        <YAxis
          domain={[0, 100]}
          tickCount={6}
          tick={{ fontSize: 10, fill: tickColor }}
          width={36}
          tickFormatter={(v) => `${v}`}
        />
        <Tooltip
          formatter={(value: number) => [`${value.toFixed(1)}%`, "Score"]}
          labelStyle={{ fontSize: 11, color: tooltipFg }}
          itemStyle={{ color: tooltipFg }}
          contentStyle={{ fontSize: 11, background: tooltipBg, border: '1px solid var(--color-border)' }}
        />
        {baseline != null && (
          <ReferenceLine
            y={baseline}
            stroke="#f59e0b" /* chart series — intentional */
            strokeDasharray="4 3"
            label={{
              value: baselineLabel ?? `Baseline ${baseline}%`,
              position: "insideTopLeft",
              fontSize: 10,
              fill: "#f59e0b", // chart series — intentional
            }}
          />
        )}
        {/* chart series — intentional */}
        <Line
          type="monotone"
          dataKey="score"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }}
          activeDot={{ r: 6 }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
