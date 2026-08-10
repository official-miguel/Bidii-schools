import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectivePermissions, getVisibleHubs, getRoleDisplayLabel } from "@/lib/permissions";
import DashboardShell from "@/components/DashboardShell";
import MustChangePasswordGate from "@/components/MustChangePasswordGate";
import PermissionProvider from "@/components/PermissionProvider";

export default async function StaffPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN_STAFF") {
    redirect("/login");
  }

  const [school, roleLabel, perms] = await Promise.all([
    prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true, motto: true } }),
    getRoleDisplayLabel(user),
    getEffectivePermissions(user),
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
        <PermissionProvider schoolId={user.schoolId} userId={user.id}>
          {children}
        </PermissionProvider>
      </DashboardShell>
    </MustChangePasswordGate>
  );
}
