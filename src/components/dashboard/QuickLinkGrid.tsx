import Link from "next/link";
import { getLucideIcon } from "@/lib/utils/lucideIcon";

export interface QuickLink {
  label: string;
  href:  string;
  icon:  string;
}

export default function QuickLinkGrid({ links, title = "Quick actions" }: { links: QuickLink[]; title?: string }) {
  if (links.length === 0) return null;
  return (
    <div className="bg-card border border-line rounded-xl p-4 sm:p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
      <p className="text-sm font-semibold text-ink dark:text-dark-text mb-3">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {links.map((l) => {
          const Icon = getLucideIcon(l.icon);
          return (
            <Link
              key={l.href + l.label}
              href={l.href}
              className="flex items-center gap-2 px-2.5 sm:px-3 py-2.5 rounded-lg border border-line
                         hover:border-teal/40 hover:bg-teal-50 group transition-colors
                         dark:border-dark-border dark:hover:border-teal/40 dark:hover:bg-teal/5
                         min-h-[48px]"
            >
              <div className="shrink-0 w-7 h-7 rounded-md bg-teal/10 text-teal flex items-center justify-center
                              group-hover:bg-teal group-hover:text-white transition-colors">
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
              </div>
              <span className="text-xs font-medium text-ink leading-tight dark:text-dark-text">{l.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
