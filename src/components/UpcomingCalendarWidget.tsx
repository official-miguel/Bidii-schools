import Link from "next/link";
import type { UpcomingCalendarItem } from "@/lib/calendarUpcoming";

function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-KE", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export default function UpcomingCalendarWidget({
  items,
  calendarHref,
}: {
  items: UpcomingCalendarItem[];
  calendarHref: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-foreground">Calendar — next 14 days</p>
        <Link href={calendarHref} className="text-xs text-teal hover:text-teal-dark hover:underline transition-colors">
          View calendar
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate">Nothing on the calendar in the next two weeks.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-2 text-sm">
              <span className="text-foreground min-w-0 flex-1">
                {item.title}
                {item.isHoliday && <span className="text-slate"> · public holiday</span>}
              </span>
              <span className="text-slate text-xs shrink-0 whitespace-nowrap">{formatShortDate(item.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
