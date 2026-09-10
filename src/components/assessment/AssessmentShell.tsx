"use client";

/**
 * Inner-sidebar shell for the Examination & Analysis module.
 *
 * Renders a left nav rail with section links and the page content on the
 * right. Used by both the principal and teacher assessment overview pages so
 * both roles get the same split-pane UX when they click "Exams & Analysis".
 *
 * On mobile the nav collapses to two stacked horizontal scrollable strips:
 *   1. contextNav  — broader academics context (Classes / Subjects / …)  ← top
 *   2. inner nav   — module sections (Overview / Mark Sheets / …)         ← below
 * Both strips are sticky so they travel together as the user scrolls.
 *
 * IMPORTANT: icon is a plain string key (not a React component) so that
 * Server Component layouts can pass it across the serialization boundary
 * without triggering the "Functions cannot be passed to Client Components"
 * error. The icon map lives here (client-side only).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  BarChart2,
  Building2,
  Trophy,
  FileText,
  Settings2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Icon registry — all icons used by assessment nav items live here.
// Add new entries as needed; layouts reference them by key string.
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  overview:         LayoutDashboard,
  marksheet:        ClipboardList,
  dashboard:        BarChart2,
  "dept-analytics": Building2,
  performance:      Trophy,
  "report-cards":   FileText,
  "exam-setup":     Settings2,
};

export type AssessmentIconKey = keyof typeof ICON_MAP;

export interface AssessmentNavItem {
  href: string;
  label: string;
  /**
   * A string key from ICON_MAP. Using a string (not a LucideIcon component)
   * keeps this prop serialisable across the Server → Client boundary.
   */
  icon: AssessmentIconKey;
  /** If true, only matches this exact path (not children). */
  exact?: boolean;
}

interface Props {
  navItems: AssessmentNavItem[];
  children: React.ReactNode;
  /**
   * Optional context-level navigation rendered as the FIRST (top) strip on
   * mobile — above the module inner-nav. Pass a <ContextNavigation /> node
   * from the layout so it always appears regardless of which sub-page is
   * active.
   */
  contextNav?: React.ReactNode;
}

export default function AssessmentShell({ navItems, children, contextNav }: Props) {
  const pathname = usePathname();

  function isActive(item: AssessmentNavItem) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + "/") || pathname.startsWith(item.href + "?");
  }

  return (
    <div className="flex gap-0 min-h-[calc(100vh-64px)]">
      {/* ── Inner sidebar — desktop only ── */}
      <aside className="hidden md:flex flex-col w-52 shrink-0 border-r border-border
                        bg-background/60 py-4 px-2 gap-0.5 sticky top-16 self-start
                        max-h-[calc(100vh-4rem)] overflow-y-auto/60">
        {navItems.map((item) => {
          const active = isActive(item);
          const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-100 ${
                active
                  ? "bg-teal text-white font-medium shadow-xs"
                  : "text-slate hover:bg-teal-50 hover:text-teal"
              }`}
            >
              <Icon
                className="w-4 h-4 shrink-0"
                strokeWidth={active ? 2.2 : 1.8}
                aria-hidden="true"
              />
              <span className="leading-snug">{item.label}</span>
            </Link>
          );
        })}
      </aside>

      {/* ── Right side: mobile nav strips + page content ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile-only nav strips */}
        <div className="md:hidden">
          {/* Strip 1 — context nav (Classes / Subjects / …) */}
          {contextNav && (
            <div className="sticky top-16 z-20 bg-background/95 border-b border-border/95
                            overflow-x-auto scrollbar-none px-3 pt-2 pb-0">
              {contextNav}
            </div>
          )}

          {/* Strip 2 — module inner nav (Overview / Mark Sheets / …) */}
          <div className={`flex overflow-x-auto gap-1 px-3 py-2 border-b border-border
                          bg-background/80 scrollbar-none/80
                          ${contextNav ? "sticky top-[calc(4rem+40px)] z-10" : "sticky top-16 z-10"}`}>
            {navItems.map((item) => {
              const active = isActive(item);
              const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5
                              text-xs font-medium transition-colors duration-100 whitespace-nowrap ${
                    active
                      ? "bg-teal text-white shadow-xs"
                      : "bg-card border border-border text-slate hover:border-teal/40 hover:text-teal dark:hover:border-teal/30"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Page content — single instance, padding adapts per breakpoint */}
        <div className="px-4 py-5 md:px-6">{children}</div>
      </div>
    </div>
  );
}
