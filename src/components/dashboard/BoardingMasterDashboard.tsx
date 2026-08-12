import Link from "next/link";
import { Home, Users, AlertTriangle, CheckCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUpcomingCalendarItems } from "@/lib/calendarUpcoming";
import UpcomingCalendarWidget from "@/components/UpcomingCalendarWidget";
import StatCard from "@/components/dashboard/StatCard";
import AlertBanner, { type AlertItem } from "@/components/dashboard/AlertBanner";
import QuickLinkGrid, { type QuickLink } from "@/components/dashboard/QuickLinkGrid";
import type { User } from "@prisma/client";

interface Props { user: User }

export default async function BoardingMasterDashboard({ user }: Props) {
  const schoolId = user.schoolId!;
  const today    = new Date();

  // Find the teacher record to get assigned dorms
  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: {
      id: true, fullName: true,
      dormsBoardingMaster: {
        select: { id: true, name: true, totalCapacity: true, genderPolicy: true,
                  _count: { select: { beds: true } } },
      },
    },
  }).catch(() => null);

  const assignedDormIds = teacher?.dormsBoardingMaster.map((d) => d.id) ?? [];

  const [
    allDorms,
    totalBeds,
    occupiedBeds,
    openDiscipline,
    recentInspections,
    ,
    upcomingCalendar,
  ] = await Promise.all([
    prisma.dormitory.findMany({
      where: { schoolId, id: assignedDormIds.length > 0 ? { in: assignedDormIds } : undefined },
      select: { id: true, name: true, totalCapacity: true, genderPolicy: true,
                _count: { select: { beds: true } } },
    }).catch(() => [] as { id: string; name: string; totalCapacity: number; genderPolicy: string; _count: { beds: number } }[]),
    prisma.bed.count({
      where: { schoolId, dormId: assignedDormIds.length > 0 ? { in: assignedDormIds } : undefined },
    }).catch(() => 0),
    prisma.allocationRecord.count({
      where: {
        schoolId,
        dormId: assignedDormIds.length > 0 ? { in: assignedDormIds } : undefined,
        vacatedDate: null,
        status: "CURRENT",
      },
    }).catch(() => 0),
    // Discipline in assigned dorms only
    prisma.disciplineRecord.count({
      where: { schoolId, status: { in: ["OPEN", "UNDER_REVIEW"] } },
    }).catch(() => 0),
    // Recent dorm inspections
    prisma.dormInspection.findMany({
      where: { schoolId, dormId: assignedDormIds.length > 0 ? { in: assignedDormIds } : undefined },
      orderBy: { inspectionDate: "desc" },
      take: 5,
      select: { id: true, inspectionDate: true, overallScore: true, notes: true,
                dorm: { select: { name: true } } },
    }).catch(() => [] as { id: string; inspectionDate: Date; overallScore: number | null; notes: string | null; dorm: { name: string } }[]),
    // Allocations in last 7 days
    prisma.allocationRecord.count({
      where: {
        schoolId,
        dormId: assignedDormIds.length > 0 ? { in: assignedDormIds } : undefined,
        allocationDate: { gt: new Date(Date.now() - 7 * 86400000) },
      },
    }).catch(() => 0),
    getUpcomingCalendarItems(schoolId, { days: 14, limit: 5 }),
  ]);

  const occupancyPct = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;
  const capacityTotal = allDorms.reduce((s, d) => s + (d.totalCapacity ?? 0), 0);

  const alerts: AlertItem[] = [];
  if (openDiscipline > 0)
    alerts.push({ id: "disc", type: "warn", href: "/staff/records", message: `${openDiscipline} open discipline case${openDiscipline > 1 ? "s" : ""} in boarding.` });
  if (occupancyPct > 95)
    alerts.push({ id: "occ", type: "warn", message: `Dormitory at ${occupancyPct}% capacity. Consider reviewing bed allocations.` });

  const quickLinks: QuickLink[] = [
    { label: "Allocate bed",      href: "/staff/accommodation/allocate",   icon: "BedDouble" },
    { label: "View dorms",        href: "/staff/accommodation",            icon: "Home" },
    { label: "Run inspection",    href: "/staff/accommodation/inspections", icon: "ClipboardList" },
    { label: "Discipline",        href: "/staff/records",                  icon: "AlertTriangle" },
    { label: "Student lookup",    href: "/staff/students",                 icon: "Users" },
    { label: "Calendar",          href: "/staff/calendar",                 icon: "CalendarDays" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink dark:text-dark-text">Boarding — Overview</h1>
        <p className="text-slate text-sm mt-1 dark:text-dark-muted">
          {teacher?.fullName} · {today.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <AlertBanner alerts={alerts} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Dormitories"     value={allDorms.length}  href="/staff/accommodation"         icon={Home}          color="teal" />
        <StatCard label="Total capacity"  value={capacityTotal}    href="/staff/accommodation"         icon={Users}         color="teal" />
        <StatCard label="Occupied beds"   value={occupiedBeds}     href="/staff/accommodation"         icon={CheckCircle}   color={occupancyPct > 95 ? "warn" : "success"}
                  badge={`${occupancyPct}%`} badgeColor={occupancyPct > 95 ? "warn" : "success"} />
        <StatCard label="Open discipline" value={openDiscipline}   href="/staff/records"               icon={AlertTriangle} color={openDiscipline > 0 ? "warn" : "success"} />
      </div>

      {/* Dorm-by-dorm breakdown */}
      {allDorms.length > 0 && (
        <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink dark:text-dark-text">Dormitory status</p>
            <Link href="/staff/accommodation" className="text-xs text-teal hover:underline">Manage</Link>
          </div>
          <div className="space-y-2">
            {allDorms.map((dorm) => {
              const pct = dorm.totalCapacity ? Math.round((dorm._count.beds / dorm.totalCapacity) * 100) : 0;
              return (
                <div key={dorm.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-sm mb-0.5">
                      <span className="text-ink dark:text-dark-text">{dorm.name}</span>
                      <span className="text-xs text-slate dark:text-dark-muted shrink-0">
                        {dorm._count.beds}/{dorm.totalCapacity ?? "?"} · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-line dark:bg-dark-border rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pct > 95 ? "bg-danger" : pct > 80 ? "bg-warn" : "bg-teal"}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                  {dorm.genderPolicy && dorm.genderPolicy !== "MIXED" && (
                    <span className="text-[10px] uppercase font-semibold text-slate bg-line px-1.5 py-0.5 rounded dark:bg-dark-border dark:text-dark-muted">
                      {dorm.genderPolicy}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent inspections */}
      {recentInspections.length > 0 && (
        <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink dark:text-dark-text">Recent inspections</p>
            <Link href="/staff/accommodation/inspections" className="text-xs text-teal hover:underline">All inspections</Link>
          </div>
          <div className="space-y-2">
            {recentInspections.map((ins) => (
              <div key={ins.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="text-ink dark:text-dark-text">{ins.dorm.name}</p>
                  <p className="text-xs text-slate dark:text-dark-muted">
                    {new Date(ins.inspectionDate).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                  </p>
                </div>
                {ins.overallScore != null && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    ins.overallScore >= 80 ? "bg-success-bg text-success" :
                    ins.overallScore >= 60 ? "bg-warn-bg text-warn" : "bg-danger-bg text-danger"
                  }`}>
                    {ins.overallScore}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <QuickLinkGrid links={quickLinks} title="Quick actions" />
      <UpcomingCalendarWidget items={upcomingCalendar} calendarHref="/staff/calendar" />
    </div>
  );
}
