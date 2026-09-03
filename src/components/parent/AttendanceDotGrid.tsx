"use client";

/**
 * AttendanceDotGrid
 *
 * Renders a mobile-friendly flex-wrap grid of day cells coloured by attendance
 * status. Each cell shows the day number and exposes a tooltip with the full
 * date and status.
 *
 * Requirements: 6.2, 6.3
 */

interface AttendanceRecord {
  date: string;   // ISO date string e.g. "2024-03-15T00:00:00.000Z"
  status: string; // "PRESENT" | "ABSENT"
}

interface AttendanceDotGridProps {
  records: AttendanceRecord[];
}

export default function AttendanceDotGrid({ records }: AttendanceDotGridProps) {
  if (records.length === 0) {
    return null;
  }

  // Render records in chronological order (oldest first) for natural left-to-right reading
  const sorted = [...records].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return (
    <div>
      <p className="text-xs font-semibold text-slate dark:text-dark-muted uppercase tracking-wide mb-2">
        Last 90 days
      </p>
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((record, i) => {
          const d = new Date(record.date);
          const dayNum = d.getDate();
          const fullLabel = `${d.toLocaleDateString("en-KE", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric",
          })} — ${record.status}`;

          let colorClass: string;
          if (record.status === "PRESENT") {
            colorClass = "bg-success-bg text-success";
          } else if (record.status === "ABSENT") {
            colorClass = "bg-danger-bg text-danger";
          } else {
            colorClass = "bg-line dark:bg-dark-border text-slate dark:text-dark-muted";
          }

          return (
            <div
              key={i}
              title={fullLabel}
              aria-label={fullLabel}
              className={`w-8 h-8 rounded-md text-[10px] font-semibold flex items-center justify-center select-none cursor-default ${colorClass}`}
            >
              {dayNum}
            </div>
          );
        })}
      </div>
    </div>
  );
}
