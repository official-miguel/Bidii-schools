import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import DepartmentsPage from "@/app/principal/departments/page";

/**
 * Anyone granted DEPARTMENTS management (e.g. a teacher with Full Admin
 * Access) previously had no way to reach this at all — it only existed under
 * /principal. This renders the same workspace the Principal uses, guarded by
 * the DEPARTMENTS permission instead of the PRINCIPAL role.
 */
export default async function StaffDepartmentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = await getEffectivePermissions(user);
  if (!perms.DEPARTMENTS?.canManage) redirect("/staff");

  return <DepartmentsPage />;
}
