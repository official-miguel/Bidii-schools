import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ContextNavigation from "@/components/ContextNavigation";
import { getTeacherAcademicsNav } from "@/lib/teacherAcademicsNav";
import {
  BookOpen,
  Building2,
  Users,
  CalendarDays,
  ClipboardList,
  BarChart3,
  NotebookPen,
} from "lucide-react";

// TEACHER_ACADEMICS_NAV is imported from @/lib/teacherAcademicsNav

const TILE_META: Record<string, { icon: React.ElementType; description: string }> = {
  "/teacher/academics/departments": {
    icon: Building2,
    description: "View subject departments and department heads.",
  },
  "/teacher/academics/classes": {
    icon: Users,
    description: "Browse all classes. Your class is highlighted if you are a class teacher.",
  },
  "/teacher/academics/subjects": {
    icon: BookOpen,
    description: "View the master subject list — core and elective subjects offered.",
  },
  "/teacher/timetable": {
    icon: CalendarDays,
    description: "Your personal weekly timetable when published.",
  },
  "/teacher/attendance": {
    icon: ClipboardList,
    description: "Record and review attendance for your classes.",
  },
  "/teacher/assessments": {
    icon: BarChart3,
    description: "Exams setup, results entry, and performance analytics.",
  },
  "/teacher/diary": {
    icon: NotebookPen,
    description: "Post assignments, homework, and subject updates to your classes.",
  },
};

export default async function TeacherAcademicsHub() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: {
      classTeacherOf:             { select: { id: true, name: true } },
      subjectAssignments:         { select: { id: true }, take: 1 },
      electiveGroupTeachers:      { select: { groupId: true }, take: 1 },
      classElectiveGroupTeachers: { select: { groupId: true }, take: 1 },
    },
  });

  const isClassTeacher   = !!teacher?.classTeacherOf;
  const isSubjectTeacher =
    (teacher?.subjectAssignments.length ?? 0) > 0 ||
    (teacher?.electiveGroupTeachers.length ?? 0) > 0 ||
    (teacher?.classElectiveGroupTeachers.length ?? 0) > 0;
  const navItems = getTeacherAcademicsNav(isSubjectTeacher);

  // Tiles shown on the hub overview.
  // Class teachers don't need a Subjects tile — it's view-only and not part
  // of their primary workflow. The nav strip still has it for reference.
  // Non-subject teachers don't get the Diary tile either.
  const tilesToShow = navItems.filter((item) => {
    if (isClassTeacher && item.href === "/teacher/academics/subjects") return false;
    return true;
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-1 dark:text-dark-text">Academics</h1>
      <p className="text-slate text-sm mb-6 dark:text-dark-muted">
        Departments, classes, subjects, timetable, attendance, and assessments.
        {isClassTeacher && (
          <span className="ml-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal/10 text-teal text-xs font-medium">
            Class Teacher — {teacher?.classTeacherOf?.name}
          </span>
        )}
      </p>

      <ContextNavigation items={navItems} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        {tilesToShow.map((item) => {
          const meta = TILE_META[item.href];
          const Icon = meta?.icon;
          return (
            <a
              key={item.href}
              href={item.href}
              className="group flex flex-col gap-3 bg-white border border-line rounded-xl p-5
                         hover:border-teal/50 hover:shadow-md transition-all duration-150
                         dark:bg-dark-surface dark:border-dark-border dark:hover:border-teal/40"
            >
              {Icon && (
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg
                             bg-teal/8 text-teal group-hover:bg-teal/15 transition-colors"
                >
                  <Icon className="h-5 w-5" />
                </span>
              )}
              <div>
                <h2 className="text-sm font-semibold text-ink dark:text-dark-text">
                  {item.label}
                </h2>
                {meta?.description && (
                  <p className="mt-0.5 text-xs text-slate leading-relaxed dark:text-dark-muted">
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
