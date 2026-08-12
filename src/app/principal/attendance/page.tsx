import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui";
import AttendanceView from "@/components/AttendanceView";
import AttendanceStats from "@/components/AttendanceStats";
import AttendanceAnalytics from "@/components/AttendanceAnalytics";
import ContextNavigation from "@/components/ContextNavigation";

export default async function PrincipalAttendancePage() {
  const user = await getCurrentUser();
  const classes = await prisma.schoolClass.findMany({
    where: { schoolId: user!.schoolId! },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  return (
    <div>
      <ContextNavigation
        items={[
          { href: "/principal/classes", label: "Classes" },
          { href: "/principal/subjects", label: "Subjects" },
          { href: "/principal/timetable", label: "Timetable" },
          { href: "/principal/calendar", label: "Calendar" },
          { href: "/principal/assessments", label: "Exams & Analysis" },
        ]}
      />

      <PageHeader
        title="Attendance"
        description="View and record attendance for any class. Class teachers can also take attendance for their own class from the teacher portal."
      />

      <div className="space-y-8">
        <div>
          <h2 className="text-base font-semibold text-ink mb-3">Today at a glance</h2>
          <AttendanceStats />
        </div>

        <div>
          <h2 className="text-base font-semibold text-ink mb-3">Take or review attendance</h2>
          {classes.length === 0 ? (
            <EmptyState message="No classes set up yet. Add a class first." />
          ) : (
            <AttendanceView classes={classes} />
          )}
        </div>

        <div>
          <h2 className="text-base font-semibold text-ink mb-1">Attendance analytics</h2>
          <p className="text-slate text-sm mb-3">
            Analyse attendance over a period by form, stream, or individual student. Open a student
            from the Students page to see their full attendance history.
          </p>
          <AttendanceAnalytics />
        </div>
      </div>
    </div>
  );
}
