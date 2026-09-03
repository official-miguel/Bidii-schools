/**
 * DisciplineList — renders parent-visible discipline records as cards.
 * Shows date, offence type, description (brief), and status.
 * OPEN → orange badge, RESOLVED → green badge.
 *
 * Requirements: 8.1, 8.2
 */

import { AlertTriangle } from "lucide-react";

type DisciplineStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "ESCALATED";

interface DisciplineRecord {
  id: string;
  offence: string;
  description: string | null;
  actionTaken: string | null;
  resolution: string | null;
  dateOfOffence: string | Date;
  status: DisciplineStatus;
}

interface DisciplineListProps {
  records: DisciplineRecord[];
  childName?: string;
}

const STATUS_STYLES: Record<DisciplineStatus, string> = {
  OPEN:         "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  UNDER_REVIEW: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  RESOLVED:     "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  ESCALATED:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_LABEL: Record<DisciplineStatus, string> = {
  OPEN:         "Open",
  UNDER_REVIEW: "Under Review",
  RESOLVED:     "Resolved",
  ESCALATED:    "Escalated",
};

function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" });
}

export default function DisciplineList({ records, childName }: DisciplineListProps) {
  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-4xl mb-3">🌟</div>
        <p className="text-base font-semibold text-ink dark:text-dark-text">No behaviour matters</p>
        <p className="text-sm text-slate dark:text-dark-muted mt-1 max-w-xs">
          {childName
            ? `There are currently no parent-visible behaviour matters for ${childName}.`
            : "There are currently no parent-visible behaviour matters."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((record) => (
        <div
          key={record.id}
          className="bg-card border border-line rounded-xl p-4 shadow-xs
                     dark:bg-dark-surface dark:border-dark-border"
        >
          <div className="flex items-start justify-between gap-3">
            {/* Icon + offence */}
            <div className="flex items-start gap-3 min-w-0">
              <div className="mt-0.5 shrink-0 w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30
                              flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink dark:text-dark-text truncate">
                  {record.offence}
                </p>
                {record.description && (
                  <p className="text-sm text-slate dark:text-dark-muted mt-0.5 line-clamp-2">
                    {record.description}
                  </p>
                )}
                {record.actionTaken && (
                  <p className="text-xs text-slate dark:text-dark-muted mt-1">
                    <span className="font-medium">Action taken:</span> {record.actionTaken}
                  </p>
                )}
              </div>
            </div>

            {/* Status badge */}
            <span
              className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                ${STATUS_STYLES[record.status] ?? STATUS_STYLES.OPEN}`}
            >
              {STATUS_LABEL[record.status] ?? record.status}
            </span>
          </div>

          {/* Date footer */}
          <p className="mt-3 text-xs text-slate dark:text-dark-muted">
            {formatDate(record.dateOfOffence)}
          </p>
        </div>
      ))}
    </div>
  );
}
