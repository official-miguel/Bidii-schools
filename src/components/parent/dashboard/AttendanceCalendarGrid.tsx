/**
 * AttendanceCalendarGrid
 *
 * Renders the "Attendance – Last 30 days" calendar grid from the design mockup.
 * Shows week columns (M T W T F S S) with coloured check/cross/dash markers
 * for each school day.
 *
 * Server-renderable — no client state.
 */

import Link from "next/link";

export interface AttendanceDay {
  date:   Date;
  status: "PRESENT" | "ABSENT" | "NO_SCHOOL" | "LATE";
}

const DOW = ["M", "T", "W", "T", "F", "S", "S"] as const;

function DayCell({ status, day }: { status: AttendanceDay["status"] | null; day?: number }) {
  if (!status) {
    return (
      <div className="w-8 h-8 flex items-center justify-center text-[11px] text-slate/30 dark:text-dark-muted/30">
        –
      </div>
    );
  }

  const base = "w-8 h-8 flex items-center justify-center rounded-full text-xs";

  if (status === "NO_SCHOOL") {
    return (
      <div className={`${base} text-slate/30 dark:text-dark-muted/30`} title="No school">
        –
      </div>
    );
  }
  if (status === "ABSENT") {
    return (
      <div className={`${base} bg-[#FEF3F2] text-[#F04438]`} title="Absent">
        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path strokeLinecap="round" d="M2 2l8 8M10 2L2 10" />
        </svg>
      </div>
    );
  }
  if (status === "LATE") {
    return (
      <div className={`${base} bg-[#FFF3E8] text-[#F79009]`} title="Late">
        <span className="font-bold text-[10px]">L</span>
      </div>
    );
  }
  // PRESENT
  return (
    <div className={`${base} bg-[#EDFAF4] text-[#17B26A]`} title="Present">
      <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 6.5l3 3 6-6" />
      </svg>
    </div>
  );
}

interface Props {
  days:    AttendanceDay[];
  viewHref: string;
}

export default function AttendanceCalendarGrid({ days, viewHref }: Props) {
  // Build a grid of full weeks covering the given days.
  // Sort oldest first.
  const sorted = [...days].sort((a, b) => +a.date - +b.date);

  // Find the Monday of the week containing the first day
  function mondayOf(d: Date): Date {
    const date = new Date(d);
    const dow  = (date.getDay() + 6) % 7; // 0=Mon
    date.setDate(date.getDate() - dow);
    return date;
  }

  // Build map of date-string → status
  const statusMap = new Map<string, AttendanceDay["status"]>();
  for (const d of sorted) {
    statusMap.set(d.date.toDateString(), d.status);
  }

  // Generate weeks
  const startMon = sorted.length > 0 ? mondayOf(sorted[0].date) : mondayOf(new Date());
  const weeks: (Date | null)[][] = [];

  let cursor = new Date(startMon);
  const endDate = sorted.length > 0 ? sorted[sorted.length - 1].date : new Date();

  while (cursor <= endDate || weeks.length < 4) {
    const week: (Date | null)[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    if (weeks.length >= 6) break; // safety cap
  }

  return (
    <section
      aria-labelledby="att-calendar-heading"
      className="rounded-2xl bg-white dark:bg-dark-surface border border-line
                 dark:border-dark-border shadow-xs overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <h2 id="att-calendar-heading" className="text-base font-semibold text-ink dark:text-dark-text">
          Attendance – Last 30 days
        </h2>
        <Link href={viewHref} className="text-xs font-medium text-teal hover:underline">
          View full attendance →
        </Link>
      </div>

      <div className="px-5 pb-5 overflow-x-auto">
        {/* Header row */}
        <div className="grid grid-cols-7 mb-1">
          {DOW.map((d, i) => (
            <div key={i} className="w-8 h-6 flex items-center justify-center
                                    text-[10px] font-semibold text-slate/50 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="space-y-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((date, di) => {
                if (!date) return <div key={di} className="w-8 h-8" />;
                const s = statusMap.get(date.toDateString()) ?? null;
                return <DayCell key={di} status={s} day={date.getDate()} />;
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-line dark:border-dark-border">
          <span className="flex items-center gap-1.5 text-xs text-slate dark:text-dark-muted">
            <span className="w-5 h-5 rounded-full bg-[#EDFAF4] text-[#17B26A] flex items-center justify-center">
              <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 6.5l3 3 6-6" />
              </svg>
            </span>
            Present
          </span>
          <span className="flex items-center gap-1.5 text-xs text-slate dark:text-dark-muted">
            <span className="w-5 h-5 rounded-full bg-[#FEF3F2] text-[#F04438] flex items-center justify-center">
              <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" d="M2 2l8 8M10 2L2 10" />
              </svg>
            </span>
            Absent
          </span>
          <span className="flex items-center gap-1.5 text-xs text-slate dark:text-dark-muted">
            <span className="text-slate/30">–</span>
            No school
          </span>
        </div>
      </div>
    </section>
  );
}
