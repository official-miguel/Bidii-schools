import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getEffectivePermissions,
  getTeacherEffectivePermissions,
  getVisibleHubs,
  getRoleDisplayLabel,
} from "@/lib/permissions";
import DashboardShell from "@/components/DashboardShell";
import MustChangePasswordGate from "@/components/MustChangePasswordGate";
import PermissionProvider from "@/components/PermissionProvider";

/**
 * Modules whose management screens live in the staff portal. A teacher holding
 * manage or configure on any of them has somewhere to go here.
 *
 * STAFF_ROLES is absent on purpose — editing roles stays with the Principal,
 * since anyone who can edit roles can grant themselves the rest.
 *
 * ASSESSMENT_FRAMEWORK is absent too: every head of department gets
 * canConfigure on it from their HOD scope, and their exam-setup screens live
 * in the teacher academic sidebar. Listing it here would march every HOD into
 * a portal they have no other business in.
 */
const STAFF_PORTAL_MODULES = [
  "TIMETABLE", "STUDENTS", "STAFF", "CLASSES", "SUBJECTS", "DEPARTMENTS",
  "ANALYTICS", "REPORTS", "COMMUNICATION", "CALENDAR", "HISTORY",
  "ACCOMMODATION", "ASSESSMENTS", "ATTENDANCE", "FEES", "LIBRARY",
] as const;

export default async function StaffPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Core staff roles always admitted.
  const isCoreStaff = user.role === "ADMIN_STAFF" || user.role === "BURSAR";

  // A TEACHER granted school-wide rights works here too: the admin screens for
  // the timetable, students, staff and the rest live only in this portal, and
  // duplicating them under /teacher would be the same pages three times over.
  //
  // This used to admit a teacher only for FEES or LIBRARY, which left everyone
  // else stranded — a teacher given Full Admin Access held the permissions but
  // had nowhere to use them, and was bounced to /login. Holding manage or
  // configure on any module this portal serves is enough to come in; each
  // section's own layout still checks its own module, so getting through the
  // door grants nothing on its own.
  const perms = isCoreStaff
    ? await getEffectivePermissions(user)
    : user.role === "TEACHER"
      ? await getTeacherEffectivePermissions(user)
      : null;

  if (!isCoreStaff) {
    const admitted =
      perms !== null &&
      STAFF_PORTAL_MODULES.some(
        (m) => perms[m]?.canManage || perms[m]?.canConfigure
      );
    if (!admitted) redirect(user.role === "TEACHER" ? "/teacher" : "/login");
  }

  // The top bar shows the person's name, not their role/title — a teacher
  // routed in here via Full Admin Access is still "Felix Njeri", not
  // "Deputy Principal". ADMIN_STAFF/BURSAR logins have no name field of
  // their own in the schema, so they fall back to the role display label.
  const [school, teacher, roleDisplayLabel] = await Promise.all([
    prisma.school.findUnique({
      where: { id: user.schoolId! },
      select: { name: true, motto: true },
    }),
    user.role === "TEACHER"
      ? prisma.teacher.findUnique({ where: { userId: user.id }, select: { fullName: true } })
      : Promise.resolve(null),
    getRoleDisplayLabel(user),
  ]);

  const roleLabel = teacher?.fullName ?? roleDisplayLabel;

  const visibleHubs = getVisibleHubs(perms ?? {});

  return (
    <MustChangePasswordGate mustChangePassword={user.mustChangePassword}>
      <DashboardShell
        role="staff"
        roleLabel={roleLabel}
        userEmail={user.email}
        avatarUrl={user.avatarUrl ?? null}
        schoolName={school?.name}
        motto={school?.motto}
        visibleHubs={visibleHubs}
      >
        <PermissionProvider schoolId={user.schoolId!} userId={user.id}>
          {children}
        </PermissionProvider>
      </DashboardShell>
    </MustChangePasswordGate>
  );
}
