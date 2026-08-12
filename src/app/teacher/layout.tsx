import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getEffectivePermissions,
  getVisibleHubs,
} from "@/lib/permissions";
import DashboardShell from "@/components/DashboardShell";
import MustChangePasswordGate from "@/components/MustChangePasswordGate";
import PermissionProvider from "@/components/PermissionProvider";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const [school, teacher, perms] = await Promise.all([
    prisma.school.findUnique({ where: { id: user.schoolId! }, select: { name: true, motto: true } }),
    prisma.teacher.findUnique({ where: { userId: user.id }, select: { fullName: true } }),
    getEffectivePermissions(user),  // now always calls getTeacherEffectivePermissions
  ]);

  const roleLabel = teacher?.fullName ?? "Teacher";

  // Always compute visible hubs from the resolver output.
  // getVisibleHubs always includes "dashboard".
  // getTeacherEffectivePermissions baseline gives student-life + academic.
  // Class/subject/HOD/dorm assignments add more.
  const visibleHubs = getVisibleHubs(perms);

  // Always add "calendar" and "people" for teachers (they have a People page
  // and calendar access). The baseline grant doesn't explicitly grant CALENDAR
  // but teachers always have it — add it manually here.
  visibleHubs.add("calendar");
  visibleHubs.add("people");

  // Teachers never get the "administration" hub in the main sidebar.
  // HOD settings and exam setup live inside the academic inner sidebar.
  visibleHubs.delete("administration");

  return (
    <MustChangePasswordGate mustChangePassword={user.mustChangePassword}>
      <DashboardShell
        role="teacher"
        roleLabel={roleLabel}
        userEmail={user.email}
        avatarUrl={user.avatarUrl ?? null}
        schoolName={school?.name}
        motto={school?.motto}
        visibleHubs={visibleHubs as Parameters<typeof DashboardShell>[0]["visibleHubs"]}
      >
        <PermissionProvider schoolId={user.schoolId!} userId={user.id}>
          {children}
        </PermissionProvider>
      </DashboardShell>
    </MustChangePasswordGate>
  );
}
