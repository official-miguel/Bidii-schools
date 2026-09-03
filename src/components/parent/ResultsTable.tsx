"use client";

import type { ResultPeriod } from "@/app/api/parent/results/route";

interface ResultsTableProps {
  results: ResultPeriod[];
}

/**
 * Renders a table of assessment results grouped by period.
 * Shows each period's subjects with scores/grades, and the computed
 * mean/percentage stats where available.
 *
 * Requirements: 5.1, 5.2, 5.4, 5.5
 */
export default function ResultsTable({ results }: ResultsTableProps) {
  if (results.length === 0) {
    return (
      <div className="bg-card border border-line rounded-xl p-8 text-center dark:bg-dark-surface dark:border-dark-border">
        <p className="text-3xl mb-3">📊</p>
        <p className="text-sm font-medium text-ink dark:text-dark-text">No results yet</p>
        <p className="text-sm text-slate dark:text-dark-muted mt-1">
          Results and report cards will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {results.map(({ period, items, stats }) => (
        <div
          key={period.id}
          className="bg-card border border-line rounded-xl shadow-xs overflow-hidden dark:bg-dark-surface dark:border-dark-border"
        >
          {/* Period header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-dark-border">
            <div>
              <h3 className="text-sm font-semibold text-ink dark:text-dark-text">
                {period.name}
              </h3>
              <p className="text-xs text-slate dark:text-dark-muted mt-0.5">
                {period.academicYear}
                {period.term != null ? ` · Term ${period.term}` : ""}
              </p>
            </div>

            {/* Summary stats badge */}
            {stats != null && (
              <div className="flex items-center gap-3 text-right">
                <div>
                  <p className="text-xs text-slate dark:text-dark-muted">Mean</p>
                  <p className="text-sm font-semibold text-ink dark:text-dark-text">
                    {stats.mean}
                  </p>
                </div>
                <div
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
                    stats.percentage >= 70
                      ? "bg-success-bg text-success"
                      : stats.percentage >= 50
                      ? "bg-warn-bg text-warn"
                      : "bg-danger-bg text-danger"
                  }`}
                >
                  {stats.percentage}%
                </div>
              </div>
            )}
          </div>

          {/* Items table */}
          {items.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <p className="text-sm text-slate dark:text-dark-muted">
                No results recorded yet.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-line dark:divide-dark-border">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-5 py-3"
                >
                  {/* Subject name */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink dark:text-dark-text truncate">
                      {item.subject?.name ?? "—"}
                    </p>
                    {item.comment && (
                      <p className="text-xs text-slate dark:text-dark-muted mt-0.5 truncate">
                        {item.comment}
                      </p>
                    )}
                  </div>

                  {/* Result value */}
                  <div className="ml-4 flex items-center gap-2 shrink-0">
                    <ResultBadge item={item} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper — renders the appropriate badge for each result kind
// ---------------------------------------------------------------------------

type ItemShape = ResultPeriod["items"][number];

function ResultBadge({ item }: { item: ItemShape }) {
  if (item.resultKind === "NUMERIC" && item.numericScore != null) {
    const pct = item.numericScore;
    const colorClass =
      pct >= 70
        ? "bg-success-bg text-success"
        : pct >= 50
        ? "bg-warn-bg text-warn"
        : "bg-danger-bg text-danger";

    return (
      <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${colorClass}`}>
        {pct}
      </span>
    );
  }

  if (item.resultKind === "PERFORMANCE_LEVEL" && item.performanceLevel) {
    return (
      <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-info/10 text-info">
        {formatPerformanceLevel(item.performanceLevel)}
      </span>
    );
  }

  if (item.resultKind === "COMPETENCY" && item.competencyStatus) {
    return (
      <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-teal/10 text-teal">
        {formatCompetencyStatus(item.competencyStatus)}
      </span>
    );
  }

  return <span className="text-xs text-slate dark:text-dark-muted">—</span>;
}

function formatPerformanceLevel(level: string): string {
  return level
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCompetencyStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
