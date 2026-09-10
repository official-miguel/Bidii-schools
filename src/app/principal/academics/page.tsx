import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ContextNavigation, { type ContextNavItem } from "@/components/ContextNavigation";
import {
  BookOpen,
  Building2,
  Users,
  CalendarDays,
  ClipboardList,
  Calendar,
  BarChart3,
} from "lucide-react";

const ACADEMICS_CONTEXT: ContextNavItem[] = [
  { href: "/principal/departments",    label: "Departments" },
  { href: "/principal/classes",        label: "Classes" },
  { href: "/principal/subjects",       label: "Subjects" },
  { href: "/principal/timetable",      label: "Timetable" },
  { href: "/principal/attendance",     label: "Attendance" },
  { href: "/principal/calendar",       label: "Calendar" },
  { href: "/principal/assessments",    label: "Exams & Analysis" },
];

const TILE_META: Record<string, { icon: React.ElementType; description: string }> = {
  "/principal/departments":    { icon: Building2,     description: "Group subjects and assign department heads." },
  "/principal/classes":        { icon: Users,         description: "Create and manage class groups and their class teachers." },
  "/principal/subjects":       { icon: BookOpen,      description: "Master subject list — core and elective subjects offered." },
  "/principal/timetable":      { icon: CalendarDays,  description: "Build and publish the school timetable." },
  "/principal/attendance":     { icon: ClipboardList, description: "Track and review daily class attendance." },
  "/principal/calendar":       { icon: Calendar,      description: "School events, term dates, and holidays." },
  "/principal/assessments":    { icon: BarChart3,     description: "Exams setup, results entry, and performance analytics." },
};

export default async function PrincipalAcademicsHub() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground mb-1">Academics</h1>
      <p className="text-slate text-sm mb-6">
        Departments, classes, subjects, timetable, attendance, and assessments.
      </p>
      <ContextNavigation items={ACADEMICS_CONTEXT} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-8">
        {ACADEMICS_CONTEXT.map((item) => {
          const meta = TILE_META[item.href];
          const Icon = meta?.icon;
          return (
            <a
              key={item.href}
              href={item.href}
              className="group flex flex-col gap-3 bg-card border border-border rounded-xl p-5
                         hover:border-teal/50 hover:shadow-md transition-all duration-150 dark:hover:border-teal/40"
            >
              {Icon && (
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg
                                 bg-teal/8 text-teal group-hover:bg-teal/15 transition-colors">
                  <Icon className="h-5 w-5" />
                </span>
              )}
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {item.label}
                </h2>
                {meta?.description && (
                  <p className="mt-0.5 text-xs text-slate leading-relaxed">
                    {meta.description}
                  </p>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
