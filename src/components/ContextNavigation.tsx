"use client";

/**
 * ContextNavigation — horizontal tab strip for sub-section navigation.
 *
 * Rendered inside PageLayout's contextNav slot. Sits flush against the
 * bottom of the sticky page header, visually grouping tabs with the title.
 *
 * Variants:
 *  - "tabs"  (default) — underline-style tabs, no background
 *  - "pills"           — pill chips with a filled active state
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface ContextNavItem {
  href: string;
  label: string;
  /** Icon element rendered before the label */
  icon?: React.ReactNode;
  /** Match only this exact path, not descendants */
  exact?: boolean;
  /** Badge count shown as a small pill after the label */
  badge?: number;
}

interface Props {
  items: ContextNavItem[];
  variant?: "tabs" | "pills";
}

export default function ContextNavigation({ items, variant = "tabs" }: Props) {
  const pathname = usePathname();

  if (items.length === 0) return null;

  const isActive = (item: ContextNavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  if (variant === "pills") {
    return (
      <nav
        aria-label="Section navigation"
        className="flex flex-wrap gap-2 pb-4"
      >
        {items.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`
                inline-flex items-center gap-1.5 px-3.5 h-8 rounded-full
                text-sm font-medium transition-colors duration-100
                ${active
                  ? "bg-teal text-white shadow-sm"
                  : "bg-background border border-border text-slate hover:border-teal/40 hover:text-teal hover:bg-teal-50 dark:hover:border-teal/30 dark:hover:text-teal"
                }
              `}
            >
              {item.icon && (
                <span className="shrink-0 leading-none" aria-hidden="true">
                  {item.icon}
                </span>
              )}
              {item.label}
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`
                    ml-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px]
                    font-semibold flex items-center justify-center leading-none
                    ${active
                      ? "bg-card/25 text-white"
                      : "bg-teal/10 text-teal dark:bg-teal/20"
                    }
                  `}
                >
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    );
  }

  /* ── Tabs variant (default) ─────────────────────────────────────────── */
  return (
    <nav
      aria-label="Section navigation"
      className="flex gap-0 overflow-x-auto scrollbar-none -mb-px"
    >
      {items.map((item) => {
        const active = isActive(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`
              relative flex items-center gap-1.5 px-4 py-3
              text-sm font-medium whitespace-nowrap transition-colors duration-100
              border-b-2 focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-teal/20 focus-visible:ring-offset-0
              ${active
                ? "border-teal text-teal"
                : "border-transparent text-slate hover:text-foreground hover:border-border"
              }
            `}
          >
            {item.icon && (
              <span className="shrink-0 leading-none" aria-hidden="true">
                {item.icon}
              </span>
            )}
            {item.label}
            {item.badge !== undefined && item.badge > 0 && (
              <span
                className={`
                  ml-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px]
                  font-semibold flex items-center justify-center leading-none
                  ${active
                    ? "bg-teal/10 text-teal"
                    : "bg-line text-slate"
                  }
                `}
              >
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
