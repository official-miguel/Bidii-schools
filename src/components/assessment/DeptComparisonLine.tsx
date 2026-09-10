"use client";

/**
 * DeptComparisonBar — bar chart comparing all departments for a single
 * selected period.  Department names sit on the X-axis; mean grade points
 * (1–12) on the Y-axis.  The active department's bar is teal; others grey.
 *
 * Despite the file name keeping "Line" for import compatibility, this is a
 * BarChart — the user asked for department names below and points at the side.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import type { DeptComparePayload } from "@/app/api/assessments/department/compare/route";

interface Props {
  data: DeptComparePayload;
  /** periodId currently selected in the parent filter. */
  activePeriodId: string;
  /** departmentId currently selected — its bar is highlighted teal. */
  activeDeptId: string;
}

const ACTIVE_COLOUR  = "#2C7F7E"; // brand teal
const DEFAULT_COLOUR = "#94a3b8"; // slate-400
const GRADE_LABELS: Record<number, string> = {
  12: "A", 11: "A-", 10: "B+", 9: "B", 8: "B-",
  7: "C+", 6: "C", 5: "C-", 4: "D+", 3: "D", 2: "D-", 1: "E",
};

function gradeLabel(pts: number) {
  const rounded = Math.round(pts);
  return GRADE_LABELS[rounded] ?? "";
}

// Custom tooltip
function BarTooltip({
  active,
  payload,
  activeDeptId,
}: {
  active?: boolean;
  payload?: Array<{ payload: { name: string; deptId: string; mean: number | null } }>;
  activeDeptId: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (d.mean === null) return null;
  const isActive = d.deptId === activeDeptId;
  return (
    <div className="bg-card border border-border rounded-lg shadow-md px-3 py-2 text-xs">
      <p className={`font-semibold mb-0.5 ${isActive ? "text-teal" : "text-foreground"}`}>
        {d.name}
      </p>
      <p className="text-slate">
        Mean:{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {d.mean.toFixed(2)} pts
        </span>
      </p>
      <p className="text-slate">
        Grade:{" "}
        <span className="font-semibold text-foreground">{gradeLabel(d.mean)}</span>
      </p>
    </div>
  );
}

export default function DeptComparisonLine({ data, activePeriodId, activeDeptId }: Props) {
  const { periods, series } = data;

  // Find the index for the active period in the periods array.
  const periodIdx = periods.findIndex((p) => p.periodId === activePeriodId);

  // Build one bar per department for the selected period.
  const chartData = series
    .map((s) => ({
      name: s.departmentName,
      deptId: s.departmentId,
      mean: periodIdx >= 0 ? (s.means[periodIdx] ?? null) : null,
    }))
    // Sort descending by mean so the chart reads highest → lowest left to right.
    .sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0));

  const periodLabel = periods[periodIdx]
    ? periods[periodIdx].term
      ? `Term ${periods[periodIdx].term} ${periods[periodIdx].academicYear}`
      : `${periods[periodIdx].periodName} ${periods[periodIdx].academicYear}`
    : "";

  const hasData = chartData.some((d) => d.mean !== null);

  if (!hasData) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-slate">
        No data for this period yet.
      </div>
    );
  }

  // School-wide mean for reference line: average of all dept means.
  const withData = chartData.filter((d): d is typeof d & { mean: number } => d.mean !== null);
  const schoolMean =
    withData.length > 0
      ? Math.round((withData.reduce((s, d) => s + d.mean, 0) / withData.length) * 100) / 100
      : null;

  // Read theme-aware grid color from CSS variable
  const gridColor = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() || '#e5e7eb'
    : '#e5e7eb';
  const tickColor = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-muted-foreground').trim() || '#94a3b8'
    : '#94a3b8';

  return (
    <div>
      <p className="text-xs text-slate mb-3">
        Mean grade points per department —{" "}
        <span className="font-medium text-foreground">{periodLabel}</span>.
        {schoolMean !== null && (
          <>
            {" "}School avg:{" "}
            <span className="font-medium text-foreground">
              {schoolMean.toFixed(2)} ({gradeLabel(schoolMean)})
            </span>
            .
          </>
        )}
      </p>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={chartData}
          margin={{ top: 16, right: 8, bottom: 40, left: 0 }}
          barCategoryGap="28%"
        >
          {/* chart series — intentional */}
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />

          {/* Department names — rotated so even long names fit */}
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: tickColor /* chart series — intentional */ }}
            tickLine={false}
            angle={-35}
            textAnchor="end"
            interval={0}
            height={56}
          />

          {/* Grade-point scale 1–12 */}
          <YAxis
            domain={[0, 12]}
            ticks={[0, 2, 4, 6, 8, 10, 12]}
            tickFormatter={(v) => (v === 0 ? "" : `${v}`)}
            tick={{ fontSize: 11, fill: tickColor /* chart series — intentional */ }}
            tickLine={false}
            axisLine={false}
            width={28}
          />

          <Tooltip content={<BarTooltip activeDeptId={activeDeptId} />} cursor={{ fill: "#e5e7eb55" }} />

          {/* School average reference line */}
          {schoolMean !== null && (
            <ReferenceLine
              y={schoolMean}
              stroke="#667085" /* chart series — intentional */
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{
                value: `Avg ${schoolMean.toFixed(1)}`,
                position: "insideTopRight",
                fontSize: 10,
                fill: "#667085", // chart series — intentional
              }}
            />
          )}

          <Bar dataKey="mean" radius={[4, 4, 0, 0]} maxBarSize={52} isAnimationActive>
            {/* Grade-point label on top of each bar */}
            <LabelList
              dataKey="mean"
              position="top"
              formatter={(v: number) => (v != null ? v.toFixed(1) : "")}
              style={{ fontSize: 10, fill: "#667085" }}
            />
            {chartData.map((entry) => (
              <Cell
                key={entry.deptId}
                fill={entry.deptId === activeDeptId ? ACTIVE_COLOUR : DEFAULT_COLOUR}
                fillOpacity={entry.deptId === activeDeptId ? 1 : 0.7}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
