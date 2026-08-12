import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui";
import AttendanceView from "@/components/AttendanceView";
import AttendanceStats from "@/components/AttendanceStats";
import AttendanceAnalytics from "@/components/AttendanceAnalytics";

export default async function StaffAttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Guard: must have ATTENDANCE canView or canManage permission.
  const perms = await getEffectivePermissions(user);
  const attendancePerm = perms["ATTENDANCE"];
  if (!attendancePerm?.canView && !attendancePerm?.canManage) {
    redirect("/staff/dashboard");
  }

  const classes = await prisma.schoolClass.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="View and record attendance for any class."
      />

      <div className="space-y-8">
        <div>
          <h2 className="text-base font-semibold text-ink mb-3">Today at a glance</h2>
          <AttendanceStats />
        </div>

        <div>
          <h2 className="text-base font-semibold text-ink mb-3">Take or review attendance</h2>
          {classes.length === 0 ? (
            <EmptyState message="No classes set up yet. Ask the principal to add a class first." />
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
