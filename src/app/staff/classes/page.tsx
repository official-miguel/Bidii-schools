import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import ClassesPage from "@/app/principal/classes/page";

/**
 * /staff/classes used to be a one-line redirect into /principal/classes,
 * which admits nobody but the Principal — so anyone granted CLASSES
 * management (e.g. a teacher with Full Admin Access) hit a dead end. This
 * renders the same workspace the Principal uses, guarded by the CLASSES
 * permission instead of the PRINCIPAL role.
 */
export default async function StaffClassesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = await getEffectivePermissions(user);
  if (!perms.CLASSES?.canManage) redirect("/staff");

  return <ClassesPage />;
}
