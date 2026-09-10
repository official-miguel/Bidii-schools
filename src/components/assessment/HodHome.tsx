"use client";

import { useEffect, useState } from "react";
import type { SummaryTilesPayload } from "@/app/api/assessments/home/summary/route";
import UnifiedClassTable from "./UnifiedClassTable";

function SummaryTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
      <p className="text-xs text-slate mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? "text-foreground"}`}>{value}</p>
      {sub && <p className="text-xs text-slate mt-0.5">{sub}</p>}
    </div>
  );
}

interface HodHomeProps {
  departmentId?: string;
}

export default function HodHome({ departmentId }: HodHomeProps) {
  const [data, setData] = useState<SummaryTilesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ scope: "department" });
    if (departmentId) qs.set("departmentId", departmentId);
    fetch(`/api/assessments/home/summary?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load department summary."));
  }, [departmentId]);

  if (error) {
    return (
      <div className="rounded-md bg-danger-bg text-danger text-sm px-3 py-2">{error}</div>
    );
  }

  if (!data) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-line/40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryTile
          label="Dept Mean"
          value={data.meanGrade ?? "—"}
          sub={data.meanPoints != null ? `${data.meanPoints.toFixed(1)} pts` : undefined}
          accent={data.meanGrade ? "text-royal" : undefined}
        />
        <SummaryTile
          label="Weakest Subject"
          value={data.weakestSubjectName ?? "—"}
        />
        <SummaryTile
          label="Learners Flagged"
          value={data.learnersAtRisk}
          sub="mean below D grade"
          accent={data.learnersAtRisk > 0 ? "text-orange-600" : undefined}
        />
        <SummaryTile
          label="Entry Completion"
          value={`${data.entryCompletionPct}%`}
          accent={data.entryCompletionPct === 100 ? "text-green-600" : undefined}
        />
      </div>

      {/* Class table */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Classes in Department</h2>
        <UnifiedClassTable rows={data.classes} role="hod" />
      </div>
    </div>
  );
}
