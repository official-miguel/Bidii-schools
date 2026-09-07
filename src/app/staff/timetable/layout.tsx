import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";

export default async function StaffTimetableLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = await getEffectivePermissions(user);
  const canManage = !!(perms.TIMETABLE?.canManage || perms.TIMETABLE?.canConfigure);

  if (!canManage) {
    // No timetable admin rights — redirect to academic hub
    redirect("/staff/academics");
  }

  return <>{children}</>;
}
