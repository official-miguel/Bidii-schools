/**
 * DashboardRecentActivity
 *
 * Recent-activity feed shown on teacher/staff dashboards.
 * Matches the mockup: icon chip + title + class/meta + time + chevron.
 *
 * Server-renderable — no client state needed.
 */

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  Megaphone,
  CheckSquare,
  BookMarked,
  Bell,
  ChevronRight,
} from "lucide-react";

export type RecentActivityType =
  | "assignment"
  | "attendance"
  | "announcement"
  | "diary"
  | "notification";

export interface RecentActivityItem {
  id:        string;
  type:      RecentActivityType;
  title:     string;
  meta:      string;        // e.g. "Grade 12 A · Due: 10 Sep 2026"
  timeLabel: string;        // e.g. "10:15 AM", "Yesterday · 3:42 PM"
  href?:     string;
}

const TYPE_CONFIG: Record<
  RecentActivityType,
  { Icon: LucideIcon; bg: string; color: string }
> = {
  assignment:   { Icon: ClipboardList, bg: "bg-[#F3EEFF]", color: "text-[#7B5EA7]" },
  attendance:   { Icon: CheckSquare,   bg: "bg-[#EDFAF4]", color: "text-[#17B26A]" },
  announcement: { Icon: Megaphone,     bg: "bg-[#EFF8FF]", color: "text-[#2E90FA]" },
  diary:        { Icon: BookMarked,    bg: "bg-[#FFF3E8]", color: "text-[#F79009]" },
  notification: { Icon: Bell,          bg: "bg-[#F3EEFF]", color: "text-[#7B5EA7]" },
};

interface Props {
  items:   RecentActivityItem[];
  viewHref: string;
}

export default function DashboardRecentActivity({ items, viewHref }: Props) {
  return (
    <section aria-labelledby="recent-activity-heading">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <h2
          id="recent-activity-heading"
          className="text-base font-semibold text-ink dark:text-dark-text"
        >
          Recent activity
        </h2>
        <Link href={viewHref} className="text-xs font-medium text-teal hover:underline">
          View all
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="bg-card border border-line rounded-xl px-4 py-6 text-center shadow-xs
                        dark:bg-dark-surface dark:border-dark-border">
          <p className="text-sm text-slate dark:text-dark-muted">No recent activity.</p>
        </div>
      ) : (
        <div className="bg-card border border-line rounded-xl shadow-xs overflow-hidden
                        dark:bg-dark-surface dark:border-dark-border
                        divide-y divide-line dark:divide-dark-border">
          {items.map((item) => {
            const cfg = TYPE_CONFIG[item.type];
            const Row = (
              <div className="flex items-center gap-3 px-4 py-3.5 group">
                {/* Icon chip */}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg}`}>
                  <cfg.Icon className={`h-4 w-4 ${cfg.color}`} strokeWidth={1.8} aria-hidden="true" />
                </div>

                {/* Text */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink dark:text-dark-text truncate">
                    {item.title}
                  </p>
                  <p className="text-xs text-slate dark:text-dark-muted truncate mt-0.5">
                    {item.meta}
                  </p>
                </div>

                {/* Time + chevron */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-slate dark:text-dark-muted whitespace-nowrap">
                    {item.timeLabel}
                  </span>
                  <ChevronRight
                    className="h-4 w-4 text-slate/30 group-hover:text-teal transition-colors"
                    aria-hidden="true"
                  />
                </div>
              </div>
            );

            if (item.href) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block hover:bg-[#F9FAFB] dark:hover:bg-dark-border transition-colors"
                >
                  {Row}
                </Link>
              );
            }
            return <div key={item.id}>{Row}</div>;
          })}
        </div>
      )}
    </section>
  );
}
