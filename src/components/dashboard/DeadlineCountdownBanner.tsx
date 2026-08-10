"use client";

/**
 * DeadlineCountdownBanner
 *
 * Compact inline list of principal-set deadlines shown on teacher/staff
 * dashboards. Intentionally lightweight — no cards, just a tight bordered
 * section that sits comfortably between other dashboard widgets.
 *
 * Data is passed as serialised props (Date → ISO string) because this
 * component is a Client Component while UnifiedDashboard is a Server Component.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, CalendarClock, AlertCircle } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

export type DeadlineItem = {
  id:          string;
  title:       string;
  description: string | null;
  /** ISO string of CalendarEvent.closingDate — the actual deadline date. */
  deadlineAt:  string;
  /** ISO string of CalendarEvent.date — when the event starts. */
  eventDate:   string;
};

interface Props {
  deadlines:    DeadlineItem[];
  calendarHref: string;
}

// ── Per-row countdown ──────────────────────────────────────────────────────

function useCountdown(deadlineIso: string) {
  const [text,   setText]   = useState("…");
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    const ts = new Date(deadlineIso).getTime();
    function calc() {
      const diff = ts - Date.now();
      if (diff <= 0) { setText("Overdue"); setUrgent(true); return; }
      const days  = Math.floor(diff / 86_400_000);
      const hours = Math.floor((diff % 86_400_000) / 3_600_000);
      if (days > 0) {
        setText(`${days}d ${hours}h`);
        setUrgent(days <= 2);
      } else {
        const mins = Math.floor((diff % 3_600_000) / 60_000);
        setText(`${hours}h ${mins}m`);
        setUrgent(true);
      }
    }
    calc();
    const id = setInterval(calc, 60_000);
    return () => clearInterval(id);
  }, [deadlineIso]);

  return { text, urgent };
}

// ── Single row ─────────────────────────────────────────────────────────────

function DeadlineRow({ item, calendarHref }: { item: DeadlineItem; calendarHref: string }) {
  const { text, urgent } = useCountdown(item.deadlineAt);

  const dueDateLabel = new Date(item.deadlineAt).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });

  return (
    <Link
      href={calendarHref}
      className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-paper dark:hover:bg-dark-surface/60 transition-colors group"
    >
      {/* Left — icon + title */}
      <div className="flex items-center gap-2 min-w-0">
        {urgent
          ? <AlertCircle className="h-3.5 w-3.5 shrink-0 text-danger" />
          : <CalendarClock className="h-3.5 w-3.5 shrink-0 text-warn" />
        }
        <span className="text-sm text-ink dark:text-dark-text truncate group-hover:underline">
          {item.title}
        </span>
        <span className="text-xs text-slate dark:text-dark-muted shrink-0 hidden sm:inline">
          · {dueDateLabel}
        </span>
      </div>

      {/* Right — countdown pill */}
      <span className={`
        shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold
        ${urgent
          ? "bg-danger/10 text-danger dark:bg-danger/20"
          : "bg-warn/10 text-warn dark:bg-warn/20"
        }
      `}>
        <Clock className="h-3 w-3" />
        {text}
      </span>
    </Link>
  );
}

// ── Banner ──────────────────────────────────────────────────────────────────

export default function DeadlineCountdownBanner({ deadlines, calendarHref }: Props) {
  if (deadlines.length === 0) return null;

  return (
    <section
      aria-label="Active deadlines"
      className="bg-card border border-line rounded-xl overflow-hidden dark:bg-dark-surface dark:border-dark-border"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-line dark:border-dark-border">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-slate dark:text-dark-muted" />
          <span className="text-sm font-medium text-ink dark:text-dark-text">
            Deadlines
          </span>
          <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-danger/15 text-danger text-[10px] font-bold">
            {deadlines.length}
          </span>
        </div>
        <Link
          href={calendarHref}
          className="text-xs text-teal hover:text-teal-dark hover:underline transition-colors"
        >
          View calendar
        </Link>
      </div>

      {/* Rows */}
      <div className="divide-y divide-line dark:divide-dark-border">
        {deadlines.map((d) => (
          <DeadlineRow key={d.id} item={d} calendarHref={calendarHref} />
        ))}
      </div>
    </section>
  );
}
