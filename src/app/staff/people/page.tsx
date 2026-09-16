import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";

/**
 * /staff/people — the sidebar's "People" hub links here for every role, but
 * staff only ever had /staff/students and /staff/directory underneath it, so
 * this route 404'd whenever a staff-role user clicked the hub icon. Route to
 * whichever module the user actually has, same precedence as the context
 * links on those pages (Students, then Staff).
 */
export default async function StaffPeopleHub() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = await getEffectivePermissions(user);
  if (perms.STUDENTS?.canView || perms.STUDENTS?.canManage) redirect("/staff/students");
  if (perms.STAFF?.canView || perms.STAFF?.canManage) redirect("/staff/directory");
  redirect("/staff");
}
