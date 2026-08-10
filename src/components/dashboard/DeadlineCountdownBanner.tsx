"use client";

/**
 * DeadlineCountdownBanner
 *
 * Displays active principal-set deadlines as a horizontal scroll of cards,
 * each with a live countdown timer. Rendered on teacher and staff dashboards.
 *
 * Data is passed as a serialised prop (Date → string) because this component
 * is client-side ("use client") while its parent (UnifiedDashboard) is a
 * React Server Component.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────

export type DeadlineItem = {
  id:          string;
  title:       string;
  description: string | null;
  /** ISO string of CalendarEvent.closingDate — the actual deadline. */
  deadlineAt:  string;
  /** ISO string of CalendarEvent.date — when the event starts. */
  eventDate:   string;
};

interface Props {
  deadlines:    DeadlineItem[];
  calendarHref: string;
}

// ── Countdown hook (per card) ───────────────────────────────────────────────

function useCountdown(deadlineIso: string) {
  const [text,   setText]   = useState("");
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    function calc() {
      const diff = new Date(deadlineIso).getTime() - Date.now();
      if (diff <= 0) {
        setText("Overdue");
        setUrgent(true);
        return;
      }
      const days  = Math.floor(diff / 86_400_000);
      const hours = Math.floor((diff % 86_400_000) / 3_600_000);
      const mins  = Math.floor((diff % 3_600_000)  / 60_000);

      if (days > 0) {
        setText(`${days}d ${hours}h left`);
        setUrgent(days <= 2);
      } else {
        setText(`${hours}h ${mins}m left`);
        setUrgent(true);
      }
    }
    calc();
    const id = setInterval(calc, 60_000);
    return () => clearInterval(id);
  }, [deadlineIso]);

  return { text, urgent };
}

// ── Single deadline card ────────────────────────────────────────────────────

function DeadlineCard({ item, calendarHref }: { item: DeadlineItem; calendarHref: string }) {
  const { text, urgent } = useCountdown(item.deadlineAt);

  const deadlineLabel = new Date(item.deadlineAt).toLocaleDateString("en-KE", {
    weekday: "short",
    day:     "numeric",
    month:   "short",
    year:    "numeric",
    timeZone: "UTC",
  });

  return (
    <Link
      href={calendarHref}
      className={`
        flex flex-col gap-2 min-w-[220px] max-w-[260px] shrink-0
        rounded-xl border p-4 transition-shadow hover:shadow-md
        ${urgent
          ? "bg-danger/5 border-danger/30 dark:bg-danger/10 dark:border-danger/40"
          : "bg-warn/5 border-warn/30 dark:bg-warn/10 dark:border-warn/40"
        }
      `}
    >
      {/* Countdown pill */}
      <span
        className={`
          self-start text-[11px] font-semibold px-2 py-0.5 rounded-full
          ${urgent
            ? "bg-danger/15 text-danger dark:bg-danger/25"
            : "bg-warn/15 text-warn dark:bg-warn/25"
          }
        `}
      >
        ⏰ {text}
      </span>

      {/* Title */}
      <p className="text-sm font-semibold text-ink dark:text-dark-text leading-snug line-clamp-2">
        {item.title}
      </p>

      {/* Optional description */}
      {item.description && (
        <p className="text-xs text-slate dark:text-dark-muted line-clamp-2">
          {item.description}
        </p>
      )}

      {/* Due date */}
      <p className="text-xs text-slate dark:text-dark-muted mt-auto pt-1 border-t border-current/10">
        Due: {deadlineLabel}
      </p>
    </Link>
  );
}

// ── Banner ──────────────────────────────────────────────────────────────────

export default function DeadlineCountdownBanner({ deadlines, calendarHref }: Props) {
  if (deadlines.length === 0) return null;

  return (
    <section aria-label="Active deadlines">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-ink dark:text-dark-text flex items-center gap-1.5">
          <span>🗓️</span>
          <span>Upcoming Deadlines</span>
          <span className="ml-1 inline-flex items-center justify-center h-4 w-4 rounded-full bg-danger text-white text-[10px] font-bold">
            {deadlines.length}
          </span>
        </h2>
        <Link
          href={calendarHref}
          className="text-xs text-teal hover:text-teal-dark hover:underline transition-colors"
        >
          View calendar
        </Link>
      </div>

      {/* Scrollable card row */}
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
        {deadlines.map((d) => (
          <DeadlineCard key={d.id} item={d} calendarHref={calendarHref} />
        ))}
      </div>
    </section>
  );
}
