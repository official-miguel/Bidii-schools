"use client";

import { pointsToColour } from "@/lib/assessment/grading844";
import type { HeatmapCell } from "@/app/api/assessments/department/analytics/route";

interface DeptHeatmapProps {
  cells: HeatmapCell[];
}

export default function DeptHeatmap({ cells }: DeptHeatmapProps) {
  if (cells.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-slate">
        No heatmap data available yet.
      </div>
    );
  }

  // Extract unique classes and subjects, preserving insertion order.
  const classIds   = [...new Set(cells.map((c) => c.classId))];
  const subjectIds = [...new Set(cells.map((c) => c.subjectId))];
  const classNames   = new Map(cells.map((c) => [c.classId, c.className]));
  const subjectNames = new Map(cells.map((c) => [c.subjectId, c.subjectName]));

  // Build lookup: classId → subjectId → meanPoints
  const lookup = new Map<string, Map<string, number | null>>();
  for (const cell of cells) {
    if (!lookup.has(cell.classId)) lookup.set(cell.classId, new Map());
    lookup.get(cell.classId)!.set(cell.subjectId, cell.meanPoints);
  }

  return (
    <div>
      <p className="text-xs text-slate mb-3">
        Mean grade points per class (rows) × subject (columns). Hover for exact value.
      </p>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-slate font-medium">Class</th>
              {subjectIds.map((sid) => (
                <th
                  key={sid}
                  className="px-2 py-1 text-center text-slate font-medium max-w-[80px] truncate"
                  title={subjectNames.get(sid)}
                >
                  {subjectNames.get(sid)?.split(" ")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {classIds.map((cid) => (
              <tr key={cid}>
                <td className="px-2 py-1 font-medium text-foreground whitespace-nowrap">
                  {classNames.get(cid)}
                </td>
                {subjectIds.map((sid) => {
                  const pts = lookup.get(cid)?.get(sid) ?? null;
                  const { bg, text } = pointsToColour(pts);
                  return (
                    <td
                      key={sid}
                      className={`px-2 py-1.5 text-center tabular-nums rounded ${bg} ${text}`}
                      title={
                        pts !== null
                          ? `${classNames.get(cid)} · ${subjectNames.get(sid)}: ${pts.toFixed(2)} pts`
                          : "No data"
                      }
                    >
                      {pts !== null ? pts.toFixed(1) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
