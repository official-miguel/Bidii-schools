/**
 * DashboardMiniStat
 *
 * Small stat tile used in the teacher/staff dashboard:
 *   - Icon at the top-left in a soft-coloured square
 *   - LABEL in small caps below the icon
 *   - Large number
 *   - Sub-label ("Total students", "0%", "No cases", etc.)
 *
 * Designed to sit in a 4-column grid matching the mockup.
 * Tappable when `href` is provided.
 */

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Color = "teal" | "success" | "warn" | "danger" | "info";

interface Props {
  label:    string;
  value:    number | string;
  sub:      string;
  icon:     LucideIcon;
  color?:   Color;
  href?:    string;
  /** Optional small badge shown in the sub-label position (e.g. "0%") */
  badge?:   string;
  badgeColor?: "success" | "warn" | "danger";
}

const colorMap: Record<Color, { iconBg: string; iconColor: string }> = {
  teal:    { iconBg: "bg-teal/10",       iconColor: "text-teal"    },
  success: { iconBg: "bg-success-bg",    iconColor: "text-success" },
  warn:    { iconBg: "bg-warn-bg",       iconColor: "text-warn"    },
  danger:  { iconBg: "bg-danger-bg",     iconColor: "text-danger"  },
  info:    { iconBg: "bg-info/10",       iconColor: "text-info"    },
};

const badgeMap = {
  success: "text-success",
  warn:    "text-warn",
  danger:  "text-danger",
};

export default function DashboardMiniStat({
  label, value, sub, icon: Icon, color = "teal", href, badge, badgeColor = "success",
}: Props) {
  const { iconBg, iconColor } = colorMap[color];

  const inner = (
    <div className="bg-card border border-line rounded-xl p-3 shadow-xs h-full
                    dark:bg-dark-surface dark:border-dark-border
                    hover:border-teal/30 hover:shadow-sm transition-all duration-150">
      {/* Icon */}
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${iconBg}`}>
        <Icon className={`h-4 w-4 ${iconColor}`} strokeWidth={1.8} aria-hidden="true" />
      </div>

      {/* Label */}
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate dark:text-dark-muted mb-1 truncate leading-tight">
        {label}
      </p>

      {/* Value */}
      <p className="text-xl font-bold text-ink dark:text-dark-text leading-none">
        {value}
      </p>

      {/* Sub-label or badge */}
      {badge ? (
        <p className={`text-[10px] font-semibold mt-1 ${badgeMap[badgeColor]}`}>
          {badge}
        </p>
      ) : (
        <p className="text-[10px] text-slate dark:text-dark-muted mt-1 leading-tight truncate">
          {sub}
        </p>
      )}
    </div>
  );

  if (href) {
    return <Link href={href} className="block h-full">{inner}</Link>;
  }
  return inner;
}
