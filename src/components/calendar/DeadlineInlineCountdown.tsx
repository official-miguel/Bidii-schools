"use client";

/**
 * DeadlineInlineCountdown
 *
 * A compact inline badge used inside the CalendarView day-detail modal to
 * show a live countdown for any event that has a principal deadline set.
 * Mirrors the urgency colour logic from DeadlineCountdownBanner and
 * CountdownTimer but renders as a single tight pill.
 */

import { useEffect, useState } from "react";

interface Props {
  /** YYYY-MM-DD string (the event's closingDate stored as a date-only value). */
  deadlineDate: string;
}

export default function DeadlineInlineCountdown({ deadlineDate }: Props) {
  const [text,   setText]   = useState("");
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    // Treat the deadline as end-of-day UTC so events due "today" aren't
    // immediately shown as overdue the moment the day starts.
    const deadlineTs = new Date(`${deadlineDate}T23:59:59Z`).getTime();

    function calc() {
      const diff = deadlineTs - Date.now();
      if (diff <= 0) {
        setText("Deadline passed");
        setUrgent(true);
        return;
      }
      const days  = Math.floor(diff / 86_400_000);
      const hours = Math.floor((diff % 86_400_000) / 3_600_000);
      const mins  = Math.floor((diff % 3_600_000)  / 60_000);

      if (days > 0) {
        setText(`⏰ ${days}d ${hours}h left`);
        setUrgent(days <= 2);
      } else {
        setText(`⏰ ${hours}h ${mins}m left`);
        setUrgent(true);
      }
    }

    calc();
    const id = setInterval(calc, 60_000);
    return () => clearInterval(id);
  }, [deadlineDate]);

  if (!text) return null;

  return (
    <span
      className={`
        inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold
        ${urgent
          ? "bg-danger/10 text-danger dark:bg-danger/20"
          : "bg-warn/10 text-warn dark:bg-warn/20"
        }
      `}
    >
      {text}
    </span>
  );
}
