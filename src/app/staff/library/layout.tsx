import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import LibraryShell from "@/components/library/LibraryShell";

export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (user.role === "TEACHER") {
    const { getTeacherEffectivePermissions } = await import("@/lib/permissions");
    const perms = await getTeacherEffectivePermissions(user);
    if (!perms.LIBRARY?.canManage) redirect("/teacher");
  } else if (user.role !== "PRINCIPAL") {
    const perms = await getEffectivePermissions(user);
    if (!perms.LIBRARY?.canView) redirect("/staff");
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
    <LibraryShell
      schoolName={school?.name ?? "Library"}
      roleLabel={roleLabel}
      userInitials={userInitials}
    >
      {children}
    </LibraryShell>
  );
}
