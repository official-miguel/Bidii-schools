import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";

/**
 * Gate for the staff portal's accommodation pages.
 *
 * Staff roles are defined and named by each school (matron, boarding
 * master, house parent, ...), so access is decided by the ACCOMMODATION
 * permission the user's roles carry, never by a role name.
 * getEffectivePermissions() strips modules a school has switched off, so a
 * disabled module fails here too.
 *
 *  • ACCOMMODATION manage (the matron, whatever the school calls it) — the
 *    full accommodation module, teacher or not.
 *  • ACCOMMODATION view only — the read-only dorm views. Teachers have those
 *    in their own portal and are sent there.
 *
 * Anyone without access goes back to their dashboard rather than /login,
 * which looked like being logged out.
 *
 * @param teacherPath where a view-only teacher should see this instead
 */
export async function requireStaffAccommodationAccess(teacherPath: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "PRINCIPAL") redirect("/principal/accommodation");

  const acc = (await getEffectivePermissions(user)).ACCOMMODATION;
  const canManageAll = !!acc?.canManage;

  if (!canManageAll && user.role === "TEACHER") redirect(teacherPath);
  if (!acc?.canView && !canManageAll) redirect("/staff");

  return { user, canManageAll };
}

/** Module screens that change dorms school-wide: managers only. */
export async function requireStaffAccommodationManager() {
  const access = await requireStaffAccommodationAccess("/teacher/accommodation-details");
  if (!access.canManageAll) redirect("/staff/accommodation");
  return access;
}
