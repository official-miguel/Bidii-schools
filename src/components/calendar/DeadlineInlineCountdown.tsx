"use client";

/**
 * DeadlineInlineCountdown
 *
 * Compact inline badge used inside the CalendarView day-detail modal for any
 * event that has a principal deadline (closingDate) set. Updates every minute.
 */

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface Props {
  /** YYYY-MM-DD — the event's closingDate (date-only). */
  deadlineDate: string;
}

export default function DeadlineInlineCountdown({ deadlineDate }: Props) {
  const [text,   setText]   = useState("");
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    // End-of-day UTC so "due today" events aren't instantly overdue at midnight.
    const ts = new Date(`${deadlineDate}T23:59:59Z`).getTime();

    function calc() {
      const diff = ts - Date.now();
      if (diff <= 0) { setText("Deadline passed"); setUrgent(true); return; }
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
  }, [deadlineDate]);

  if (!text) return null;

  return (
    <span className={`
      inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold
      ${urgent
        ? "bg-danger/10 text-danger dark:bg-danger/20"
        : "bg-warn/10 text-warn dark:bg-warn/20"
      }
    `}>
      <Clock className="h-3 w-3 shrink-0" />
      {text}
    </span>
  );
}
