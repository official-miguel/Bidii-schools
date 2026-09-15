import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isModuleEnabled } from "@/lib/moduleAccess";

/**
 * Staff reports currently means finance reports, so this is a redirect. When
 * the school has Finance switched off there is nothing to redirect to — the
 * finance section does not exist for them — so staff go back to their home
 * rather than landing on a 404.
 */
export default async function StaffReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!(await isModuleEnabled(user.schoolId, "FEES"))) redirect("/staff");

  redirect("/staff/finance/reports");
}
