"use client";

/**
 * CalendarEventList
 *
 * Renders all school calendar events grouped by month, with a date badge,
 * event type badge, and optional description preview. Shows a friendly empty
 * state when no events are available.
 *
 * Requirements: 11.1, 11.2, 11.4
 */

import { CalendarDays } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CalendarEventItem {
  id:          string;
  title:       string;
  description?: string | null;
  date:        string; // ISO string
  type:        string;
}

interface Props {
  events: CalendarEventItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a "Month YYYY" label for grouping, e.g. "September 2025".
 * Uses UTC so the group key is stable regardless of the user's timezone.
 */
function monthLabel(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-KE", {
    month: "long",
    year:  "numeric",
    timeZone: "UTC",
  });
}

function dayLabel(isoDate: string): { day: string; month: string } {
  const d = new Date(isoDate);
  return {
    day:   d.toLocaleDateString("en-KE", { day: "2-digit", timeZone: "UTC" }),
    month: d.toLocaleDateString("en-KE", { month: "short", timeZone: "UTC" }),
  };
}

// Badge colours per event type
const TYPE_BADGE: Record<string, string> = {
  EVENT:   "bg-teal/10 text-teal",
  EXAM:    "bg-warn/10 text-warn",
  HOLIDAY: "bg-success-bg text-success",
  MEETING: "bg-info/10 text-info",
  OTHER:   "bg-slate/10 text-slate",
};

function typeBadgeClass(type: string) {
  return TYPE_BADGE[type] ?? TYPE_BADGE.OTHER;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CalendarEventList({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-card p-10 flex flex-col items-center gap-3 text-center dark:bg-dark-surface dark:border-dark-border">
        <CalendarDays className="h-10 w-10 text-slate dark:text-dark-muted" />
        <div>
          <p className="text-sm font-semibold text-ink dark:text-dark-text">
            📅 No upcoming events
          </p>
          <p className="text-xs text-slate dark:text-dark-muted mt-1">
            School events and important dates will appear here.
          </p>
        </div>
      </div>
    );
  }

  // Group events by "Month YYYY"
  const grouped: Map<string, CalendarEventItem[]> = new Map();
  for (const event of events) {
    const key = monthLabel(event.date);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(event);
    } else {
      grouped.set(key, [event]);
    }
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([month, items]) => (
        <section key={month}>
          {/* Month heading */}
          <p className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted mb-3">
            {month}
          </p>

          <div className="space-y-3">
            {items.map((event) => {
              const { day, month: mon } = dayLabel(event.date);
              return (
                <div
                  key={event.id}
                  className="flex items-start gap-4 rounded-xl border border-line bg-card p-4 shadow-xs
                             dark:bg-dark-surface dark:border-dark-border"
                >
                  {/* Date badge */}
                  <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-teal/10 text-teal shrink-0">
                    <span className="text-lg font-bold leading-none">{day}</span>
                    <span className="text-[10px] font-medium leading-none mt-0.5 uppercase">{mon}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-ink dark:text-dark-text truncate">
                        {event.title}
                      </p>
                      <span
                        className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full
                                    ${typeBadgeClass(event.type)}`}
                      >
                        {event.type}
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-xs text-slate dark:text-dark-muted mt-1 line-clamp-2">
                        {event.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
