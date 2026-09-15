import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import { assertModuleEnabled } from "@/lib/moduleAccess";
import LibraryClientLayout from "./LibraryClientLayout";

export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Library switched off for this school — render 404 so the section is
  // indistinguishable from a route that was never built. Runs before the
  // role checks below, which would otherwise let a Principal straight in.
  await assertModuleEnabled(user.schoolId, "LIBRARY");

  if (user.role === "TEACHER") {
    const { getTeacherEffectivePermissions } = await import("@/lib/permissions");
    const perms = await getTeacherEffectivePermissions(user);
    if (!perms.LIBRARY?.canManage) redirect("/teacher");
  } else if (user.role !== "PRINCIPAL") {
    const perms = await getEffectivePermissions(user);
    if (!perms.LIBRARY?.canView) redirect("/staff");
  }

  return (
    <LibraryClientLayout>
      {children}
    </LibraryClientLayout>
  );
}
