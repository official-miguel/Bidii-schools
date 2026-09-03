import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ContextNavigation from "@/components/ContextNavigation";
import AttendancePageTabs from "@/components/AttendancePageTabs";
import TeacherAttendanceOverview from "@/components/TeacherAttendanceOverview";
import AttendanceAnalytics from "@/components/AttendanceAnalytics";
import { getTeacherAcademicsNav } from "@/lib/teacherAcademicsNav";

export default async function TeacherAttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: {
      classTeacherOf: { select: { id: true, name: true } },
      subjectAssignments: {
        select: { schoolClass: { select: { id: true, name: true } } },
      },
      classElectiveGroupTeachers: {
        select: { schoolClass: { select: { id: true, name: true } } },
      },
    },
  });

  // Build a deduped list of taught classes — classTeacherOf pinned first
  const classSet = new Map<string, { id: string; name: string }>();
  if (teacher?.classTeacherOf) classSet.set(teacher.classTeacherOf.id, teacher.classTeacherOf);
  for (const a of teacher?.subjectAssignments ?? []) classSet.set(a.schoolClass.id, a.schoolClass);
  for (const e of teacher?.classElectiveGroupTeachers ?? [])
    classSet.set(e.schoolClass.id, e.schoolClass);
  const taughtClasses = Array.from(classSet.values());

  const isClassTeacher = !!teacher?.classTeacherOf;
  const isSubjectTeacher =
    (teacher?.subjectAssignments.length ?? 0) > 0 ||
    (teacher?.classElectiveGroupTeachers.length ?? 0) > 0;
  const hasAnyClass    = taughtClasses.length > 0;
  const navItems = getTeacherAcademicsNav(isSubjectTeacher);

  // Teacher with no assignments sees a clear message
  if (!hasAnyClass) {
    return (
      <div>
        <ContextNavigation items={navItems} />
        <PageHeader title="Attendance" />
        <p className="text-slate text-sm dark:text-dark-muted">
          Attendance is available once you have been assigned to teach a class.
          You aren&apos;t assigned to any class yet — ask the principal to assign you one first.
        </p>
      </div>
    );
  }

  const taughtClassIds = taughtClasses.map((c) => c.id);

  return (
    <div>
      <ContextNavigation items={navItems} />

      <PageHeader
        title="Attendance"
        description={
          isClassTeacher
            ? `Record and review attendance for ${teacher?.classTeacherOf?.name} and your subject classes.`
            : "Review attendance for the classes you teach."
        }
      />

      <div className="space-y-8">
        {/* ── Overview strip at the top ──────────────────────────────── */}
        <div>
          <h2 className="text-base font-semibold text-ink mb-3 dark:text-dark-text">
            Today at a glance
          </h2>
          <TeacherAttendanceOverview
            classIds={taughtClassIds}
            classTeacherOfId={teacher?.classTeacherOf?.id ?? null}
          />
        </div>

        {/* ── Attendance submission / review tabs ───────────────────── */}
        <div>
          <h2 className="text-base font-semibold text-ink mb-3 dark:text-dark-text">
            {isClassTeacher ? "Take or receive attendance" : "Review attendance"}
          </h2>
          <AttendancePageTabs
            isClassTeacher={isClassTeacher}
            classTeacherOf={teacher?.classTeacherOf ?? null}
            taughtClasses={taughtClasses}
          />
        </div>

        {/* ── Analytics below attendance ────────────────────────────── */}
        <div>
          <h2 className="text-base font-semibold text-ink mb-1 dark:text-dark-text">
            Attendance analytics
          </h2>
          <p className="text-slate text-sm mb-3 dark:text-dark-muted">
            Analyse attendance trends for your classes over a selected period.
          </p>
          <AttendanceAnalytics classIds={taughtClassIds} />
        </div>
      </div>
    </div>
  );
}
