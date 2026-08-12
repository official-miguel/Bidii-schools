import Link from "next/link";
import { getEffectivePermissions, getRoleDisplayLabel, MODULE_INFO } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getUpcomingCalendarItems } from "@/lib/calendarUpcoming";
import UpcomingCalendarWidget from "@/components/UpcomingCalendarWidget";
import type { User } from "@prisma/client";
import type { Module } from "@prisma/client";
import type { ModuleAccess } from "@/lib/permissions";

interface Props { user: User }

export default async function GenericStaffDashboard({ user }: Props) {
  const schoolId = user.schoolId!;
  const today    = new Date();

  const [school, roleLabel, perms, upcomingCalendar] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
    getRoleDisplayLabel(user),
    getEffectivePermissions(user),
    getUpcomingCalendarItems(schoolId, { days: 14, limit: 5 }),
  ]);

  const granted = (Object.entries(perms) as [Module, ModuleAccess][])
    .filter(([, v]) => v?.canView);

  const MODULE_HREF: Partial<Record<Module, string>> = {
    STUDENTS:             "/staff/students",
    LIBRARY:              "/staff/library",
    COMMUNICATION:        "/staff/communication",
    CALENDAR:             "/staff/calendar",
    RECORDS_DISCIPLINE:   "/staff/records",
    RECORDS_ACHIEVEMENTS: "/staff/achievements",
    ACCOMMODATION:        "/staff/accommodation",
    DEPARTMENTS:          "/staff/departments",
    STAFF:                "/staff/directory",
    CLASSES:              "/staff/classes",
    TIMETABLE:            "/staff/timetable",
    ASSESSMENTS:          "/staff/assessments",
    REPORTS:              "/staff/reports",
    ANALYTICS:            "/staff/analytics",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink dark:text-dark-text">{school?.name}</h1>
        <p className="text-slate text-sm mt-1 dark:text-dark-muted">
          Signed in as {roleLabel} · {today.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {granted.length === 0 ? (
        <div className="bg-card border border-line rounded-xl p-8 text-center shadow-xs
                        dark:bg-dark-surface dark:border-dark-border">
          <p className="text-sm font-medium text-ink dark:text-dark-text mb-1">No modules enabled</p>
          <p className="text-sm text-slate dark:text-dark-muted">
            Your role doesn&apos;t have any modules enabled yet. Ask the principal to grant access from
            Staff Roles &amp; Permissions.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {granted.map(([module, access]) => {
            const info = MODULE_INFO[module];
            const href = MODULE_HREF[module];
            const card = (
              <div className="bg-card border border-line rounded-xl p-5 h-full shadow-xs
                              hover:border-teal/40 hover:shadow-sm transition-all
                              dark:bg-dark-surface dark:border-dark-border dark:hover:border-teal/30">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <p className="font-medium text-ink dark:text-dark-text text-sm">{info.label}</p>
                  <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${
                    access.canManage
                      ? "bg-teal-50 text-teal dark:bg-teal/15 dark:text-teal"
                      : "bg-line text-slate dark:bg-dark-border dark:text-dark-muted"
                  }`}>
                    {access.canManage ? "Full access" : "View only"}
                  </span>
                </div>
                <p className="text-xs text-slate dark:text-dark-muted">{info.description}</p>
                {!href && <p className="text-[10px] text-slate/50 mt-2 dark:text-dark-muted/50">Coming soon in the staff portal.</p>}
              </div>
            );
            return href
              ? <Link key={module} href={href} className="block">{card}</Link>
              : <div key={module}>{card}</div>;
          })}
        </div>
      )}

      <UpcomingCalendarWidget items={upcomingCalendar} calendarHref="/staff/calendar" />
    </div>
  );
}
