/**
 * UpcomingEvents
 *
 * A horizontal row of upcoming school calendar events, matching the mockup.
 * Server-renderable.
 */

import Link from "next/link";

export interface UpcomingEvent {
  id:        string;
  title:     string;
  dateLabel: string;       // e.g. "Friday, 6 Sep 2024"
  day:       number;       // e.g. 6
  month:     string;       // e.g. "SEP"
}

interface Props {
  events:      UpcomingEvent[];
  calendarHref: string;
}

export default function UpcomingEvents({ events, calendarHref }: Props) {
  if (events.length === 0) return null;

  return (
    <section aria-labelledby="events-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="events-heading" className="text-base font-semibold text-ink dark:text-dark-text">
          Upcoming events
        </h2>
        <Link href={calendarHref} className="text-xs font-medium text-teal hover:underline">
          View calendar →
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {events.map((event) => (
          <Link
            key={event.id}
            href={calendarHref}
            className="flex items-center gap-4 bg-white dark:bg-dark-surface
                       border border-line dark:border-dark-border rounded-2xl px-4 py-3.5 shadow-xs
                       hover:border-teal/40 hover:shadow-sm transition-all group"
          >
            {/* Date chip */}
            <div className="flex flex-col items-center justify-center w-11 h-11
                            rounded-xl bg-[#F04438]/10 shrink-0 text-center">
              <span className="text-lg font-bold text-[#F04438] leading-none">{event.day}</span>
              <span className="text-[9px] font-bold text-[#F04438] uppercase tracking-widest leading-none mt-0.5">
                {event.month}
              </span>
            </div>

            {/* Info */}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink dark:text-dark-text truncate group-hover:text-teal transition-colors">
                {event.title}
              </p>
              <p className="text-xs text-slate dark:text-dark-muted truncate">{event.dateLabel}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
