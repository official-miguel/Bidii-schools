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

export default async function StaffPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Core staff roles always admitted.
  const isCoreStaff = user.role === "ADMIN_STAFF" || user.role === "BURSAR";

  // A TEACHER who manages FEES or LIBRARY is redirected into this portal by
  // teacher/page.tsx.  Let them through only for those module paths.
  let isModuleTeacher = false;
  if (!isCoreStaff && user.role === "TEACHER") {
    const perms = await getTeacherEffectivePermissions(user);
    isModuleTeacher = !!(perms.FEES?.canManage || perms.LIBRARY?.canManage);
  }

  if (!isCoreStaff && !isModuleTeacher) redirect("/login");

  const [school, roleLabel, perms] = await Promise.all([
    prisma.school.findUnique({
      where: { id: user.schoolId! },
      select: { name: true, motto: true },
    }),
    getRoleDisplayLabel(user),
    isCoreStaff
      ? getEffectivePermissions(user)
      : getTeacherEffectivePermissions(user),
  ]);

  const visibleHubs = getVisibleHubs(perms);

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
