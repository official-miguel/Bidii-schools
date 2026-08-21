import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import LibrarySidebarNav from "@/components/library/LibrarySidebarNav";
import FinanceTopBar from "@/components/finance/FinanceTopBar";

export default async function LibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  // TEACHER needs LIBRARY.canManage (redirected here from teacher/page.tsx via resolveModulePortal).
  if (user.role === "TEACHER") {
    const { getTeacherEffectivePermissions } = await import("@/lib/permissions");
    const perms = await getTeacherEffectivePermissions(user);
    if (!perms.LIBRARY?.canManage) redirect("/teacher");
  } else if (user.role !== "PRINCIPAL") {
    // ADMIN_STAFF or any other staff role needs LIBRARY.canView at minimum.
    const perms = await getEffectivePermissions(user);
    if (!perms.LIBRARY?.canView) redirect("/staff");
  }

  // Fetch the school name for the sidebar header.
  const school = user.schoolId
    ? await prisma.school.findUnique({
        where:  { id: user.schoolId },
        select: { name: true },
      })
    : null;

  // Build display label and initials for the top bar chip.
  const roleLabel    = user.role.charAt(0) + user.role.slice(1).toLowerCase();
  const userInitials = (user.email ?? "?")
    .split("@")[0]
    .split(/[._\-]/)
    .map((p: string) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("") || "?";

  return (
    <>
      <LibrarySidebarNav schoolName={school?.name ?? "Library"} />
      {/* Re-use FinanceTopBar: same offset + chip design, left-64 aligns with the library sidebar */}
      <FinanceTopBar roleLabel={roleLabel} userInitials={userInitials} />
      {/* pt-16 offsets content below the fixed top bar */}
      <div className="pt-16">
        {children}
      </div>
    </>
  );
}
