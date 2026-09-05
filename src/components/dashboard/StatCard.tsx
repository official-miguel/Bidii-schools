import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label:      string;
  value:      number | string;
  href?:      string;
  icon?:      LucideIcon;
  color?:     "teal" | "danger" | "warn" | "success" | "info";
  sub?:       string;
  badge?:     string;
  badgeColor?: "danger" | "warn" | "success";
}

const colorMap = {
  teal:    { icon: "text-teal",    bg: "bg-teal/10" },
  danger:  { icon: "text-danger",  bg: "bg-danger-bg" },
  warn:    { icon: "text-warn",    bg: "bg-warn-bg" },
  success: { icon: "text-success", bg: "bg-success-bg" },
  info:    { icon: "text-info",    bg: "bg-info/10" },
};

const badgeColorMap = {
  danger:  "bg-danger-bg text-danger",
  warn:    "bg-warn-bg text-warn",
  success: "bg-success-bg text-success",
};

export default function StatCard({ label, value, href, icon: Icon, color = "teal", sub, badge, badgeColor = "danger" }: StatCardProps) {
  const c = colorMap[color];

  const inner = (
    <div className="bg-card border border-line rounded-xl p-3 sm:p-5 shadow-xs h-full
                    dark:bg-dark-surface dark:border-dark-border
                    hover:border-teal/40 hover:shadow-sm transition-all duration-150">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-slate dark:text-dark-muted truncate">
            {label}
          </p>
          <p className="text-2xl sm:text-3xl font-semibold text-ink dark:text-dark-text mt-1 leading-none break-all">
            {value}
          </p>
          {sub && <p className="text-[10px] sm:text-xs text-slate dark:text-dark-muted mt-1 leading-snug">{sub}</p>}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
          {Icon && (
            <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center ${c.bg}`}>
              <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${c.icon}`} strokeWidth={1.8} />
            </div>
          )}
          {badge && (
            <span className={`text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${badgeColorMap[badgeColor]}`}>
              {badge}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{inner}</Link>;
  }
  return inner;
}
