import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";

/**
 * Archives is a grantable permission, so the page is reachable by anyone
 * holding it — but only by them. The sidebar already hides the hub without it;
 * this closes the direct-URL route as well.
 */
export default async function StaffArchivesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (user.role !== "PRINCIPAL") {
    const perms = await getEffectivePermissions(user);
    if (!perms.HISTORY?.canView && !perms.HISTORY?.canManage) redirect("/staff");
  }

  return <>{children}</>;
}
