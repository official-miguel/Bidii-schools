import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import SubjectsPage from "@/app/principal/subjects/page";

/**
 * /staff/subjects used to be a one-line redirect into /principal/subjects,
 * which admits nobody but the Principal — so anyone granted SUBJECTS
 * management (e.g. a teacher with Full Admin Access) hit a dead end. This
 * renders the same workspace the Principal uses, guarded by the SUBJECTS
 * permission instead of the PRINCIPAL role.
 */
export default async function StaffSubjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = await getEffectivePermissions(user);
  if (!perms.SUBJECTS?.canManage) redirect("/staff");

  return <SubjectsPage />;
}
