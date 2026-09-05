/**
 * RecentActivity
 *
 * A chronological activity feed for the parent dashboard.
 * Each item has a coloured icon chip, title, and timestamp.
 * Server-renderable (no client state needed).
 */

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  Megaphone,
  CheckCircle,
  BarChart2,
  Bell,
  BookOpen,
  AlertTriangle,
} from "lucide-react";

type ActivityType =
  | "assignment_posted"
  | "announcement"
  | "attendance_present"
  | "attendance_absent"
  | "exam_result"
  | "notification"
  | "diary"
  | "behaviour";

export interface ActivityItem {
  id:         string;
  type:       ActivityType;
  title:      string;
  timeLabel:  string;  // e.g. "10:15 AM", "Yesterday · 3:42 PM", "Mon · 2:30 PM"
}

const TYPE_CONFIG: Record<
  ActivityType,
  { Icon: LucideIcon; bg: string; color: string }
> = {
  assignment_posted:  { Icon: ClipboardList, bg: "bg-[#FFF3E8]", color: "text-[#F79009]" },
  announcement:       { Icon: Megaphone,    bg: "bg-[#EFF8FF]", color: "text-[#2E90FA]" },
  attendance_present: { Icon: CheckCircle,  bg: "bg-[#EDFAF4]", color: "text-[#17B26A]" },
  attendance_absent:  { Icon: AlertTriangle, bg: "bg-[#FEF3F2]", color: "text-[#F04438]" },
  exam_result:        { Icon: BarChart2,    bg: "bg-[#F3EEFF]", color: "text-[#7B5EA7]" },
  notification:       { Icon: Bell,         bg: "bg-[#F3EEFF]", color: "text-[#7B5EA7]" },
  diary:              { Icon: BookOpen,     bg: "bg-[#EFF8FF]", color: "text-[#2E90FA]" },
  behaviour:          { Icon: AlertTriangle, bg: "bg-[#FFF3E8]", color: "text-[#F79009]" },
};

interface Props {
  items:   ActivityItem[];
  viewHref: string;
}

export default function RecentActivity({ items, viewHref }: Props) {
  return (
    <section aria-labelledby="activity-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="activity-heading" className="text-base font-semibold text-ink dark:text-dark-text">
          Recent activity
        </h2>
        <Link href={viewHref} className="text-xs font-medium text-teal hover:underline">
          View all →
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-line
                        dark:border-dark-border px-5 py-6 text-center">
          <p className="text-sm text-slate dark:text-dark-muted">No recent activity.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-line
                        dark:border-dark-border overflow-hidden shadow-xs divide-y divide-line
                        dark:divide-dark-border">
          {items.map((item) => {
            const cfg = TYPE_CONFIG[item.type];
            return (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
                  <cfg.Icon className={`h-4 w-4 ${cfg.color}`} strokeWidth={1.8} aria-hidden="true" />
                </div>
                <p className="flex-1 text-sm text-ink dark:text-dark-text min-w-0 truncate">
                  {item.title}
                </p>
                <p className="text-xs text-slate dark:text-dark-muted shrink-0 whitespace-nowrap pl-2">
                  {item.timeLabel}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
