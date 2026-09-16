import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import StaffWorkspace from "@/components/staff/StaffWorkspace";
import type { ContextNavItem } from "@/components/ContextNavigation";

/**
 * /staff/directory — the staff register for anyone granted the module.
 *
 * Admitted on the STAFF permission, not on job title: a teacher granted staff
 * management was previously bounced to /login from here, which made the
 * permission unusable for them.
 *
 * This used to be a read-only wall of cards, so "manage staff" could not
 * actually register, edit, or retire anyone. It now renders the same workspace
 * the Principal uses — minus the Roles & Permissions tab, which stays with the
 * Principal because editing a role is how you would grant yourself the rest.
 */
export default async function StaffDirectoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = await getEffectivePermissions(user);
  if (!perms.STAFF?.canView && !perms.STAFF?.canManage) redirect("/staff");

  const contextLinks: ContextNavItem[] = [
    ...(perms.STUDENTS?.canView || perms.STUDENTS?.canManage
      ? [{ href: "/staff/students", label: "Students" }]
      : []),
    { href: "/staff/directory", label: "Staff" },
    ...(perms.HISTORY?.canView || perms.HISTORY?.canManage
      ? [{ href: "/staff/history", label: "Archives" }]
      : []),
  ];

  return <StaffWorkspace contextLinks={contextLinks} showRoles={false} />;
}
