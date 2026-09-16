"use client";

/**
 * SchoolAdminLinks
 *
 * A teacher can be granted school-wide rights — manage the timetable, the
 * student register, staff records — on top of their teaching. Those management
 * screens live in the staff portal, so without a signpost the teacher holds
 * the permission and has no way to reach it.
 *
 * This renders one card per area they actually hold, and nothing at all when
 * they hold none, so an ordinary teacher's pages are unchanged.
 *
 * Each card links to the real screen rather than a copy: the same page the
 * Principal and admin staff use, guarded by the same module permission.
 */

import { useId } from "react";
import Link from "next/link";
import {
  CalendarDays, Users, UserCheck, Archive, Landmark, Library,
  BookOpen, Building2,
  type LucideIcon,
} from "lucide-react";
import { usePermissions } from "@/components/PermissionProvider";

interface AdminArea {
  /** Module that must be held (manage or configure) for this to appear. */
  module:      string;
  href:        string;
  title:       string;
  description: string;
  Icon:        LucideIcon;
}

/**
 * Ordered so the areas a teacher is most likely to hold come first.
 * Every href points into the staff portal, which is where these screens live.
 *
 * Accommodation is deliberately absent — that page is still a one-line
 * redirect into /principal. Classes, Subjects and Departments now have real
 * screens under /staff (guarded by the matching module permission), so they
 * are listed here too.
 */
const ADMIN_AREAS: AdminArea[] = [
  {
    module: "TIMETABLE", href: "/staff/timetable",
    title: "School Timetable",
    description: "Generate, build, and publish the school-wide timetable.",
    Icon: CalendarDays,
  },
  {
    module: "STUDENTS", href: "/staff/students",
    title: "School Students",
    description: "The full student register, beyond the classes you teach.",
    Icon: Users,
  },
  {
    module: "CLASSES", href: "/staff/classes",
    title: "Classes",
    description: "Create classes, streams, and assign class teachers.",
    Icon: Users,
  },
  {
    module: "SUBJECTS", href: "/staff/subjects",
    title: "Subjects",
    description: "The master subject list, curriculum frameworks, and forms.",
    Icon: BookOpen,
  },
  {
    module: "DEPARTMENTS", href: "/staff/departments",
    title: "Departments",
    description: "Departments, heads of department, and subject grouping.",
    Icon: Building2,
  },
  {
    module: "STAFF", href: "/staff/directory",
    title: "Staff",
    description: "Staff records, departments, and contact details.",
    Icon: UserCheck,
  },
  {
    module: "HISTORY", href: "/staff/history",
    title: "Archives",
    description: "Leavers, graduands, and staff who have left.",
    Icon: Archive,
  },
  {
    module: "FEES", href: "/staff/finance",
    title: "Finance",
    description: "Fee structures, invoicing, and payments.",
    Icon: Landmark,
  },
  {
    module: "LIBRARY", href: "/staff/library",
    title: "Library",
    description: "Catalogue, cards, borrowing, and fines.",
    Icon: Library,
  },
];

export default function SchoolAdminLinks({
  /** Restrict to these modules. Omit to show every area the teacher holds. */
  only,
  /** Heading shown above the cards. */
  title = "School administration",
  /** Sub-heading; pass null to drop it on focused, single-card placements. */
  subtitle = "Areas you manage for the whole school, beyond your own classes.",
  /** Spacing for the section. Defaults to sitting below existing content. */
  className = "mt-8",
}: {
  only?: string[];
  title?: string;
  subtitle?: string | null;
  className?: string;
}) {
  const headingId = useId();
  const { permissions } = usePermissions();
  const modules = permissions?.modules as
    | Record<string, { canManage?: boolean; canConfigure?: boolean }>
    | undefined;

  if (!modules) return null;

  const areas = ADMIN_AREAS.filter((a) => {
    if (only && !only.includes(a.module)) return false;
    const held = modules[a.module];
    return Boolean(held?.canManage || held?.canConfigure);
  });

  if (areas.length === 0) return null;

  return (
    <section className={className} aria-labelledby={headingId}>
      <div className="mb-3">
        <h2 id={headingId} className="text-sm font-semibold text-foreground">
          {title}
        </h2>
        {subtitle && <p className="text-xs text-slate mt-0.5">{subtitle}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {areas.map(({ href, title: cardTitle, description, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group bg-card border border-border rounded-xl p-4 flex items-start gap-3
                       hover:border-teal/40 hover:shadow-sm transition-all duration-150
                       dark:hover:border-teal/30"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal/10 text-teal">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground group-hover:text-teal transition-colors">
                {cardTitle}
              </span>
              <span className="block text-xs text-slate mt-0.5 leading-snug">
                {description}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
