"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SummaryTilesPayload } from "@/app/api/assessments/home/summary/route";
import type { ClassRow } from "./UnifiedClassTable";
import { SkeletonStatCard } from "@/components/ui/ProgressivePage";
import { Chip, ProgressBar } from "@/components/ui";
import { ChevronRight } from "lucide-react";

function SummaryTile({
  label,
  value,
  sub,
  accent,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  href?: string;
}) {
  const content = (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm h-full">
      <p className="text-xs text-slate mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? "text-foreground"}`}>{value}</p>
      {sub && <p className="text-xs text-slate mt-0.5">{sub}</p>}
      {href && (
        <p className="text-xs text-royal mt-2 hover:underline">View →</p>
      )}
    </div>
  );
  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }
  return content;
}

export default function DirectorHome() {
  const [data, setData] = useState<SummaryTilesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/assessments/home/summary?scope=school")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load school summary."));
  }, []);

  if (error) {
    return (
      <div className="rounded-md bg-danger-bg text-danger text-sm px-3 py-2">{error}</div>
    );
  }

  if (!data) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <SummaryTile
          label="School Mean"
          value={data.meanGrade ?? "—"}
          sub={data.meanPoints != null ? `${data.meanPoints.toFixed(1)} pts` : undefined}
          accent={data.meanGrade ? "text-royal" : undefined}
        />
        <SummaryTile
          label="Top Subject"
          value={data.topSubjectName ?? "—"}
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
        <SummaryTile
          label="Teaching Staff"
          value={data.totalTeachingStaff ?? "—"}
          href="/principal/assessments/staff-performance"
          accent="text-foreground"
        />
      </div>

      {/* All classes — grouped by Form */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">All Classes</h2>
        <FormGroupTable classes={data.classes} />
      </div>
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────── */

interface FormGroup {
  form: number;
  streams: ClassRow[];
  /** aggregated mean points across all streams (null when none have data) */
  meanPoints: number | null;
  /** best single mean-grade string to surface (from highest-pts stream) */
  meanGrade: string | null;
  /** average entry-completion across streams */
  entryCompletionPct: number;
}

function buildFormGroups(classes: ClassRow[]): FormGroup[] {
  const map = new Map<number, ClassRow[]>();
  for (const c of classes) {
    const list = map.get(c.form) ?? [];
    list.push(c);
    map.set(c.form, list);
  }

  const groups: FormGroup[] = [];
  for (const [form, streams] of map) {
    const withPts = streams.filter((s) => s.meanPoints !== null);
    const meanPoints =
      withPts.length > 0
        ? withPts.reduce((acc, s) => acc + s.meanPoints!, 0) / withPts.length
        : null;
    // grade from the stream closest to the average
    const best =
      meanPoints !== null
        ? withPts.reduce((a, b) =>
            Math.abs((b.meanPoints ?? 0) - meanPoints) <
            Math.abs((a.meanPoints ?? 0) - meanPoints)
              ? b
              : a
          )
        : null;
    const entryCompletionPct =
      streams.length > 0
        ? Math.round(
            streams.reduce((acc, s) => acc + s.entryCompletionPct, 0) /
              streams.length
          )
        : 0;

    groups.push({
      form,
      streams,
      meanPoints,
      meanGrade: best?.meanGrade ?? null,
      entryCompletionPct,
    });
  }

  return groups.sort((a, b) => a.form - b.form);
}

function MeanGradeBadge({
  grade,
  points,
}: {
  grade: string;
  points: number | null;
}) {
  const p = points ?? 0;
  let variant: "success" | "teal" | "warn" | "danger" | "default" = "default";
  if (p >= 10) variant = "success";
  else if (p >= 7) variant = "teal";
  else if (p >= 4) variant = "warn";
  else variant = "danger";

  return (
    <div className="flex items-center gap-2">
      <Chip variant={variant} size="sm">
        {grade}
      </Chip>
      {points !== null && (
        <span className="text-xs text-slate tabular-nums">
          {points.toFixed(1)} pts
        </span>
      )}
    </div>
  );
}

function CompletionCell({ pct }: { pct: number }) {
  const variant =
    pct === 100
      ? "success"
      : pct >= 60
      ? "teal"
      : pct >= 30
      ? "warn"
      : "danger";
  return (
    <div className="flex items-center gap-3 min-w-[120px]">
      <ProgressBar value={pct} size="sm" variant={variant} className="flex-1" />
      <span className="text-xs tabular-nums text-slate w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}

function FormGroupTable({ classes }: { classes: ClassRow[] }) {
  const groups = buildFormGroups(classes);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-slate">
        No classes found.
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
              <th className="px-5 py-3.5">Form</th>
              <th className="px-5 py-3.5 w-[100px]">Streams</th>
              <th className="px-5 py-3.5 w-[160px]">Avg mean grade</th>
              <th className="px-5 py-3.5">Entry completion</th>
              <th className="px-5 py-3.5 w-[60px]" />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr
                key={g.form}
                className="group border-b border-border last:border-0 hover:bg-slate-50/50 transition-colors"
              >
                {/* Form name */}
                <td className="px-5 py-3.5">
                  <Link
                    href={`/principal/assessments/forms/${g.form}`}
                    className="block"
                  >
                    <p className="text-sm font-semibold text-foreground group-hover:text-royal transition-colors">
                      Form {g.form}
                    </p>
                    <p className="text-xs text-slate/60">
                      {g.streams.length} stream
                      {g.streams.length !== 1 ? "s" : ""}
                    </p>
                  </Link>
                </td>

                {/* Stream count badges */}
                <td className="px-5 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {g.streams.map((s) => (
                      <Chip key={s.id} variant="default" size="xs">
                        {s.name}
                      </Chip>
                    ))}
                  </div>
                </td>

                {/* Aggregated mean grade */}
                <td className="px-5 py-3.5">
                  {g.meanGrade ? (
                    <MeanGradeBadge
                      grade={g.meanGrade}
                      points={g.meanPoints}
                    />
                  ) : (
                    <span className="text-xs text-slate/50">No data yet</span>
                  )}
                </td>

                {/* Avg completion */}
                <td className="px-5 py-3.5">
                  <CompletionCell pct={g.entryCompletionPct} />
                </td>

                {/* Chevron */}
                <td className="px-5 py-3.5">
                  <Link
                    href={`/principal/assessments/forms/${g.form}`}
                    className="flex items-center justify-end text-slate/40 group-hover:text-royal transition-colors"
                    aria-label={`View Form ${g.form} streams`}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
