/**
 * TodaysAssignments
 *
 * Server-renderable list of today's/upcoming diary assignments.
 * Shows subject icon, title, description, and a due-date badge.
 */

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { BookOpen, FlaskConical, Calculator } from "lucide-react";

export interface AssignmentItem {
  id:          string;
  subject:     string;
  description: string;
  dueLabel:    string;   // e.g. "Due tomorrow", "Due Friday", "Due Monday"
  urgent:      boolean;  // true → red badge
}

const SUBJECT_ICONS: Record<string, LucideIcon> = {
  Mathematics:   Calculator,
  Maths:         Calculator,
  Biology:       FlaskConical,
  Chemistry:     FlaskConical,
  Physics:       FlaskConical,
};

const SUBJECT_COLORS: Record<string, { bg: string; color: string }> = {
  Mathematics:   { bg: "bg-[#F3EEFF]", color: "text-[#7B5EA7]" },
  Maths:         { bg: "bg-[#F3EEFF]", color: "text-[#7B5EA7]" },
  English:       { bg: "bg-[#EFF8FF]", color: "text-[#2E90FA]" },
  Biology:       { bg: "bg-[#EDFAF4]", color: "text-[#17B26A]" },
  Chemistry:     { bg: "bg-[#EDFAF4]", color: "text-[#17B26A]" },
  Physics:       { bg: "bg-[#FFF3E8]", color: "text-[#F79009]" },
};

function SubjectIcon({ subject }: { subject: string }) {
  const Icon   = SUBJECT_ICONS[subject] ?? BookOpen;
  const colors = SUBJECT_COLORS[subject] ?? { bg: "bg-teal/10", color: "text-teal" };
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colors.bg}`}>
      <Icon className={`h-5 w-5 ${colors.color}`} strokeWidth={1.8} aria-hidden="true" />
    </div>
  );
}

interface Props {
  items:    AssignmentItem[];
  viewHref: string;
}

export default function TodaysAssignments({ items, viewHref }: Props) {
  return (
    <section aria-labelledby="assignments-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="assignments-heading" className="text-base font-semibold text-ink dark:text-dark-text">
          Today&apos;s assignments
        </h2>
        <Link href={viewHref} className="text-xs font-medium text-teal hover:underline">
          View diary →
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-line
                        dark:border-dark-border px-5 py-6 text-center">
          <p className="text-sm text-slate dark:text-dark-muted">No assignments due soon.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-line
                        dark:border-dark-border overflow-hidden shadow-xs divide-y divide-line
                        dark:divide-dark-border">
          {items.map((item) => (
            <Link
              key={item.id}
              href={viewHref}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-[#F9FAFB]
                         dark:hover:bg-dark-border transition-colors group"
            >
              <SubjectIcon subject={item.subject} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink dark:text-dark-text truncate">
                  {item.subject}
                </p>
                <p className="text-xs text-slate dark:text-dark-muted truncate">
                  {item.description}
                </p>
              </div>
              <span
                className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap
                            ${item.urgent
                              ? "text-[#F04438] bg-[#FEF3F2]"
                              : "text-slate dark:text-dark-muted"
                            }`}
              >
                {item.dueLabel}
              </span>
              <svg className="h-4 w-4 text-slate/40 shrink-0 group-hover:text-teal transition-colors"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
