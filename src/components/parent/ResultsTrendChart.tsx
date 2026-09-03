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
import type { ResultPeriod } from "@/app/api/parent/results/route";

interface ResultsTrendChartProps {
  results: ResultPeriod[];
}

/**
 * Renders a bar chart showing the student's percentage score across
 * assessment periods (X-axis: period names, Y-axis: percentage 0–100).
 *
 * Falls back to a simple stat display when fewer than 2 periods have data.
 *
 * Requirements: 5.1, 5.4
 */
export default function ResultsTrendChart({ results }: ResultsTrendChartProps) {
  // Only include periods that have computed numeric stats
  const chartData = results
    .filter((r) => r.stats != null)
    .map((r) => ({
      name:       r.period.name,
      percentage: r.stats!.percentage,
      count:      r.stats!.count,
    }))
    // Reverse so oldest period is on the left
    .reverse();

  // Fewer than 2 data points → show a simple stat card instead
  if (chartData.length < 2) {
    const single = chartData[0];

    if (!single) {
      return (
        <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <p className="text-sm font-semibold text-ink dark:text-dark-text mb-1">
            Performance Trend
          </p>
          <p className="text-sm text-slate dark:text-dark-muted">
            Not enough data to display a trend chart yet.
          </p>
        </div>
      );
    }

    return (
      <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
        <p className="text-sm font-semibold text-ink dark:text-dark-text mb-3">
          Performance — {single.name}
        </p>
        <div className="flex items-end gap-3">
          <span
            className={`text-4xl font-bold ${
              single.percentage >= 70
                ? "text-success"
                : single.percentage >= 50
                ? "text-warn"
                : "text-danger"
            }`}
          >
            {single.percentage}%
          </span>
          <span className="text-sm text-slate dark:text-dark-muted mb-1">
            mean across {single.count} subject{single.count !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
      <p className="text-sm font-semibold text-ink dark:text-dark-text mb-4">
        Performance trend
      </p>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={chartData}
          margin={{ top: 4, right: 8, left: -20, bottom: 4 }}
          barCategoryGap="30%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line, #e5e7eb)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "var(--color-slate, #64748b)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "var(--color-slate, #64748b)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            cursor={{ fill: "rgba(20,184,166,0.06)" }}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid var(--color-line, #e5e7eb)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}
            formatter={(value: number) => [`${value}%`, "Score"]}
          />
          <Bar dataKey="percentage" radius={[4, 4, 0, 0]} maxBarSize={56}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  entry.percentage >= 70
                    ? "#14b8a6" // teal — good
                    : entry.percentage >= 50
                    ? "#f59e0b" // amber — average
                    : "#ef4444" // red — needs attention
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="text-xs text-slate dark:text-dark-muted mt-2 text-center">
        Mean percentage score per assessment period
      </p>
    </div>
  );
}
