import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import FinanceSidebarNav from "@/components/finance/FinanceSidebarNav";
import FinanceTopBar from "@/components/finance/FinanceTopBar";

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

  // Fetch the school name for the sidebar header
  const school = user.schoolId
    ? await prisma.school.findUnique({
        where:  { id: user.schoolId },
        select: { name: true },
      })
    : null;

  // Build display name and initials for the top bar chip
  const roleLabel    = user.role.charAt(0) + user.role.slice(1).toLowerCase();
  const userInitials = (user.email ?? "?")
    .split("@")[0]
    .split(/[._\-]/)
    .map((p: string) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("") || "?";

  return (
    <>
      <FinanceSidebarNav schoolName={school?.name ?? "Finance"} />
      <FinanceTopBar roleLabel={roleLabel} userInitials={userInitials} />
      {/* pt-16 offsets content below the fixed top bar */}
      <div className="pt-16">
        {children}
      </div>
    </>
  );
}
