import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import FinanceClientLayout from "./FinanceClientLayout";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (user.role === "TEACHER") {
    const { getTeacherEffectivePermissions } = await import("@/lib/permissions");
    const perms = await getTeacherEffectivePermissions(user);
    if (!perms.FEES?.canManage) redirect("/teacher");
  } else if (user.role !== "PRINCIPAL" && user.role !== "BURSAR") {
    if (user.role !== "ADMIN_STAFF") redirect("/staff");
    const perms = await getEffectivePermissions(user);
    if (!perms.FEES?.canView) redirect("/staff");
  }

  return (
    <FinanceClientLayout>
      {children}
    </FinanceClientLayout>
  );
}
