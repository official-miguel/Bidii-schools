import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import LibraryClientLayout from "./LibraryClientLayout";

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

  return (
    <LibraryClientLayout>
      {children}
    </LibraryClientLayout>
  );
}
