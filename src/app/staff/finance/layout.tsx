import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import FinanceSidebarNav from "@/components/finance/FinanceSidebarNav";

export default async function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  // PRINCIPAL has read-only access. BURSAR has full access.
  // ADMIN_STAFF needs FEES.canView.
  // TEACHER needs FEES.canManage (redirected here from teacher/page.tsx).
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
    /*
     * FinanceSidebarNav renders as a fixed full-height panel on desktop (z-40,
     * w-64), visually replacing the generic HubSidebar icon rail.
     * DashboardShell is told to use md:pl-64 via hideHubSidebar=true on the
     * outer staff layout, so no extra wrapper is needed here.
     *
     * On mobile, FinanceSidebarNav renders a top accordion instead.
     */
    <>
      <FinanceSidebarNav />
      {children}
    </>
  );
}
