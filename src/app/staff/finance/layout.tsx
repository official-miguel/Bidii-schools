import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import FinanceShell from "@/components/finance/FinanceShell";

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

  const school = user.schoolId
    ? await prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true } })
    : null;

  const roleLabel    = user.role.charAt(0) + user.role.slice(1).toLowerCase();
  const userInitials = (user.email ?? "?")
    .split("@")[0].split(/[._\-]/)
    .map((p: string) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2).join("") || "?";

  return (
    <FinanceShell
      schoolName={school?.name ?? "Finance"}
      roleLabel={roleLabel}
      userInitials={userInitials}
    >
      {children}
    </FinanceShell>
  );
}
