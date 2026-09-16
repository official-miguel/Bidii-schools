import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import StudentsWorkspace from "@/components/students/StudentsWorkspace";
import type { ContextNavItem } from "@/components/ContextNavigation";

/**
 * /staff/students — the student register for anyone granted the module.
 *
 * This used to be a read-only table with a note promising that editing was
 * "coming soon", which made "manage students" an empty grant: the permission
 * existed, the screen could not act on it. It now renders the same workspace
 * the Principal uses. The API behind each action still checks the permission
 * itself, so a viewer who reaches this page cannot write through it.
 */
export default async function StaffStudentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = await getEffectivePermissions(user);
  if (!perms.STUDENTS?.canView && !perms.STUDENTS?.canManage) redirect("/staff");

  const contextLinks: ContextNavItem[] = [
    { href: "/staff/students", label: "Students" },
    ...(perms.STAFF?.canView || perms.STAFF?.canManage
      ? [{ href: "/staff/directory", label: "Staff" }]
      : []),
    ...(perms.HISTORY?.canView || perms.HISTORY?.canManage
      ? [{ href: "/staff/history", label: "Archives" }]
      : []),
  ];

  return <StudentsWorkspace basePath="/staff" contextLinks={contextLinks} />;
}
